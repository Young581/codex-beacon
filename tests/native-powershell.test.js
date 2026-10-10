'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

test('native notification and taskbar helpers work when PATH cannot locate PowerShell',
  {skip: process.platform !== 'win32', timeout: 40000}, () => {
    const env = {...process.env, ELECTRON_RUN_AS_NODE: '1'};
    for (const key of Object.keys(env)) if (/^path$/i.test(key)) delete env[key];
    env.PATH = '';
    const source = `
      const assert = require('node:assert/strict');
      const {spawnSync} = require('node:child_process');
      const {NativeNotifier} = require(${JSON.stringify(path.resolve(__dirname, '../ui/lib/broker'))});
      const {WindowAttentionNative} = require(${JSON.stringify(path.resolve(__dirname, '../ui/lib/window-attention-native'))});
      (async () => {
        const missing = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'exit 0'], {windowsHide: true});
        assert.equal(missing.error?.code, 'ENOENT', 'Fixture must reproduce the missing PATH entry');
        const notification = new NativeNotifier();
        const attention = new WindowAttentionNative();
        try {
          // Real helper acknowledgement, with popup and sound disabled.
          await notification.deliver({title: 'Codex test', body: 'Synthetic PATH regression', desktop: false, sound: false});
          assert.deepEqual(await attention.request('release', {id: 'path-regression-unused'}), {released: true});
          console.log('PASS native notification and taskbar helper with empty PATH');
        } finally { notification.close(); attention.close(); }
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    const result = spawnSync(process.execPath, ['-e', source], {
      env, encoding: 'utf8', windowsHide: true, timeout: 35000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /PASS native notification and taskbar helper with empty PATH/);
  });
