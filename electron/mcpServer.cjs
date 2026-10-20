// In-app MCP server for ChatGPT (custom connector, Developer mode).
//
// Exposes the CRM tools (crmTools.cjs) over MCP Streamable HTTP, protected by a
// minimal OAuth 2.1 authorization server that lives in this same process:
//   - /.well-known/oauth-authorization-server   (RFC 8414 metadata)
//   - /.well-known/oauth-protected-resource      (RFC 9728 metadata)
//   - POST /register                             (RFC 7591 dynamic client registration)
//   - GET  /authorize                            (consent page shown INSIDE the app window)
//   - POST /token                                (authorization_code + PKCE, refresh_token)
//   - POST/GET/DELETE /mcp                       (bearer-protected MCP endpoint)
//
// Per-user auth: the only way to obtain a token is to approve the consent page
// that this app opens, so only the person sitting at this computer can grant
// ChatGPT access to this CRM. Nothing administrative ships with the installer.
// The server binds to 127.0.0.1 only; a tunnel (tunnel.cjs) exposes it over
// HTTPS for the connector handshake.

const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const crm = require('./crmTools.cjs');

const SCOPE = 'crm.read crm.write';
const ACCESS_TTL_S = 60 * 60 * 24 * 30; // 30 days; revocable from Settings

// --- in-memory auth state (persisted tokens live in authStore below) -------------
let publicOrigin = null; // e.g. https://xxxx.trycloudflare.com (set when the tunnel is up)
const clients = new Map(); // client_id -> { redirect_uris, client_name }
const codes = new Map(); // code -> { client_id, redirect_uri, challenge, method, exp }
let authStore = { tokens: {}, refresh: {} }; // accessToken -> {exp, client}; refreshToken -> {client}
let saveAuthStore = () => {};
let onConsent = null; // (info) => Promise<boolean>  — set by main.cjs to show the consent UI
const log = (...a) => console.log('[mcp]', ...a);
const auditLog = [];

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}
function originOf(req) {
  if (publicOrigin) return publicOrigin;
  const host = req.headers.host || '127.0.0.1';
  return `http://${host}`;
}
function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function parseForm(raw, contentType) {
  if ((contentType || '').includes('application/json')) return raw ? JSON.parse(raw) : {};
  return Object.fromEntries(new URLSearchParams(raw));
}

function metadata(origin) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    scopes_supported: SCOPE.split(' '),
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
  };
}

function validAccessToken(token) {
  const t = authStore.tokens[token];
  if (!t) return null;
  if (t.exp < Date.now() / 1000) {
    delete authStore.tokens[token];
    saveAuthStore(authStore);
    return null;
  }
  return t;
}

function issueTokens(client_id) {
  const access = b64url(crypto.randomBytes(32));
  const refresh = b64url(crypto.randomBytes(32));
  authStore.tokens[access] = { client: client_id, exp: Math.floor(Date.now() / 1000) + ACCESS_TTL_S, issuedAt: new Date().toISOString() };
  authStore.refresh[refresh] = { client: client_id, issuedAt: new Date().toISOString() };
  saveAuthStore(authStore);
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: SCOPE };
}

// --- MCP server (one Server + transport per session) --------------------------------
function buildMcpServer(dataDir) {
  const server = new Server({ name: 'prospecting-copilot-crm', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: crm.TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.schema })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = crm.TOOLS.find((t) => t.name === req.params.name);
    if (!tool) return { content: [{ type: 'text', text: `Unknown tool ${req.params.name}` }], isError: true };
    const started = Date.now();
    try {
      const result = tool.handler(dataDir, req.params.arguments || {});
      auditLog.unshift({ at: new Date().toISOString(), tool: tool.name, ok: true, ms: Date.now() - started, args: summarizeArgs(req.params.arguments) });
      auditLog.splice(200);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      auditLog.unshift({ at: new Date().toISOString(), tool: tool.name, ok: false, error: e.message, args: summarizeArgs(req.params.arguments) });
      auditLog.splice(200);
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  });
  return server;
}
function summarizeArgs(a) {
  try {
    const s = JSON.stringify(a || {});
    return s.length > 300 ? s.slice(0, 300) + '…' : s;
  } catch {
    return '';
  }
}

