// Electron main process — Prospecting Copilot desktop shell.
// Responsibilities: window lifecycle, file-backed persistence (IPC),
// managed-Chrome bridge (CDP), ChatGPT docked view, cloud relay for the MCP connector.
// The renderer is the SAME React app, running in "desktop" mode.

const { app, BrowserWindow, dialog, ipcMain, shell, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const storeFile = require('./storeFile.cjs');
const bridge = require('./bridge.cjs');
const mcpServer = require('./mcpServer.cjs');
const crmTools = require('./crmTools.cjs');
const relay = require('./relay.cjs');
const chatgptView = require('./chatgptView.cjs');

let mainWindow = null;

const isDev = !app.isPackaged;

/** Resolve the directory where user data lives (state + backups + secrets). */
function dataDir() {
  const dir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: 'Prospecting Copilot',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload needs fs for the synchronous state boot read
    },
  });

  // External links (LinkedIn profiles etc.) open in the system browser,
  // never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  return win;
}

// ---------------------------------------------------------------------------
// Local MCP server (loopback only) + persisted token store. Used only by the
// PC_MCP_SELFTEST harness; ChatGPT goes through the hosted endpoint + relay.
// ---------------------------------------------------------------------------

const MCP_AUTH_FILE = () => path.join(dataDir(), 'mcp-auth.json');

function readMcpAuth() {
  try {
    return JSON.parse(fs.readFileSync(MCP_AUTH_FILE(), 'utf8'));
  } catch {
    return null;
  }
}
function writeMcpAuth(store) {
  fs.writeFileSync(MCP_AUTH_FILE(), JSON.stringify(store), 'utf8');
}

/** Native consent prompt inside the app: only the person at this PC can grant. */
async function consentPrompt({ clientName }) {
  if (process.env.PC_MCP_AUTOCONSENT === '1') return true;
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  const r = await dialog.showMessageBox(parent, {
    type: 'question',
    buttons: ['Permitir', 'Denegar'],
    defaultId: 0,
    cancelId: 1,
    title: 'Acceso al CRM',
    message: `"${clientName}" pide usar las herramientas del CRM de Prospecting Copilot.`,
    detail:
      'Puede leer campañas, tareas, personas contactadas y conversaciones, y guardar candidatos y borradores para tu revisión. No puede enviar nada. Revocable desde Configuración.',
  });
  return r.response === 0;
}

function notifyCrmChanged() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('crm:refresh');
  }
}

async function startMcp() {
  crmTools.setChangeListener(notifyCrmChanged);
  const { port } = await mcpServer.start({
    dataDir: dataDir(),
    persistedAuth: readMcpAuth(),
    persistAuth: writeMcpAuth,
    consent: consentPrompt,
  });
  const saved = readSetting('mcpPublicOrigin');
  if (saved) mcpServer.setPublicOrigin(saved);
  return port;
}

const SETTINGS_FILE = () => path.join(dataDir(), 'desktop-settings.json');
function readSetting(key) {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8'))[key];
  } catch {
    return undefined;
  }
}
function writeSetting(key, value) {
  let all = {};
  try {
    all = JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8'));
  } catch {
    /* first write */
  }
  all[key] = value;
  fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(all, null, 2), 'utf8');
}

// Local MCP server: kept for the in-process harness (PC_MCP_SELFTEST) only.
// ChatGPT reaches the CRM through the HOSTED endpoint (Supabase Edge Function
// crm-mcp) + the relay below; no tunnel or inbound port is opened by the app.

ipcMain.handle('cloud:status', () => relay.status());
ipcMain.handle('cloud:sendCode', (_e, email) => relay.sendCode(email));
ipcMain.handle('cloud:verifyCode', (_e, email, code) => relay.verifyCode(email, code));
ipcMain.handle('cloud:signOut', () => relay.signOut());
ipcMain.handle('cloud:syncNow', async () => {
  await relay.pushSnapshot();
  await relay.pollInbox();
  return relay.status();
});
ipcMain.handle('store:read', () => storeFile.readStateSync(dataDir()));

