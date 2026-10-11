'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {t} = require('./i18n');
const SOUND_KEYS = {default: 'soundFile', done: 'soundFileOnDone', question: 'soundFileOnQuestion', approval: 'soundFileOnApproval'};
function soundKey(type = 'default') {
  if (typeof type !== 'string' || !Object.hasOwn(SOUND_KEYS, type)) throw new Error('Invalid sound event');
  return SOUND_KEYS[type];
}
function resolveSoundFile(config, type = 'default') {
  const override = config.get(soundKey(type), '');
  return validateSoundFile(override || config.get('soundFile', ''));
}

function validateSoundFile(value = '') {
  if (typeof value !== 'string' || value.length > 2048 || /["\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(t('提示音路径无效。请选择本机 WAV 或 MP3 文件。'));
  }
  if (value && (!path.isAbsolute(value) || /^[\\/]{2}/u.test(value) || !/\.(wav|mp3)$/iu.test(value))) {
    throw new Error(t('提示音路径无效。请选择本机 WAV 或 MP3 文件。'));
  }
  return value;
}

async function checkSoundFile(value) {
  validateSoundFile(value);
  if (!value) return;
  try {
    const info = await fs.promises.stat(value);
    if (!info.isFile() || !info.size) throw new Error('Not a nonempty audio file');
    await fs.promises.access(value, fs.constants.R_OK);
  } catch {
    throw new Error(t('无法读取提示音文件。请重新选择本机 WAV 或 MP3 文件。'));
  }
}

class SoundSettings {
  constructor(vscode, {config, preview}) {
    this.vscode = vscode;
    this.config = config;
    this.preview = preview;
  }
  async choose(type = 'default') {
    const file = this.config().get(soundKey(type), '');
    const choice = await this.vscode.window.showQuickPick([
      {label: t('选择音频文件（WAV／MP3）'), value: 'file', description: file ? path.basename(file) :
        t(type === 'default' ? 'Windows 系统默认提示音' : '跟随通用提示音')},
      {label: t('试听当前提示音'), value: 'preview'},
      {label: t(type === 'default' ? '恢复系统默认提示音' : '跟随通用提示音'), value: 'reset'},
      ...(type === 'default' ? ['done', 'question', 'approval'].map(value => ({
        label: t({done: '本轮完成提示音', question: '等待回答提示音', approval: '等待审批提示音'}[value]), value})) : []),
    ], {title: t('自定义提示音')});
    if (!choice) return {cancelled: true};
    try {
      if (choice.value === 'preview') return await this.preview(type);
      if (choice.value === 'reset') return await this.reset(type);
      if (['done', 'question', 'approval'].includes(choice.value)) return await this.choose(choice.value);
      return await this.chooseFile(type);
    } catch (error) {
      await this.vscode.window.showWarningMessage(error.message);
      return {error: error.message};
    }
  }
  async reset(type = 'default') {
    await this.config().update(soundKey(type), '', this.vscode.ConfigurationTarget.Global);
    return {soundFile: ''};
  }
  async chooseFile(type = 'default') {
    const key = soundKey(type);
    try {
      const selected = await this.vscode.window.showOpenDialog({
        title: t('选择本机提示音'), openLabel: t('使用此提示音'),
        canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
        // Force the local file picker, including in SSH/container workspaces.
        defaultUri: this.vscode.Uri.file(os.homedir()), filters: {Audio: ['wav', 'mp3']},
      });
      if (!selected?.length) return {cancelled: true};
      if (selected[0].scheme !== 'file') throw new Error(t('提示音路径无效。请选择本机 WAV 或 MP3 文件。'));
      const soundFile = selected[0].fsPath;
      await checkSoundFile(soundFile);
      await this.config().update(key, soundFile, this.vscode.ConfigurationTarget.Global);
      return {soundFile};
    } catch (error) {
      await this.vscode.window.showWarningMessage(error.message);
      return {error: error.message};
    }
  }
}
module.exports = {SOUND_KEYS, soundKey, resolveSoundFile, validateSoundFile, checkSoundFile, SoundSettings};
