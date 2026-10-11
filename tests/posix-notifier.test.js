'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {EventEmitter} = require('node:events');
const {PassThrough} = require('node:stream');
const {PosixNotifier} = require('../ui/lib/posix-notifier');
const {localPipe} = require('../ui/lib/local-pipe');
const {BROKER_PROTOCOL_VERSION} = require('../ui/lib/broker-core');

function fixture(t, behavior) {
  const calls = [];
  const notifier = new PosixNotifier({platform: 'linux', spawnImpl: (program, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('close', null)); };
    calls.push({program, args, options, child});
    queueMicrotask(() => {
      if (behavior) behavior(calls.at(-1));
      else if (program === 'stdbuf') child.stdout.write('71\n');
      else child.emit('close', 0);
    });
    return child;
  }});
  t.after(() => notifier.close());
  return {notifier, calls};
}
const batch = {title: 'Codex test $(echo ignored)', body: '<project> & "text"', desktop: true, sound: false, keys: ['a', 'b'], language: 'en'};

test('Linux libnotify acknowledges before click; arguments preserve opaque text and cancellation scopes keys', async t => {
  const {notifier, calls} = fixture(t);
  const clicks = []; notifier.on('click', event => clicks.push(event));
  await notifier.deliver(batch);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].program, 'stdbuf');
  assert.ok(calls[0].args.includes('--action=default=Open conversation'));
  assert.deepEqual(calls[0].args.slice(-3), ['--', batch.title, '&lt;project&gt; &amp; "text"']);
  assert.equal(calls[0].options.shell, undefined);
  assert.equal(notifier.clicks.size, 1);
  notifier.cancel(['a']);
  calls[0].child.stdout.write('default\n');
  assert.deepEqual(clicks, [{id: '71', keys: ['b']}]);
  calls[0].child.emit('close', 0);
  assert.equal(notifier.children.size, 0);
});

test('muted or zero-volume POSIX audio never reads a custom file or starts a player', async t => {
  const {notifier, calls} = fixture(t);
  await notifier.deliver({...batch, desktop: false, sound: false, soundFile: 'invalid'});
  await notifier.deliver({...batch, desktop: false, sound: true, soundVolume: 0, soundFile: 'invalid'});
  assert.equal(calls.length, 0);
  await assert.rejects(notifier.deliver({...batch, soundVolume: 101}), /volume/);
});

test('POSIX WAV playback applies per-stream volume and missing audio falls back exactly once', async t => {
  const {notifier, calls} = fixture(t);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-posix-audio-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const file = path.join(directory, "音效 ' tone.wav"); fs.writeFileSync(file, 'synthetic audio');
  const system = path.join(directory, 'system.oga'); notifier.defaultSound = () => system;
  const fallbacks = []; notifier.on('soundFallback', event => fallbacks.push(event));
  await notifier.deliver({...batch, desktop: false, sound: true, soundVolume: 37, soundFile: file});
  assert.deepEqual(calls[0].args, ['--volume=0.37', file]);
  assert.deepEqual(fallbacks, []);
  const missing = path.join(directory, 'missing.mp3');
  await notifier.deliver({...batch, desktop: false, sound: true, soundVolume: 25, soundFile: missing});
  assert.deepEqual(calls[1].args, ['--volume=0.25', system]);
  assert.deepEqual(fallbacks, [{soundFile: missing}]);
});

test('POSIX decoding failure uses the default sound; absent PipeWire tries PulseAudio without changing global volume', async t => {
  let attempts = 0;
  const {notifier, calls} = fixture(t, ({child, program}) => {
    if (program === 'pw-play') {
      const error = new Error('not installed'); error.code = 'ENOENT'; child.emit('error', error);
    } else { attempts++; child.emit('close', 0); }
  });
  notifier.defaultSound = () => 'system.oga';
  await notifier.deliver({...batch, desktop: false, sound: true, soundVolume: 50});
  assert.equal(attempts, 1);
  assert.deepEqual(calls.map(call => call.program), ['pw-play', 'paplay']);
  assert.deepEqual(calls[1].args, ['--volume=32768', 'system.oga']);
});

test('a removed reminder or privacy reset while awaiting native acknowledgement cannot replay sound or click', async t => {
  const {notifier, calls} = fixture(t, () => {});
  let current = {...batch, sound: true};
  const delivered = notifier.deliver(current, () => current);
  current = null;
  notifier.cancel(['a', 'b']);
  await delivered;
  assert.equal(calls.length, 1);
  assert.ok(calls[0].child.killed);
  await notifier.deliver({...batch, sound: true}, () => null);
  assert.equal(calls.length, 1);
  const reset = notifier.deliver({...batch, sound: true});
  notifier.cancelAll(); await reset;
  assert.equal(calls.length, 2);
});

test('missing notification tools report failure and macOS passes notification text as data to system tools', async t => {
  const missing = fixture(t, ({child}) => { const error = new Error('missing notify-send'); error.code = 'ENOENT'; child.emit('error', error); });
  await assert.rejects(missing.notifier.deliver(batch), /missing notify-send/);
  const mac = fixture(t); mac.notifier.platform = 'darwin';
  mac.notifier.defaultSound = () => 'Glass.aiff';
  await mac.notifier.deliver({...batch, sound: true, soundVolume: 20});
  assert.equal(mac.calls[0].program, '/usr/bin/osascript');
  assert.deepEqual(mac.calls[0].args.slice(-3), ['--', batch.title, batch.body]);
  assert.equal(mac.calls[1].program, '/usr/bin/afplay');
  assert.deepEqual(mac.calls[1].args, ['-v', '0.2', 'Glass.aiff']);
});

test('long POSIX storage paths use short owner-only sockets and distinct stores stay isolated',
  {skip: process.platform === 'win32'}, () => {
    const storage = path.join(os.tmpdir(), 'synthetic-storage', 'long'.repeat(80));
    const socket = localPipe(storage, BROKER_PROTOCOL_VERSION);
    assert.ok(Buffer.byteLength(socket) < 104);
    assert.equal(localPipe(storage, BROKER_PROTOCOL_VERSION), socket);
    assert.notEqual(localPipe(storage + '-other', BROKER_PROTOCOL_VERSION), socket);
    const info = fs.lstatSync(path.dirname(socket));
    assert.equal(info.uid, process.getuid()); assert.equal(info.mode & 0o777, 0o700);
    assert.equal(info.isSymbolicLink(), false);
  });