// ---------------------------------------------------------------------------
// ChatGPT docked inside the main window (chatgptView.cjs). The user's own web
// session; no OpenAI API. Directives are typed + sent and delivery confirmed.
// ---------------------------------------------------------------------------

chatgptView.setNavigateListener((nav) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('chatgpt:navigated', nav);
});
ipcMain.handle('chatgpt:show', (_e, bounds) => chatgptView.show(mainWindow, bounds));
ipcMain.handle('chatgpt:setBounds', (_e, bounds) => chatgptView.setBounds(bounds));
ipcMain.handle('chatgpt:hide', () => chatgptView.hide());
ipcMain.handle('chatgpt:open', (_e, url) => chatgptView.open(mainWindow, url));
ipcMain.handle('chatgpt:status', () => chatgptView.status());
ipcMain.handle('chatgpt:sendDirective', (_e, text, conversationUrl) =>
  chatgptView.sendDirective(mainWindow, String(text || ''), { conversationUrl: conversationUrl || undefined }),
);

// ---------------------------------------------------------------------------
// IPC: persistence
// ---------------------------------------------------------------------------

ipcMain.handle('store:write', (_e, json) => {
  if (typeof json !== 'string' || json.length > 50 * 1024 * 1024) {
    throw new Error('Invalid state payload');
  }
  // Defense in depth: never persist anything shaped like an API key.
  if (/sk-ant-[A-Za-z0-9_-]+/.test(json)) {
    throw new Error('Refusing to persist state containing an API key pattern');
  }
  const out = storeFile.writeState(dataDir(), json);
  relay.schedulePush();
  return out;
});

ipcMain.handle('store:backups', () => storeFile.listBackups(dataDir()));

// ---------------------------------------------------------------------------
// IPC: Chrome bridge
// ---------------------------------------------------------------------------

ipcMain.handle('bridge:status', () => bridge.status());
ipcMain.handle('bridge:launch', (_e, startUrl) => bridge.launchManagedChrome(dataDir(), startUrl));
ipcMain.handle('bridge:readPage', () => bridge.readActivePage());
ipcMain.handle('bridge:openUrl', (_e, url) => bridge.openInManagedChrome(url));
ipcMain.handle('bridge:stop', () => bridge.stop());

/**
 * The innocuous end-to-end test (M2): launch the managed Chrome, navigate to a
 * harmless public page, read its title/text via CDP, and hand the result back
 * so the renderer records it in the CRM. Touches nothing related to LinkedIn
 * and sends nothing anywhere.
 */
ipcMain.handle('bridge:selfTest', async () => {
  const testUrl = 'https://example.com/';
  await bridge.launchManagedChrome(dataDir(), testUrl);
  const page = await bridge.readActivePage();
  return {
    ok: Boolean(page.title),
    url: page.url,
    title: page.title,
    textSnippet: (page.text || '').slice(0, 280),
    readAt: new Date().toISOString(),
  };
});

// ---------------------------------------------------------------------------
// Legacy: an Anthropic API key saved by an earlier build (BYOK assistant, now
// removed). Never used. Settings shows whether one exists and can delete it.
// ---------------------------------------------------------------------------

const LEGACY_SECRET_FILE = () => path.join(dataDir(), 'secrets.bin');
ipcMain.handle('legacyKey:status', () => ({ stored: fs.existsSync(LEGACY_SECRET_FILE()) }));
ipcMain.handle('legacyKey:delete', () => {
  try {
    fs.rmSync(LEGACY_SECRET_FILE());
  } catch {
    /* already gone */
  }
  return { stored: false };
});

// ---------------------------------------------------------------------------
// Self-verification harnesses (CI/dev): exercise the REAL code paths headlessly.
//   PC_SELFTEST=1 → bridge self-test + persist result into the CRM state file.
//   PC_SMOKE=1    → boot the renderer, assert desktop mode + UI mounted.
// ---------------------------------------------------------------------------

