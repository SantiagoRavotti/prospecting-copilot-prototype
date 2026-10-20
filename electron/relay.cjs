// Cloud relay between the hosted MCP endpoint (ChatGPT) and this desktop app.
//
// - Signs in to Supabase as the USER (email one-time code; no password, no
//   admin key). The session is encrypted at rest with the OS keychain
//   (safeStorage) — never written in plain text, never in the installer.
// - Publishes the read snapshot (relaySnapshot.cjs) after every state change.
// - Polls the user's inbox of ChatGPT writes, applies each one ONCE through the
//   same CRM tool handlers the local server uses (crmTools.cjs), and records
//   the outcome on the row so ChatGPT receives it.
//
// Idempotency: applied inbox ids (with their result) are kept locally, so a
// crash between "applied" and "acknowledged" re-acknowledges instead of
// re-applying.

const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const cloud = require('./cloudConfig.cjs');
const { buildSnapshot } = require('./relaySnapshot.cjs');

const POLL_MS = 3000;
const PUSH_DEBOUNCE_MS = 1500;
const APPLIED_KEEP = 2000;

let deps = null; // { dataDir, safeStorage, crmTools, storeFile, onApplied, appVersion }
let client = null;
let pollTimer = null;
let pushTimer = null;
let polling = false;
const stats = {
  lastPushAt: null,
  lastPollAt: null,
  applied: 0,
  failed: 0,
  lastError: null,
  lastApplied: [],
};

// --- encrypted session storage ------------------------------------------------
const SESSION_FILE = () => path.join(deps.dataDir(), 'cloud-session.bin');
const APPLIED_FILE = () => path.join(deps.dataDir(), 'relay-applied.json');
let sessionCache = {};

function loadSessionStore() {
  try {
    const buf = fs.readFileSync(SESSION_FILE());
    sessionCache = JSON.parse(deps.safeStorage.decryptString(buf));
  } catch {
    sessionCache = {};
  }
}
function saveSessionStore() {
  if (!deps.safeStorage.isEncryptionAvailable()) return; // never store unencrypted
  fs.writeFileSync(SESSION_FILE(), deps.safeStorage.encryptString(JSON.stringify(sessionCache)));
}
const storage = {
  getItem: (k) => (k in sessionCache ? sessionCache[k] : null),
  setItem: (k, v) => {
    sessionCache[k] = v;
    saveSessionStore();
  },
  removeItem: (k) => {
    delete sessionCache[k];
    saveSessionStore();
  },
};

function readApplied() {
  try {
    return JSON.parse(fs.readFileSync(APPLIED_FILE(), 'utf8'));
  } catch {
    return {};
  }
}
function writeApplied(map) {
  const entries = Object.entries(map).slice(-APPLIED_KEEP);
  fs.writeFileSync(APPLIED_FILE(), JSON.stringify(Object.fromEntries(entries)), 'utf8');
}

// --- lifecycle -------------------------------------------------------------------
function init(d) {
  deps = d;
  loadSessionStore();
  client = createClient(cloud.SUPABASE_URL, cloud.PUBLISHABLE_KEY, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'implicit',
    },
  });
  client.auth.onAuthStateChange((_event, session) => {
    if (session) startLoop();
    else stopLoop();
  });
  void client.auth.getSession().then(({ data }) => {
    if (data.session) startLoop();
  });
}

function startLoop() {
  if (pollTimer) return;
  schedulePush(0);
  pollTimer = setInterval(() => void pollInbox(), POLL_MS);
  void pollInbox();
}
function stopLoop() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function currentUser() {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session ? data.session.user : null;
}

