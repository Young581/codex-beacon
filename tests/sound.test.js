'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {once} = require('node:events');
const {validateSoundFile, checkSoundFile, SoundSettings} = require('../ui/lib/sound');
const {formatBatch, validateOptions} = require('../ui/lib/broker-core');
const {WindowRegistry} = require('../ui/lib/routing');
const {powershell} = require('../ui/lib/ipc-security');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-sound-'));
  t.after(() => fs.promises.rm(dir, {recursive: true, force: true, maxRetries: 10, retryDelay: 100}));
  const wav = path.join(dir, "测试 tone's (1).wav");
  const buffer = Buffer.alloc(44 + 800);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(800, 40);
  fs.writeFileSync(wav, buffer);
  return {dir, wav};
}

test('audio paths preserve Unicode and quotes safe for MCI while rejecting nonlocal and injected paths', () => {
  const file = path.join(os.tmpdir(), "提示 tone's (1).MP3");
  assert.equal(validateSoundFile(file), file);
  assert.equal(validateSoundFile(''), '');
  for (const bad of [null, 1, {}, 'relative.wav', 'https://example.com/tone.mp3',
    '\\\\server\\tone.wav', '//server/tone.mp3', file + '"', file + '\n', path.join(os.tmpdir(), 'tone.exe')]) {
    assert.throws(() => validateSoundFile(bad));
    assert.throws(() => validateOptions({soundFile: bad}));
  }
  assert.deepEqual(validateOptions({sound: false, soundFile: file}), {desktop: true, sound: false, soundFile: file});
});

test('file checks reject missing, empty and directory audio without altering settings', async t => {
  const {dir, wav} = fixture(t);
  await checkSoundFile(wav);
  await checkSoundFile('');
  const empty = path.join(dir, 'empty.wav'); fs.writeFileSync(empty, '');
  const folder = path.join(dir, 'folder.wav'); fs.mkdirSync(folder);
  for (const file of [empty, folder, path.join(dir, 'missing.mp3')]) await assert.rejects(checkSoundFile(file));
});

test('sound selection uses a local picker in remote workspaces, persists globally and leaves muted settings intact', async t => {
  const {wav} = fixture(t);
  const values = {sound: false, soundFile: ''};
  const updates = [];
  let choice = 'file', selection = [{scheme: 'file', fsPath: wav}], previews = 0;
  const warnings = [];
  const vscode = {ConfigurationTarget: {Global: 1}, Uri: {file: fsPath => ({scheme: 'file', fsPath})}, window: {
    async showQuickPick(items) {return items.find(item => item.value === choice);},
    async showOpenDialog(options) {assert.equal(options.defaultUri.scheme, 'file'); return selection;},
    async showWarningMessage(message) {warnings.push(message);},
  }};
  const controller = new SoundSettings(vscode, {config: () => ({get: (key, fallback) => values[key] ?? fallback,
    async update(key, value, target) {values[key] = value; updates.push({key, value, target});}}),
    preview: async () => {previews++; return {preview: true};}});
  assert.deepEqual(await controller.choose(), {soundFile: wav});
  assert.deepEqual(updates[0], {key: 'soundFile', value: wav, target: 1});
  assert.equal(values.sound, false);
  choice = 'preview'; assert.deepEqual(await controller.choose(), {preview: true});
  assert.equal(previews, 1);
  choice = 'file'; selection = undefined;
  assert.deepEqual(await controller.choose(), {cancelled: true});
  assert.equal(values.soundFile, wav);
  selection = [{scheme: 'vscode-remote', fsPath: wav}];
  assert.ok((await controller.choose()).error); assert.equal(warnings.length, 1);
  assert.equal(values.soundFile, wav);
  choice = 'reset'; assert.deepEqual(await controller.choose(), {soundFile: ''});
  assert.equal(values.soundFile, '');
});