async function runBridgeSelfTest() {
  const dir = dataDir();
  try {
    const testUrl = 'https://example.com/';
    await bridge.launchManagedChrome(dir, testUrl);
    const page = await bridge.readActivePage();
    const entry = {
      at: new Date().toISOString(),
      url: page.url,
      title: page.title,
      snippet: (page.text || '').slice(0, 280),
      ok: Boolean(page.title),
    };
    // Persist into the CRM state file (same shape the UI writes).
    const raw = storeFile.readStateSync(dir);
    const state = raw ? JSON.parse(raw) : null;
    if (state) {
      state.bridgeLog = [entry, ...(state.bridgeLog || [])].slice(0, 50);
      storeFile.writeState(dir, JSON.stringify(state));
    }
    console.log(
      'SELFTEST_RESULT ' + JSON.stringify({ ...entry, persistedToState: Boolean(state) }),
    );
    await bridge.stop();
    app.exit(entry.ok ? 0 : 1);
  } catch (e) {
    console.error('SELFTEST_ERROR ' + e.message);
    await bridge.stop().catch(() => {});
    app.exit(1);
  }
}

async function runRendererSmoke() {
  const win = createWindow();
  relay.init({ dataDir, safeStorage, crmTools, storeFile, appVersion: app.getVersion(), onApplied: notifyCrmChanged });
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log('RENDERER_CONSOLE ' + message.slice(0, 500));
  });
  win.webContents.on('did-finish-load', async () => {
    try {
      await new Promise((r) => setTimeout(r, 1500));
      const probe = await win.webContents.executeJavaScript(
        `JSON.stringify({
           desktopMode: Boolean(window.desktop && window.desktop.isDesktop),
           title: document.title,
           hasSidebar: document.body.innerText.includes('Prospecting Copilot'),
           hasAssistantNav: document.body.innerText.includes('Asistente'),
           campaigns: (JSON.parse(localStorage.getItem('prospecting-copilot-state-v1')||'{}').workspaces||[]).map(w=>w.name)
         })`,
      );
      // Circuit check: open Campañas, then write through the MCP tool layer
      // (what ChatGPT's connector does) and assert the renderer refreshes live.
      await win.webContents.executeJavaScript(`location.hash = '#/campaigns'`);
      await new Promise((r) => setTimeout(r, 800));
      const stateNow = JSON.parse(storeFile.readStateSync(dataDir()));
      const target = stateNow.prospects.find((p) => p.campaignId);
      let live = { skipped: true };
      if (target) {
        const marker = 'SMOKE-' + Date.now();
        const tool = crmTools.TOOLS.find((t) => t.name === 'save_draft');
        tool.handler(dataDir(), { prospect_id: target.id, draft_message: 'Hola, borrador ' + marker });
        notifyCrmChanged();
        await new Promise((r) => setTimeout(r, 1200));
        const seen = await win.webContents.executeJavaScript(
          `JSON.stringify({ fichas: document.querySelectorAll('[data-testid="ficha"]').length, inState: (JSON.parse(localStorage.getItem('prospecting-copilot-state-v1')||'{}').prospects||[]).some(p=>(p.editedMessage||'').includes(${JSON.stringify(marker)})), pageHasCampaigns: document.body.innerText.includes('Campañas') })`,
        );
        live = JSON.parse(seen);
      }
      await win.webContents.executeJavaScript(`location.hash = '#/settings'`);
      await new Promise((r) => setTimeout(r, 1500));
      const cloud = JSON.parse(
        await win.webContents.executeJavaScript(
          `window.desktop.cloud.status().then((s) => JSON.stringify({ section: Boolean(document.querySelector('[data-testid="cloud-connector-section"]')), connectorUrl: document.querySelector('[data-testid="connector-url"]')?.textContent, connected: s.connected, configured: s.configured, tunnelMentioned: /cloudflared|trycloudflare|túnel/i.test(document.body.innerText) }))`,
        ),
      );
      live.cloud = cloud;
      // ChatGPT docked next to the CRM; no BYOK anywhere in the main path.
      const ui = JSON.parse(
        await win.webContents.executeJavaScript(
          `JSON.stringify({ dock: Boolean(document.querySelector('[data-testid="chatgpt-dock"]')), slot: (() => { const r = document.querySelector('[data-testid="chatgpt-view-slot"]')?.getBoundingClientRect(); return r ? Math.round(r.width) + 'x' + Math.round(r.height) : null; })(), byok: /BYOK|sk-ant|Clave de Anthropic/i.test(document.body.innerText), asistenteNav: Array.from(document.querySelectorAll('nav a')).some(a => a.textContent.trim() === 'Asistente') })`,
        ),
      );
      await win.webContents.executeJavaScript(`location.hash = '#/cost-estimator'`);
      await new Promise((r) => setTimeout(r, 800));
      ui.costsApiTokens = await win.webContents.executeJavaScript(`/tokens? de entrada|input tokens|Batch API|per 1M|por 1M/i.test(document.body.innerText)`);
      ui.costsPage = await win.webContents.executeJavaScript(`Boolean(document.querySelector('[data-testid="costs-table"]'))`);
      ui.view = await chatgptView.status();
      live.ui = ui;
      console.log('SMOKE_RESULT ' + probe + ' LIVE ' + JSON.stringify(live));
      const r = JSON.parse(probe);
      app.exit(r.desktopMode && r.hasSidebar && (live.skipped || (live.inState && live.fichas > 0)) && live.cloud.section && !live.cloud.tunnelMentioned && live.ui.dock && live.ui.view.attached && !live.ui.byok && !live.ui.asistenteNav && live.ui.costsPage && !live.ui.costsApiTokens ? 0 : 1);
    } catch (e) {
      console.error('SMOKE_ERROR ' + e.message);
      app.exit(1);
    }
  });
}