// --- auth (email one-time code) ------------------------------------------------------
async function sendCode(email) {
  const { error } = await client.auth.signInWithOtp({
    email: String(email).trim(),
    options: { shouldCreateUser: false },
  });
  if (error) throw new Error(error.message);
  return { sent: true };
}
async function verifyCode(email, code) {
  const { data, error } = await client.auth.verifyOtp({
    email: String(email).trim(),
    token: String(code).trim(),
    type: 'email',
  });
  if (error) throw new Error(error.message);
  return { email: data.user && data.user.email };
}
async function signOut() {
  await client.auth.signOut({ scope: 'local' });
  stopLoop();
  return { signedOut: true };
}

// --- snapshot push ---------------------------------------------------------------------
function schedulePush(delay = PUSH_DEBOUNCE_MS) {
  if (!client) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void pushSnapshot(), delay);
}

async function pushSnapshot() {
  const user = await currentUser();
  if (!user) return;
  const raw = deps.storeFile.readStateSync(deps.dataDir());
  if (!raw) return;
  try {
    const snapshot = buildSnapshot(JSON.parse(raw));
    const { error } = await client
      .from('crm_snapshots')
      .upsert(
        { user_id: user.id, snapshot, app_version: deps.appVersion, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    if (error) throw error;
    stats.lastPushAt = new Date().toISOString();
    stats.lastError = null;
  } catch (e) {
    stats.lastError = 'snapshot: ' + (e.message || String(e));
  }
}

// --- inbox apply -------------------------------------------------------------------------
const WRITE_TOOLS = new Set(['save_proposals', 'save_draft', 'update_prospect_notes']);

async function pollInbox() {
  if (polling) return;
  polling = true;
  try {
    const user = await currentUser();
    if (!user) return;
    const { data: rows, error } = await client
      .from('crm_inbox')
      .select('id, tool, args, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(20);
    if (error) throw error;
    stats.lastPollAt = new Date().toISOString();
    if (!rows || rows.length === 0) return;
    const applied = readApplied();
    let changed = false;
    for (const row of rows) {
      let entry = applied[row.id];
      if (!entry) {
        entry = applyRow(row);
        applied[row.id] = entry;
        writeApplied(applied);
        changed = changed || entry.status === 'applied';
      }
      const { error: upErr } = await client
        .from('crm_inbox')
        .update({ status: entry.status, result: entry.result, applied_at: entry.at })
        .eq('id', row.id);
      if (upErr) throw upErr;
    }
    if (changed) {
      deps.onApplied();
      schedulePush(200);
    }
  } catch (e) {
    stats.lastError = 'inbox: ' + (e.message || String(e));
  } finally {
    polling = false;
  }
}

function applyRow(row) {
  const at = new Date().toISOString();
  if (!WRITE_TOOLS.has(row.tool)) {
    stats.failed += 1;
    return { status: 'failed', result: { error: `tool ${row.tool} not allowed` }, at };
  }
  const tool = deps.crmTools.TOOLS.find((t) => t.name === row.tool);
  try {
    const result = tool.handler(deps.dataDir(), row.args || {});
    stats.applied += 1;
    stats.lastApplied = [{ at, tool: row.tool, result }, ...stats.lastApplied].slice(0, 20);
    return { status: 'applied', result: result && typeof result === 'object' ? result : { ok: true }, at };
  } catch (e) {
    stats.failed += 1;
    stats.lastApplied = [{ at, tool: row.tool, error: e.message }, ...stats.lastApplied].slice(0, 20);
    return { status: 'failed', result: { error: e.message }, at };
  }
}

async function status() {
  const user = await currentUser().catch(() => null);
  return {
    configured: Boolean(cloud.SUPABASE_URL && cloud.PUBLISHABLE_KEY),
    connected: Boolean(user),
    email: user ? user.email : null,
    connectorUrl: `${cloud.SUPABASE_URL}/functions/v1/crm-mcp/mcp`,
    encryptionAvailable: deps ? deps.safeStorage.isEncryptionAvailable() : false,
    ...stats,
  };
}

module.exports = { init, sendCode, verifyCode, signOut, schedulePush, pushSnapshot, pollInbox, status, applyRow };
