'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

// Unix socket names have a 104/108-byte limit. VS Code's globalStorage and
// macOS temporary directories routinely exceed it. Keep only the socket in a
// short, owner-only directory; identities and history stay in globalStorage.
function localPipe(storage, version) {
  const suffix = crypto.createHash('sha256').update(path.resolve(storage)).digest('hex').slice(0, 24);
  if (process.platform === 'win32') return `\\\\.\\pipe\\codex-beacon-secure-v1-p${version}-${suffix}`;
  const uid = process.getuid();
  let base = fs.realpathSync(os.tmpdir());
  const name = `${suffix}-p${version}.sock`;
  if (Buffer.byteLength(path.join(base, `codex-beacon-${uid}`, name)) >= 104) base = fs.realpathSync('/tmp');
  const directory = path.join(base, `codex-beacon-${uid}`);
  try { fs.mkdirSync(directory, {mode: 0o700}); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const info = fs.lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== uid) {
    const error = new Error('Unsafe local notification socket directory');
    error.code = 'BROKER_AUTH_FAILED';
    throw error;
  }
  fs.chmodSync(directory, 0o700);
  const socket = path.join(directory, name);
  if (Buffer.byteLength(socket) >= 104) throw new Error('Local notification socket path is too long');
  return socket;
}
module.exports = {localPipe};