test('window policy rejects invalid sound paths atomically and preserves per-window selections', () => {
  const windows = new WindowRegistry();
  const wav = path.join(os.tmpdir(), 'tone.wav');
  const info = {id: 'a', sourceId: 'local', focused: false, policy: {soundFile: wav}};
  windows.update('a', info);
  windows.update('b', {...info, id: 'b', policy: {soundFile: ''}});
  assert.throws(() => windows.update('a', {...info, policy: {soundFile: 'relative.wav'}}));
  assert.equal(windows.windows.get('a').policy.soundFile, wav);
  assert.equal(windows.windows.get('b').policy.soundFile, '');
});

test('a merged batch plays once using the highest-priority audible event, including a system-default override', () => {
  const item = (type, soundFile, sound = true) => ({record: {key: type, event: {type, cwd: '/project', session_id: ''},
    source: {id: 'local'}}, options: {desktop: false, sound, soundFile}});
  const wav = path.join(os.tmpdir(), 'tone.wav');
  const other = path.join(os.tmpdir(), 'other.mp3');
  const done = item('done', wav), question = item('question', other), approval = item('approval', '');
  assert.equal(formatBatch([done]).soundFile, wav);
  assert.equal(formatBatch([done, question]).soundFile, other);
  assert.equal(formatBatch([done, question, approval]).soundFile, undefined);
  approval.options.sound = false;
  assert.equal(formatBatch([done, approval]).soundFile, wav);
  assert.equal(formatBatch([item('done', wav, false)]).sound, false);
  assert.equal(formatBatch([item('done', wav, false)]).soundFile, undefined);
});

test('real Windows helper decodes WAV and MP3 locally and rejects missing/corrupt audio without playing sound',
  {skip: process.platform !== 'win32', timeout: 45000}, t => {
    const {dir, wav} = fixture(t);
    // MPEG-1 Layer III, 128 kbit/s, 44.1 kHz; zero side-info/data produces silence.
    const frame = Buffer.alloc(417); Buffer.from([0xff, 0xfb, 0x90, 0x64]).copy(frame);
    const mp3 = path.join(dir, 'silent.mp3'); fs.writeFileSync(mp3, Buffer.concat(Array(12).fill(frame)));
    const corrupt = path.join(dir, 'corrupt.wav'); fs.writeFileSync(corrupt, 'invalid audio');
    const helper = path.resolve(__dirname, '../ui/assets/show-notification.ps1');
    for (const [file, valid] of [[wav, true], [mp3, true], [corrupt, false], [path.join(dir, 'missing.wav'), false]]) {
      const result = spawnSync(powershell(), ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', helper, '-CheckSoundFile', file], {windowsHide: true, encoding: 'utf8', timeout: 10000});
      assert.ifError(result.error);
      if (valid) {assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /Audio file decoded/);}
      else assert.notEqual(result.status, 0, 'Invalid audio must fail validation');
    }
  });

test('native sound delivery plays WAV, skips invalid muted audio and acknowledges fallback without a popup',
  {skip: process.platform !== 'win32', timeout: 20000}, async t => {
    const {NativeNotifier} = require('../ui/lib/broker');
    const {dir, wav} = fixture(t);
    const native = new NativeNotifier();
    const fallbacks = []; native.on('soundFallback', detail => fallbacks.push(detail));
    try {
      await native.deliver({title: 'Audio fixture', body: '', desktop: false, sound: true, soundFile: wav});
      await native.deliver({title: 'Muted fixture', body: '', desktop: false, sound: false, soundFile: 'invalid'});
      assert.equal(fallbacks.length, 0);
      const missing = path.join(dir, 'missing.wav');
      await native.deliver({title: 'Fallback fixture', body: '', desktop: false, sound: true, soundFile: missing});
      assert.deepEqual(fallbacks, [{soundFile: missing}]);
      assert.equal(native.clicks.size, 0);
    } finally {
      const exited = native.child ? once(native.child, 'exit') : Promise.resolve();
      native.close(); await exited;
    }
  });