/** PC_PROBE_URL=<url> → load an external site in an app window (feasibility probe). */
async function runUrlProbe(url) {
  const win = new BrowserWindow({ width: 1200, height: 800, show: false });
  win.webContents.setUserAgent(
    win.webContents.getUserAgent().replace(/ Electron\/[\d.]+/, '').replace(/ prospecting-copilot-prototype\/[\d.]+/, ''),
  );
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.log('PROBE_RESULT ' + JSON.stringify({ url, ok: false, code, desc }));
    app.exit(1);
  });
  win.webContents.on('did-finish-load', async () => {
    await new Promise((r) => setTimeout(r, 4000));
    const probe = await win.webContents.executeJavaScript(
      `JSON.stringify({ finalUrl: location.href, title: document.title, bodyChars: document.body.innerText.length, hasLogin: /log in|iniciar sesi|sign up|registrarse/i.test(document.body.innerText) })`,
    );
    console.log('PROBE_RESULT ' + probe);
    app.exit(0);
  });
  win.loadURL(url);
}

/**
 * PC_MCP_SELFTEST=1 → exercise the whole ChatGPT-side circuit in-process:
 * OAuth (register → authorize w/ consent → PKCE token) → MCP initialize →
 * tools/list → save_proposals → verify the fichas landed in the state file.
 * Everything real except the client, which is this harness instead of ChatGPT.
 */
