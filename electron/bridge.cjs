// Managed-Chrome bridge (CDP).
//
// Chrome ≥136 blocks --remote-debugging-port on the DEFAULT user profile, so
// the app manages a DEDICATED Chrome profile (its own user-data-dir inside the
// app's data folder). The user signs in to LinkedIn there once; their personal
// Chrome profile is never touched.
//
// Hard rules enforced here by construction:
//  - READ-ONLY page access (Runtime.evaluate of text extraction) + navigation.
//  - No clicking, no form filling, no sending. Sending anything on LinkedIn is
//    always a human action in the visible, managed Chrome window.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const http = require('node:http');

let chromeProc = null;
let debugPort = null;

const CHROME_CANDIDATES = [
  process.env.PC_CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
].filter(Boolean);

function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* keep looking */
    }
  }
  throw new Error('Google Chrome not found. Install Chrome or set PC_CHROME_PATH.');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function waitForDevtools(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await httpJson(`http://127.0.0.1:${port}/json/version`);
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error('Managed Chrome did not expose DevTools in time.');
}

async function isAlive() {
  if (!debugPort) return false;
  try {
    await httpJson(`http://127.0.0.1:${debugPort}/json/version`);
    return true;
  } catch {
    return false;
  }
}

async function launchManagedChrome(dataDir, startUrl) {
  if (await isAlive()) {
    if (startUrl) await openInManagedChrome(startUrl);
    return { alreadyRunning: true, port: debugPort };
  }
  const chrome = findChrome();
  const profileDir = path.join(dataDir, 'chrome-profile');
  fs.mkdirSync(profileDir, { recursive: true });
  debugPort = await freePort();
  const args = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    startUrl || 'about:blank',
  ];
  chromeProc = spawn(chrome, args, { detached: false, stdio: 'ignore' });
  chromeProc.on('exit', () => {
    chromeProc = null;
    debugPort = null;
  });
  const version = await waitForDevtools(debugPort);
  return { alreadyRunning: false, port: debugPort, browser: version.Browser };
}

/** The most recently active normal page tab. */
async function activePageTarget() {
  if (!(await isAlive())) throw new Error('Managed Chrome is not running. Launch it first.');
  const targets = await httpJson(`http://127.0.0.1:${debugPort}/json/list`);
  const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools:'));
  if (!page) throw new Error('No open page tab in the managed Chrome.');
  return page;
}

/**
 * Read the ACTIVE page: url, title and visible text (capped). Read-only.
 * Used for research context on pages the user navigated to, and for the
 * innocuous self-test.
 */
async function readActivePage() {
  const CDP = require('chrome-remote-interface');
  const target = await activePageTarget();
  const client = await CDP({ port: debugPort, target: target.id });
  try {
    const { Runtime, Page } = client;
    await Runtime.enable();
    await Page.enable();
    const { result } = await Runtime.evaluate({
      expression:
        'JSON.stringify({ url: location.href, title: document.title, text: (document.body ? document.body.innerText : "").slice(0, 20000) })',
      returnByValue: true,
    });
    return JSON.parse(result.value);
  } finally {
    await client.close();
  }
}

/** Navigate the active tab (or open a new one) to a URL. Navigation only. */
async function openInManagedChrome(url) {
  if (!/^https?:\/\//.test(String(url))) throw new Error('Only http(s) URLs can be opened.');
  const CDP = require('chrome-remote-interface');
  const target = await activePageTarget();
  const client = await CDP({ port: debugPort, target: target.id });
  try {
    const { Page } = client;
    await Page.enable();
    await Page.navigate({ url });
    // Give the page a moment to commit; callers re-read when they need text.
    await new Promise((r) => setTimeout(r, 1200));
    return { navigated: url };
  } finally {
    await client.close();
  }
}

async function status() {
  const alive = await isAlive();
  return { running: alive, port: alive ? debugPort : null };
}

async function stop() {
  if (chromeProc) {
    try {
      chromeProc.kill();
    } catch {
      /* already dead */
    }
  }
  chromeProc = null;
  debugPort = null;
  return { stopped: true };
}

module.exports = { launchManagedChrome, readActivePage, openInManagedChrome, status, stop };
