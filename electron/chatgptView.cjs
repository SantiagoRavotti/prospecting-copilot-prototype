// ChatGPT docked INSIDE the main window, next to the CRM.
//
// A WebContentsView with a persistent session (partition persist:chatgpt) —
// the user signs in manually once and the session survives restarts. The
// renderer reserves a rectangle (the dock) and sends its bounds; this module
// places the view there.
//
// Directive delivery: the app types the directive into the ChatGPT composer of
// the conversation saved for the campaign/workspace and presses send. Delivery
// is CONFIRMED only when the message is seen in the conversation; otherwise the
// result says which stage failed (not signed in, composer not found, draft
// already in the composer, insert failed, send failed, not confirmed). Nothing
// here talks to OpenAI's API: it is the user's own ChatGPT web session.

const { WebContentsView, shell } = require('electron');

const HOME = 'https://chatgpt.com/';
const ALLOWED_POPUP = /^https:\/\/(chatgpt\.com|auth\.openai\.com|auth0\.openai\.com|accounts\.google\.com|login\.microsoftonline\.com|login\.live\.com|appleid\.apple\.com|vqyhxjjirskadwomfjkp\.supabase\.co|santiagoravotti\.github\.io)\//;

let view = null;
let hostWindow = null;
let attached = false;
let onNavigate = () => {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function conversationIdOf(url) {
  const m = /\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(String(url || ''));
  return m ? m[1].toLowerCase() : null;
}

function stripUa(wc) {
  wc.setUserAgent(
    wc.getUserAgent().replace(/ Electron\/[\d.]+/, '').replace(/ prospecting-copilot-prototype\/[\d.]+/, ''),
  );
}

function ensure(win, { partition = 'persist:chatgpt' } = {}) {
  if (view && !view.webContents.isDestroyed()) return view;
  hostWindow = win;
  view = new WebContentsView({
    webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  const wc = view.webContents;
  stripUa(wc);
  wc.setWindowOpenHandler(({ url }) => {
    // Sign-in and the connector's OAuth consent open as popups sharing this session.
    if (ALLOWED_POPUP.test(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true } };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('did-create-window', (child) => stripUa(child.webContents));
  const emit = () => onNavigate({ url: wc.getURL(), conversationId: conversationIdOf(wc.getURL()) });
  wc.on('did-navigate', emit);
  wc.on('did-navigate-in-page', emit);
  wc.loadURL(HOME);
  return view;
}

function setNavigateListener(fn) {
  onNavigate = fn;
}

function show(win, bounds) {
  ensure(win);
  if (!attached) {
    win.contentView.addChildView(view);
    attached = true;
  }
  setBounds(bounds);
  return state();
}

function setBounds(b) {
  if (!view || !b) return;
  view.setBounds({
    x: Math.max(0, Math.round(b.x)),
    y: Math.max(0, Math.round(b.y)),
    width: Math.max(1, Math.round(b.width)),
    height: Math.max(1, Math.round(b.height)),
  });
}

function hide() {
  if (view && attached && hostWindow && !hostWindow.isDestroyed()) {
    hostWindow.contentView.removeChildView(view);
  }
  attached = false;
}

async function waitForLoad(wc, timeoutMs = 20000) {
  if (!wc.isLoading()) return;
  await Promise.race([new Promise((r) => wc.once('did-stop-loading', r)), sleep(timeoutMs)]);
}

async function open(win, url) {
  ensure(win);
  const target = url || HOME;
  const wc = view.webContents;
  if (url && conversationIdOf(wc.getURL()) === conversationIdOf(url)) return state();
  await wc.loadURL(target).catch(() => {});
  return state();
}

function js(code) {
  return view.webContents.executeJavaScript(code, true);
}

async function isLoggedIn() {
  try {
    return await js(
      `fetch('/api/auth/session', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(j => Boolean(j && j.user)).catch(() => false)`,
    );
  } catch {
    return false;
  }
}

function state() {
  if (!view || view.webContents.isDestroyed()) return { created: false, attached: false, url: null, conversationId: null };
  const url = view.webContents.getURL();
  return { created: true, attached, url, conversationId: conversationIdOf(url) };
}

async function status() {
  const s = state();
  return { ...s, loggedIn: s.created ? await isLoggedIn() : false };
}

// Signed-in ChatGPT uses a ProseMirror editor (#prompt-textarea); the
// signed-out page uses a plain <textarea>. Pick the first VISIBLE candidate.
const COMPOSER = `(() => {
  const vis = (e) => e && e.offsetParent !== null && e.getBoundingClientRect().height > 0;
  const sel = ['#prompt-textarea', 'form [contenteditable="true"]', 'textarea#mobile-composer-prompt', 'form textarea', 'textarea', '[contenteditable="true"]'];
  for (const q of sel) { const hit = Array.from(document.querySelectorAll(q)).find(vis); if (hit) return hit; }
  return null;
})()`;
const SEND_BUTTON = `(() => {
  const sel = ['[data-testid="send-button"]', '#composer-submit-button', 'button[aria-label*="Send"]', 'button[aria-label*="Enviar"]', 'form button[type="submit"]'];
  for (const q of sel) { const b = document.querySelector(q); if (b) return b; }
  return null;
})()`;

async function composerText() {
  return js(`(() => { const el = ${COMPOSER}; if (!el) return null; return el.tagName === 'TEXTAREA' ? el.value : el.innerText; })()`);
}

async function userMessages() {
  return js(
    `Array.from(document.querySelectorAll('[data-message-author-role="user"]')).map(n => n.innerText.slice(0, 400))`,
  );
}

/**
 * Type the directive into the conversation and send it.
 * Returns { delivered, stage, reason?, conversationUrl, conversationId }.
 * `opts.dryRun` stops right before pressing send (used by the probe harness).
 */
async function sendDirective(win, text, opts = {}) {
  const fail = (stage, reason) => ({ delivered: false, stage, reason, ...state() });
  ensure(win, opts.partition ? { partition: opts.partition } : undefined);
  const wc = view.webContents;
  if (opts.conversationUrl && conversationIdOf(wc.getURL()) !== conversationIdOf(opts.conversationUrl)) {
    await wc.loadURL(opts.conversationUrl).catch(() => {});
  }
  await waitForLoad(wc);

  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    ready = await js(`Boolean(${COMPOSER})`).catch(() => false);
    if (!ready) await sleep(500);
  }
  const loggedIn = await isLoggedIn();
  if (!opts.allowLoggedOut && !loggedIn) {
    return fail('session', 'ChatGPT no tiene una sesión iniciada en el panel. Iniciá sesión y reintentá.');
  }
  if (!ready) return fail('composer', 'No se encontró el cuadro de mensaje de ChatGPT (la página cambió o no terminó de cargar).');

  const existing = String((await composerText()) || '').trim();
  if (existing) {
    return fail('composer', 'El cuadro de mensaje ya tiene un borrador; no lo sobrescribo. Envialo o borralo y reintentá.');
  }

  const before = (await userMessages().catch(() => [])).length;
  const snippet = text.trim().slice(0, 40);
  await js(`(() => { const el = ${COMPOSER}; el.focus(); return true; })()`);
  wc.focus();
  await wc.insertText(text);
  await sleep(400);
  const inserted = String((await composerText()) || '');
  if (!inserted.includes(snippet.slice(0, 25))) {
    return fail('insert', 'El texto no quedó en el cuadro de mensaje.');
  }
  if (opts.dryRun) {
    await sleep(300);
    const send = await js(
      `(() => { const b = ${SEND_BUTTON}; return b ? { found: true, enabled: !(b.disabled || b.getAttribute('aria-disabled') === 'true') } : { found: false }; })()`,
    ).catch(() => ({ found: false }));
    // Leave the probe's composer clean.
    await js(`(() => { const el = ${COMPOSER}; if (!el) return; if (el.tagName === 'TEXTAREA') { el.select(); } else { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } document.execCommand('delete'); })()`).catch(() => {});
    return { delivered: false, stage: 'dry_run', reason: 'Texto insertado; no se envió (prueba).', sendButton: send, ...state() };
  }

  let clicked = false;
  for (let i = 0; i < 20 && !clicked; i++) {
    clicked = await js(
      `(() => { const b = ${SEND_BUTTON}; if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return false; b.click(); return true; })()`,
    ).catch(() => false);
    if (!clicked) await sleep(250);
  }
  if (!clicked) {
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    wc.sendInputEvent({ type: 'char', keyCode: '\r' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
  }

  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const msgs = await userMessages().catch(() => []);
    if (msgs.length > before && msgs[msgs.length - 1].includes(snippet.slice(0, 25))) {
      // A new chat gets its /c/<id> URL right after the first message.
      for (let j = 0; j < 20 && !conversationIdOf(wc.getURL()); j++) await sleep(500);
      return { delivered: true, stage: 'confirmed', ...state() };
    }
  }
  return fail('confirm', clicked ? 'Se pulsó enviar pero el mensaje no apareció en la conversación.' : 'No se encontró el botón de enviar; el envío con Enter no se confirmó.');
}

/** Page diagnostics for failure reports (no content of the user's chats). */
async function diagnose() {
  if (!view) return null;
  return js(`({
    title: document.title,
    readyState: document.readyState,
    editables: Array.from(document.querySelectorAll('[contenteditable="true"], textarea')).map(e => e.tagName + '#' + e.id + '.' + String(e.className).slice(0, 40)).slice(0, 8),
    buttons: Array.from(document.querySelectorAll('button[data-testid]')).map(b => b.dataset.testid).slice(0, 15),
    bodySample: document.body ? document.body.innerText.slice(0, 300) : null,
  })`).catch((e) => ({ error: e.message }));
}

module.exports = { diagnose, ensure, show, hide, setBounds, open, status, sendDirective, setNavigateListener, conversationIdOf, HOME };