const sessions = new Map(); // mcp-session-id -> transport

async function handleMcp(req, res, dataDir) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const origin = originOf(req);
  if (!token || !validAccessToken(token)) {
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
    });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }
  const sid = req.headers['mcp-session-id'];
  let transport = sid ? sessions.get(sid) : null;
  if (!transport) {
    if (req.method !== 'POST') return json(res, 400, { error: 'no session' });
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => sessions.set(id, transport),
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    await buildMcpServer(dataDir).connect(transport);
  }
  const raw = req.method === 'POST' ? await readBody(req) : undefined;
  await transport.handleRequest(req, res, raw ? JSON.parse(raw) : undefined);
}

// --- consent page (rendered inside the app's own window) --------------------------------
function consentHtml(params, clientName) {
  const hidden = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, '&quot;')}">`)
    .join('');
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>Autorizar acceso al CRM</title>
<style>body{font-family:system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 20px;color:#0f172a}
.card{border:1px solid #e2e8f0;border-radius:12px;padding:24px}button{padding:10px 18px;border-radius:8px;border:0;font-size:15px;cursor:pointer}
.ok{background:#2563eb;color:#fff}.no{background:#f1f5f9;margin-left:8px}ul{color:#334155}</style>
<div class="card"><h2>Prospecting Copilot — acceso al CRM</h2>
<p><b>${clientName}</b> pide permiso para usar las herramientas del CRM de esta app en tu nombre.</p>
<ul><li>Leer campañas, tareas de investigación, personas contactadas y conversaciones</li>
<li>Guardar candidatos (fichas) y borradores de mensajes para que los revises en la app</li></ul>
<p>No puede enviar invitaciones ni mensajes. Podés revocar el acceso desde Configuración.</p>
<form method="post" action="/authorize">${hidden}
<button class="ok" name="decision" value="allow">Permitir</button>
<button class="no" name="decision" value="deny">Denegar</button></form></div></html>`;
}

async function handleAuthorize(req, res) {
  const url = new URL(req.url, 'http://x');
  let p = Object.fromEntries(url.searchParams);
  let decision = null;
  if (req.method === 'POST') {
    p = parseForm(await readBody(req), req.headers['content-type']);
    decision = p.decision;
  }
  const client = clients.get(p.client_id);
  if (!client) return json(res, 400, { error: 'invalid_client' });
  if (!client.redirect_uris.includes(p.redirect_uri)) return json(res, 400, { error: 'invalid_redirect_uri' });
  if (p.response_type !== 'code' || p.code_challenge_method !== 'S256' || !p.code_challenge) {
    return json(res, 400, { error: 'invalid_request', detail: 'PKCE S256 required' });
  }
  const redirect = new URL(p.redirect_uri);
  if (decision === null) {
    // Consent is decided by the person at this computer. If the app provides a
    // native prompt (main.cjs) use it; otherwise render the HTML page.
    if (onConsent) {
      const ok = await onConsent({ clientName: client.client_name, scope: p.scope || SCOPE });
      decision = ok ? 'allow' : 'deny';
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(consentHtml({ client_id: p.client_id, redirect_uri: p.redirect_uri, state: p.state || '', code_challenge: p.code_challenge, code_challenge_method: 'S256', response_type: 'code', scope: p.scope || SCOPE }, client.client_name));
      return;
    }
  }
  if (decision !== 'allow') {
    redirect.searchParams.set('error', 'access_denied');
    if (p.state) redirect.searchParams.set('state', p.state);
  } else {
    const code = b64url(crypto.randomBytes(32));
    codes.set(code, { client_id: p.client_id, redirect_uri: p.redirect_uri, challenge: p.code_challenge, exp: Date.now() + 5 * 60 * 1000 });
    redirect.searchParams.set('code', code);
    if (p.state) redirect.searchParams.set('state', p.state);
    log('consent granted to', client.client_name);
  }
  res.writeHead(302, { Location: redirect.toString() });
  res.end();
}

async function handleToken(req, res) {
  const p = parseForm(await readBody(req), req.headers['content-type']);
  if (p.grant_type === 'authorization_code') {
    const c = codes.get(p.code);
    codes.delete(p.code);
    if (!c || c.exp < Date.now()) return json(res, 400, { error: 'invalid_grant' });
    if (c.client_id !== p.client_id) return json(res, 400, { error: 'invalid_client' });
    if (p.redirect_uri && p.redirect_uri !== c.redirect_uri) return json(res, 400, { error: 'invalid_grant' });
    const expected = b64url(crypto.createHash('sha256').update(String(p.code_verifier || '')).digest());
    if (expected !== c.challenge) return json(res, 400, { error: 'invalid_grant', detail: 'pkce' });
    return json(res, 200, issueTokens(c.client_id), { 'Cache-Control': 'no-store' });
  }
  if (p.grant_type === 'refresh_token') {
    const r = authStore.refresh[p.refresh_token];
    if (!r) return json(res, 400, { error: 'invalid_grant' });
    delete authStore.refresh[p.refresh_token];
    return json(res, 200, issueTokens(r.client), { 'Cache-Control': 'no-store' });
  }
  return json(res, 400, { error: 'unsupported_grant_type' });
}

async function handleRegister(req, res) {
  const body = JSON.parse((await readBody(req)) || '{}');
  const redirect_uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u) => /^https:\/\//.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)/.test(u)) : [];
  if (!redirect_uris.length) return json(res, 400, { error: 'invalid_redirect_uri' });
  const client_id = b64url(crypto.randomBytes(16));
  clients.set(client_id, { redirect_uris, client_name: String(body.client_name || 'MCP client').slice(0, 80) });
  log('client registered:', body.client_name, redirect_uris);
  return json(res, 201, {
    client_id,
    client_name: body.client_name,
    redirect_uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: SCOPE,
  });
}

// --- server ----------------------------------------------------------------------------------
let httpServer = null;
let port = null;

function start({ dataDir, persistedAuth, persistAuth, consent }) {
  if (httpServer) return { port };
  if (persistedAuth) authStore = persistedAuth;
  if (persistAuth) saveAuthStore = persistAuth;
  if (consent) onConsent = consent;
  httpServer = http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://x').pathname;
      const origin = originOf(req);
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS' });
        return res.end();
      }
      if (path === '/.well-known/oauth-authorization-server' || path.startsWith('/.well-known/oauth-authorization-server/')) return json(res, 200, metadata(origin));
      if (path === '/.well-known/oauth-protected-resource' || path.startsWith('/.well-known/oauth-protected-resource/')) {
        return json(res, 200, { resource: `${origin}/mcp`, authorization_servers: [origin], scopes_supported: SCOPE.split(' '), bearer_methods_supported: ['header'] });
      }
      if (path === '/register' && req.method === 'POST') return handleRegister(req, res);
      if (path === '/authorize') return handleAuthorize(req, res);
      if (path === '/token' && req.method === 'POST') return handleToken(req, res);
      if (path === '/mcp') return handleMcp(req, res, dataDir);
      if (path === '/health') return json(res, 200, { ok: true, tools: crm.TOOLS.length, publicOrigin });
      json(res, 404, { error: 'not_found' });
    } catch (e) {
      log('error', e.message);
      if (!res.headersSent) json(res, 500, { error: e.message });
    }
  });
  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', () => {
      port = httpServer.address().port;
      log('listening on 127.0.0.1:' + port);
      resolve({ port });
    });
  });
}

function stop() {
  for (const t of sessions.values()) t.close?.();
  sessions.clear();
  if (httpServer) httpServer.close();
  httpServer = null;
  port = null;
}

function setPublicOrigin(origin) {
  publicOrigin = origin ? origin.replace(/\/$/, '') : null;
}

function status() {
  return {
    running: Boolean(httpServer),
    port,
    publicOrigin,
    connectorUrl: publicOrigin ? `${publicOrigin}/mcp` : null,
    clients: [...clients.values()].map((c) => c.client_name),
    activeTokens: Object.keys(authStore.tokens).length,
    sessions: sessions.size,
    audit: auditLog.slice(0, 50),
  };
}

function revokeAll() {
  authStore = { tokens: {}, refresh: {} };
  saveAuthStore(authStore);
  for (const t of sessions.values()) t.close?.();
  sessions.clear();
}

module.exports = { start, stop, status, setPublicOrigin, revokeAll, SCOPE };
