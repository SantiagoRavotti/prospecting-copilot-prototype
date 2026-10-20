// Feasibility probe: can we stream the managed Chrome's screen into the app
// via CDP Page.startScreencast? Launches managed Chrome on example.com,
// captures a few frames, reports sizes, stops. No LinkedIn involved.
const path = require('node:path');
const os = require('node:os');
const bridge = require('../electron/bridge.cjs');

(async () => {
  const dataDir = path.join(os.tmpdir(), 'pc-screencast-probe');
  require('node:fs').mkdirSync(dataDir, { recursive: true });
  await bridge.launchManagedChrome(dataDir, 'https://example.com/');
  const CDP = require('chrome-remote-interface');
  const status = await bridge.status();
  const targets = await CDP.List({ port: status.port });
  const page = targets.find((t) => t.type === 'page');
  const client = await CDP({ port: status.port, target: page.id });
  const { Page } = client;
  await Page.enable();
  let frames = 0;
  let bytes = 0;
  const done = new Promise((resolve) => {
    Page.screencastFrame(async ({ data, sessionId, metadata }) => {
      frames++;
      bytes += data.length;
      await Page.screencastFrameAck({ sessionId });
      if (frames === 1) console.log('first frame', metadata.deviceWidth + 'x' + metadata.deviceHeight);
      if (frames >= 3) resolve();
    });
  });
  await Page.startScreencast({ format: 'jpeg', quality: 50, maxWidth: 960, maxHeight: 600, everyNthFrame: 2 });
  await Promise.race([done, new Promise((r) => setTimeout(r, 8000))]);
  await Page.stopScreencast();
  await client.close();
  await bridge.stop();
  console.log('SCREENCAST_RESULT ' + JSON.stringify({ frames, avgKB: frames ? Math.round(bytes / frames / 1024) : 0, ok: frames > 0 }));
  process.exit(frames > 0 ? 0 : 1);
})().catch((e) => {
  console.log('SCREENCAST_ERROR ' + e.message);
  process.exit(1);
});
