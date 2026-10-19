// Electron main process — Prospecting Copilot desktop shell.
// Responsibilities: window lifecycle, file-backed persistence (IPC),
// managed-Chrome bridge (CDP), and the local agent (BYOK, M4).
// The renderer is the SAME React app, running in "desktop" mode.

const { app, BrowserWindow, ipcMain, shell, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const storeFile = require('./storeFile.cjs');
const bridge = require('./bridge.cjs');

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
  return win;
}

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
  return storeFile.writeState(dataDir(), json);
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
// IPC: secrets (BYOK — the API key never reaches the renderer again)
// ---------------------------------------------------------------------------

const SECRET_FILE = () => path.join(dataDir(), 'secrets.bin');

ipcMain.handle('secrets:setAnthropicKey', (_e, key) => {
  if (typeof key !== 'string' || !key.startsWith('sk-ant-')) {
    throw new Error('That does not look like an Anthropic API key.');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level encryption unavailable; refusing to store the key.');
  }
  fs.writeFileSync(SECRET_FILE(), safeStorage.encryptString(key));
  return { stored: true, last4: key.slice(-4) };
});

ipcMain.handle('secrets:anthropicKeyStatus', () => {
  try {
    const buf = fs.readFileSync(SECRET_FILE());
    const key = safeStorage.decryptString(buf);
    return { stored: true, last4: key.slice(-4) };
  } catch {
    return { stored: false, last4: null };
  }
});

ipcMain.handle('secrets:clearAnthropicKey', () => {
  try {
    fs.rmSync(SECRET_FILE());
  } catch {
    /* already gone */
  }
  return { stored: false };
});

/** Internal helper for the agent (main-process only). */
function getAnthropicKey() {
  const buf = fs.readFileSync(SECRET_FILE());
  return safeStorage.decryptString(buf);
}

// Agent IPC (M4) — registered here so the preload surface is stable.
const agent = require('./agent.cjs');
ipcMain.handle('agent:chat', (e, payload) =>
  agent.chat(payload, {
    getKey: getAnthropicKey,
    bridge,
    sendEvent: (ev) => e.sender.send('agent:event', ev),
  }),
);

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
      console.log('SMOKE_RESULT ' + probe);
      const r = JSON.parse(probe);
      app.exit(r.desktopMode && r.hasSidebar ? 0 : 1);
    } catch (e) {
      console.error('SMOKE_ERROR ' + e.message);
      app.exit(1);
    }
  });
}

app.whenReady().then(() => {
  // Expose where state lives so the preload can boot-read it synchronously.
  process.env.PC_DATA_DIR = dataDir();
  if (process.env.PC_SELFTEST === '1') {
    void runBridgeSelfTest();
    return;
  }
  if (process.env.PC_SMOKE === '1') {
    void runRendererSmoke();
    return;
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  bridge.stop().catch(() => {});
  if (process.platform !== 'darwin') app.quit();
});
