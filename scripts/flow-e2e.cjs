// Runs the batch-flow end-to-end test against the REAL desktop app, twice, with a
// real close/reopen in between, in a throwaway data directory (never the user's).
//   npm run build:desktop && npm run test:flow
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-flow-'));
let failed = false;

for (const phase of ['1', '2']) {
  console.log(`\n=== fase ${phase}${phase === '2' ? ' (la app se cerró y se reabrió)' : ''} ===`);
  const r = spawnSync(electron, ['.'], {
    cwd: root,
    env: { ...process.env, PC_FLOW: '1', PC_FLOW_PHASE: phase, PC_HARNESS_DIR: dir },
    encoding: 'utf8',
    timeout: 180000,
  });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('FLOW_RESULT '));
  if (!line) {
    console.log('sin resultado. stdout/stderr:\n', (r.stdout || '').slice(-1500), (r.stderr || '').slice(-1500));
    failed = true;
    break;
  }
  const out = JSON.parse(line.slice('FLOW_RESULT '.length));
  for (const c of out.checks) console.log(`${c.pass ? '  ✔' : '  ✘'} ${c.name}${c.pass || !c.detail ? '' : '  → ' + c.detail}`);
  if (!out.ok) failed = true;
  if (!out.ok) break;
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(failed ? '\nFLUJO: FALLÓ' : '\nFLUJO: OK (datos simulados, directorio temporal)');
process.exit(failed ? 1 : 0);
