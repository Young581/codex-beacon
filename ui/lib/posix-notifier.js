'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {EventEmitter} = require('node:events');
const {validateSoundVolume, checkSoundFile} = require('./sound');

const APPLESCRIPT = 'on run argv\n display notification (item 2 of argv) with title (item 1 of argv)\nend run';
const escapeMarkup = text => String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Use maintained OS interfaces: libnotify/PipeWire on Linux and system
// AppleScript/afplay on macOS. No shell, package download or global volume edit.
class PosixNotifier extends EventEmitter {
  constructor({disabled = false, platform = process.platform, spawnImpl = spawn, env = process.env} = {}) {
    super();
    this.disabled = disabled;
    this.platform = platform;
    this.spawn = spawnImpl;
    this.env = {...env};
    this.closed = false;
    this.children = new Set();
    this.operations = new Map();
    this.clicks = new Map();
    this.generation = 0;
  }

  run(program, args, {keys, timeout = 30000} = {}) {
    if (this.closed) return Promise.reject(new Error('Notification helper is closed'));
    return new Promise((resolve, reject) => {
      let child;
      try { child = this.spawn(program, args, {env: this.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true}); }
      catch (error) { reject(error); return; }
      this.children.add(child);
      if (keys) this.clicks.set(child, {id: '', keys: [...keys]});
      let settled = false, buffer = '', stderr = '';
      const finish = error => {
        if (settled) return;
        settled = true;
        if (error) reject(error); else resolve();
      };
      this.operations.set(child, () => { finish(); child.kill(); });
      let timer = setTimeout(() => {
        finish(new Error('Native notification or audio helper timed out'));
        child.kill();
      }, keys ? 12000 : timeout);
      const cleanup = () => { clearTimeout(timer); this.children.delete(child); this.clicks.delete(child); this.operations.delete(child); };
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', data => {
        buffer += data;
        if (buffer.length > 4096) { finish(new Error('Invalid native notification response')); child.kill(); return; }
        let boundary;
        while ((boundary = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, boundary).trim(); buffer = buffer.slice(boundary + 1);
          const entry = this.clicks.get(child);
          if (!entry) continue;
          if (!entry.id && /^\d+$/u.test(line)) {
            entry.id = line;
            // notify-send waits for an action after acknowledging delivery.
            // Release the batch now, while keeping a bounded click listener.
            clearTimeout(timer);
            timer = setTimeout(() => child.kill(), 5 * 60000);
            timer.unref();
            finish();
          } else if (entry.id && line === 'default') {
            this.clicks.delete(child);
            if (entry.keys.length && !this.closed) this.emit('click', {id: entry.id, keys: entry.keys});
          }
        }
      });
      child.stderr.on('data', data => { stderr = (stderr + data.toString('utf8')).slice(0, 1000); });
      child.once('error', error => { cleanup(); finish(error); });
      child.once('close', code => {
        cleanup();
        finish(code === 0 && !keys ? null : new Error(stderr.trim() || `${program} exited before acknowledging delivery (${code})`));
      });
      while (this.clicks.size > 64) {
        const oldest = this.clicks.keys().next().value;
        this.clicks.delete(oldest); this.operations.get(oldest)?.();
      }
    });
  }

  async notify(batch) {
    if (this.platform === 'darwin') {
      return this.run('/usr/bin/osascript', ['-l', 'AppleScript', '-e', APPLESCRIPT, '--', batch.title, batch.body]);
    }
    if (this.platform !== 'linux') throw new Error('Native notifications are unavailable on this platform');
    const action = batch.language === 'en' ? 'Open conversation' : '打开对话';
    // stdbuf flushes the libnotify ID before its action wait loop. Without it,
    // stdout may stay buffered until the user dismisses the notification.
    return this.run('stdbuf', ['-oL', 'notify-send', '--print-id', '--wait', `--action=default=${action}`,
      '--app-name=Codex Beacon', '--expire-time=12000', '--hint=boolean:suppress-sound:true',
      '--icon=' + path.resolve(__dirname, '../assets/beacon.png'), '--', batch.title, escapeMarkup(batch.body)],
    {keys: batch.keys || []});
  }

  defaultSound() {
    const candidates = this.platform === 'darwin' ? ['/System/Library/Sounds/Glass.aiff'] : [
      '/usr/share/sounds/freedesktop/stereo/complete.oga', '/usr/share/sounds/Yaru/stereo/complete.oga',
      '/usr/share/sounds/freedesktop/stereo/message.oga',
    ];
    const file = candidates.find(value => fs.existsSync(value));
    if (!file) throw new Error('System notification sound was not found; select a WAV or MP3 file');
    return file;
  }

  async play(file, volume) {
    if (this.platform === 'darwin') return this.run('/usr/bin/afplay', ['-v', String(volume / 100), file]);
    const players = [
      ['pw-play', ['--volume=' + volume / 100, file]],
      ['paplay', ['--volume=' + Math.round(volume / 100 * 65536), file]],
      ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'error', '-volume', String(volume), file]],
    ];
    let failure;
    for (const [program, args] of players) {
      try { await this.run(program, args); return; }
      catch (error) { if (error.code !== 'ENOENT') throw error; failure = error; }
    }
    throw new Error('Install PipeWire (pw-play), PulseAudio (paplay), or FFmpeg (ffplay) to play notification sounds', {cause: failure});
  }

  async deliver(batch, latest = () => batch) {
    if (this.disabled) return;
    if (this.closed) throw new Error('Notification helper is closed');
    if (!['linux', 'darwin'].includes(this.platform)) throw new Error('Native notifications are unavailable on this platform');
    const generation = this.generation;
    const current = latest();
    if (!current) return;
    validateSoundVolume(current.soundVolume);
    if (current.desktop) await this.notify(current);
    // Reading/clearing while the helper starts must not revive an old sound.
    const remaining = latest();
    if (!remaining || this.closed || generation !== this.generation || !remaining.sound) return;
    const volume = validateSoundVolume(remaining.soundVolume);
    if (volume === 0) return;
    if (!remaining.soundFile) { await this.play(this.defaultSound(), volume); return; }
    try {
      await checkSoundFile(remaining.soundFile);
      if (!this.closed && generation === this.generation && latest()) await this.play(remaining.soundFile, volume);
    } catch (error) {
      if (this.closed || generation !== this.generation || !latest()) return;
      await this.play(this.defaultSound(), volume);
      this.emit('soundFallback', {soundFile: remaining.soundFile});
    }
  }

  cancel(keys) {
    const removed = new Set(keys);
    for (const [child, entry] of this.clicks) {
      entry.keys = entry.keys.filter(key => !removed.has(key));
      if (!entry.keys.length) { this.clicks.delete(child); this.operations.get(child)?.(); }
    }
  }
  cancelAll() {
    this.generation++;
    this.clicks.clear();
    for (const cancel of this.operations.values()) cancel();
  }
  close() { this.closed = true; this.cancelAll(); }
}
module.exports = {PosixNotifier};
