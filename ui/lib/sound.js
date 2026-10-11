'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {t} = require('./i18n');

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
  async choose() {
    const file = this.config().get('soundFile', '');
    const choice = await this.vscode.window.showQuickPick([
      {label: t('选择音频文件（WAV／MP3）'), value: 'file', description: file ? path.basename(file) : t('Windows 系统默认提示音')},
      {label: t('试听当前提示音'), value: 'preview'},
      {label: t('恢复系统默认提示音'), value: 'reset'},
    ], {title: t('自定义提示音')});
    if (!choice) return {cancelled: true};
    try {
      if (choice.value === 'preview') return await this.preview();
      if (choice.value === 'reset') return await this.reset();
      return await this.chooseFile();
    } catch (error) {
      await this.vscode.window.showWarningMessage(error.message);
      return {error: error.message};
    }
  }
  async reset() {
    await this.config().update('soundFile', '', this.vscode.ConfigurationTarget.Global);
    return {soundFile: ''};
  }
  async chooseFile() {
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
      await this.config().update('soundFile', soundFile, this.vscode.ConfigurationTarget.Global);
      return {soundFile};
    } catch (error) {
      await this.vscode.window.showWarningMessage(error.message);
      return {error: error.message};
    }
  }
}
module.exports = {validateSoundFile, checkSoundFile, SoundSettings};