async function runMcpSelfTest() {
  const dir = dataDir();
  // The harness writes through the real tools; restore the user's state afterwards.
  const snapshot = storeFile.readStateSync(dir);
  const restore = () => {
    if (snapshot) storeFile.writeState(dir, snapshot);
  };
  const runId = Date.now().toString(36);
  try {
    const port = await startMcp();
    const base = `http://127.0.0.1:${port}`;
    const j = async (p, init) => {
      const r = await fetch(base + p, init);
      return { status: r.status, headers: r.headers, body: await r.text() };
    };
    const meta = JSON.parse((await j('/.well-known/oauth-authorization-server')).body);
    const reg = JSON.parse((await j('/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'selftest-client', redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'] }) })).body);
    const verifier = require('node:crypto').randomBytes(32).toString('base64url');
    const challenge = require('node:crypto').createHash('sha256').update(verifier).digest('base64url');
    const authUrl = `/authorize?response_type=code&client_id=${reg.client_id}&redirect_uri=${encodeURIComponent(reg.redirect_uris[0])}&code_challenge=${challenge}&code_challenge_method=S256&state=xyz`;
    const auth = await j(authUrl, { redirect: 'manual' });
    const loc = auth.headers.get('location') || '';
    const code = new URL(loc).searchParams.get('code');
    const tok = JSON.parse((await j('/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: reg.client_id, redirect_uri: reg.redirect_uris[0], code_verifier: verifier }).toString() })).body);
    const unauth = await j('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{}' });
    const mcpHeaders = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${tok.access_token}` };
    const parseSse = (t) => t.split('\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5)));
    const init = await j('/mcp', { method: 'POST', headers: mcpHeaders, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'selftest', version: '0' } } }) });
    const sid = init.headers.get('mcp-session-id');
    const h2 = { ...mcpHeaders, 'mcp-session-id': sid };
    await j('/mcp', { method: 'POST', headers: h2, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
    const list = parseSse((await j('/mcp', { method: 'POST', headers: h2, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) })).body)[0];
    const camps = parseSse((await j('/mcp', { method: 'POST', headers: h2, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_campaigns', arguments: {} } }) })).body)[0];
    // Create a research task directly in the state file (what the UI "Investigar" does).
    const state = JSON.parse(storeFile.readStateSync(dir));
    let campaign = (state.campaigns || [])[0];
    if (!campaign) {
      const ws = state.workspaces[0];
      campaign = { id: require('node:crypto').randomUUID(), workspaceId: ws.id, name: 'selftest campaign', objective: '', audience: '', searchCriteria: '', language: 'es', tone: 'professional', targetCount: 3, exclusions: [], messageGuidelines: '', schedule: { dailyCap: 20 }, status: 'draft', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      state.campaigns = [campaign];
    }
    const task = { id: require('node:crypto').randomUUID(), campaignId: campaign.id, directive: 'selftest directive', status: 'pending', seedProfileUrls: [], collected: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), log: [] };
    state.researchTasks = [...(state.researchTasks || []), task];
    storeFile.writeState(dir, JSON.stringify(state));
    const before = state.prospects.length;
    const save = parseSse((await j('/mcp', { method: 'POST', headers: h2, body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'save_proposals', arguments: { task_id: task.id, candidates: [{ full_name: 'Selftest Persona', title: 'CEO', company: 'Selftest SA', linkedin_url: `https://www.linkedin.com/in/selftest-${runId}/`, why_fit: 'harness', draft_message: 'Hola, mensaje de prueba del harness.', activity_checked: false, verified_facts: [], inferences: ['simulated'] }] } } }) })).body)[0];
    const saveAgain = parseSse((await j('/mcp', { method: 'POST', headers: h2, body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'save_proposals', arguments: { task_id: task.id, candidates: [{ full_name: 'Selftest Persona', title: 'CEO', company: 'Selftest SA', linkedin_url: `https://linkedin.com/in/selftest-${runId}`, why_fit: 'dup', draft_message: 'dup' }] } } }) })).body)[0];
    const after = JSON.parse(storeFile.readStateSync(dir));
    const created = after.prospects.length - before;
    const ficha = after.prospects[after.prospects.length - 1];
    const result = {
      metadataOk: meta.token_endpoint.endsWith('/token'),
      registered: Boolean(reg.client_id),
      consentRedirectHasCode: Boolean(code),
      tokenIssued: Boolean(tok.access_token),
      unauthenticatedRejected: unauth.status === 401,
      sessionId: Boolean(sid),
      toolCount: list.result.tools.length,
      campaignsListed: JSON.parse(camps.result.content[0].text).length,
      saveOutcome: JSON.parse(save.result.content[0].text),
      duplicateSkipped: JSON.parse(saveAgain.result.content[0].text).skipped_hard_duplicates,
      fichasCreated: created,
      fichaApproval: ficha.approval?.status,
      fichaCampaign: ficha.campaignId === campaign.id,
      taskStatus: after.researchTasks.find((t) => t.id === task.id).status,
    };
    const ok = result.metadataOk && result.registered && result.consentRedirectHasCode && result.tokenIssued && result.unauthenticatedRejected && result.toolCount === 8 && created === 1 && result.duplicateSkipped.length === 1 && result.fichaApproval === 'pending' && result.taskStatus === 'proposals_received';
    console.log('MCP_SELFTEST_RESULT ' + JSON.stringify({ ok, ...result }));
    mcpServer.stop();
    restore();
    app.exit(ok ? 0 : 1);
  } catch (e) {
    console.error('MCP_SELFTEST_ERROR ' + (e.stack || e.message));
    restore();
    app.exit(1);
  }
}


