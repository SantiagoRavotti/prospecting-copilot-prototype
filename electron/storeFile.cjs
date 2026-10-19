// File-backed persistence for the desktop app.
// state.json is written atomically (tmp + rename); a dated backup is kept per
// day (last 14). No native dependencies by design — see SPRINT_DESKTOP notes.

const fs = require('node:fs');
const path = require('node:path');

const STATE_NAME = 'state.json';
const BACKUP_KEEP = 14;

function statePath(dir) {
  return path.join(dir, STATE_NAME);
}

function writeState(dir, json) {
  const target = statePath(dir);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, target);
  rotateBackup(dir, json);
  return { bytes: Buffer.byteLength(json, 'utf8'), path: target };
}

function readStateSync(dir) {
  try {
    return fs.readFileSync(statePath(dir), 'utf8');
  } catch {
    return null;
  }
}

function rotateBackup(dir, json) {
  const day = new Date().toISOString().slice(0, 10);
  const backupDir = path.join(dir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `state-${day}.json`);
  try {
    // One backup per day: first write of the day wins (pre-change snapshot
    // already lives in state.json history via previous days).
    if (!fs.existsSync(file)) fs.writeFileSync(file, json, 'utf8');
  } catch {
    /* backups are best-effort */
  }
  try {
    const all = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith('state-'))
      .sort();
    for (const f of all.slice(0, Math.max(0, all.length - BACKUP_KEEP))) {
      fs.rmSync(path.join(backupDir, f));
    }
  } catch {
    /* best-effort */
  }
}

function listBackups(dir) {
  const backupDir = path.join(dir, 'backups');
  try {
    return fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith('state-'))
      .sort()
      .map((f) => ({ file: f, bytes: fs.statSync(path.join(backupDir, f)).size }));
  } catch {
    return [];
  }
}

module.exports = { writeState, readStateSync, listBackups, statePath };