/**
 * PC_CHATGPT_PROBE=1 → exploratory check of the docked-view mechanics against
 * the real chatgpt.com, in a SEPARATE logged-out session (persist:chatgpt-probe),
 * never the user's. Loads ChatGPT, detects session state, finds the composer and
 * types a directive, then STOPS before sending (dryRun). Sending is verified only
 * with the user's own signed-in session.
 */
async function runChatGptProbe() {
  // The probe session is throwaway: start clean every run (never the user's partition).
  await require('electron').session.fromPartition('persist:chatgpt-probe').clearStorageData();
  const win = new BrowserWindow({ width: 1300, height: 900, show: true });
  win.loadURL('data:text/html,<body style="margin:0">probe</body>');
  chatgptView.ensure(win, { partition: 'persist:chatgpt-probe' });
  chatgptView.show(win, { x: 0, y: 0, width: 1300, height: 900 });
  try {
    const r = await chatgptView.sendDirective(win, 'Prospecting Copilot probe: texto de prueba, no enviar.', {
      allowLoggedOut: true,
      dryRun: true,
    });
    const st = await chatgptView.status();
    if (r.stage !== 'dry_run') {
      const diag = await chatgptView.diagnose();
      console.log('CHATGPT_PROBE_DIAG ' + JSON.stringify(diag));
    }
    console.log('CHATGPT_PROBE_RESULT ' + JSON.stringify({ ...r, loggedIn: st.loggedIn }));
    app.exit(r.stage === 'dry_run' ? 0 : 1);
  } catch (e) {
    console.error('CHATGPT_PROBE_ERROR ' + (e.stack || e.message));
    app.exit(1);
  }
}

app.whenReady().then(() => {
  // Expose where state lives so the preload can boot-read it synchronously.
  process.env.PC_DATA_DIR = dataDir();
  if (process.env.PC_CHATGPT_PROBE === '1') {
    void runChatGptProbe();
    return;
  }
  if (process.env.PC_MCP_SELFTEST === '1') {
    process.env.PC_MCP_AUTOCONSENT = '1';
    void runMcpSelfTest();
    return;
  }
  if (process.env.PC_PROBE_URL) {
    void runUrlProbe(process.env.PC_PROBE_URL);
    return;
  }
  if (process.env.PC_SELFTEST === '1') {
    void runBridgeSelfTest();
    return;
  }
  if (process.env.PC_SMOKE === '1') {
    void runRendererSmoke();
    return;
  }
  createWindow();
  relay.init({
    dataDir,
    safeStorage,
    crmTools,
    storeFile,
    appVersion: app.getVersion(),
    onApplied: notifyCrmChanged,
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  bridge.stop().catch(() => {});
  mcpServer.stop();
  if (process.platform !== 'darwin') app.quit();
});
