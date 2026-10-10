'use strict';
const {t} = require('./i18n');
const {normalizePath, matchLength} = require('./routing');

function destination(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid project window');
  const uri = value.workspaceUri;
  if (typeof uri !== 'string' || uri.length > 8192 || /[\u0000-\u001f\u007f]/u.test(uri)) throw new Error('Invalid project URI');
  const parsed = new URL(uri);
  if (!['file:', 'vscode-remote:'].includes(parsed.protocol) || !parsed.pathname.startsWith('/') ||
      parsed.search || parsed.hash || parsed.username || parsed.password ||
      parsed.protocol === 'vscode-remote:' && !parsed.host) throw new Error('Unsupported project URI');
  const label = value.label || '';
  if (typeof label !== 'string' || label.length > 200 || /[\u0000-\u001f\u007f]/u.test(label)) throw new Error('Invalid project label');
  return {workspaceUri: uri, label};
}

async function projectTarget(vscode, entry, {localSourceId, sourceId, workspaceUri, roots = []}) {
  if (entry.destination) return destination(entry.destination);
  const cwd = entry.event.cwd || entry.source.cwd;
  if (!cwd) return null;
  if (sourceId === entry.source.id && workspaceUri && matchLength(cwd, roots) >= 0) return destination({workspaceUri});
  const local = entry.source.id === localSourceId;
  // A local path from a remote host must never be interpreted as this PC's path.
  if (local) {
    if (!/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(cwd)) return null;
    return destination({workspaceUri: vscode.Uri.file(cwd).toString()});
  }
  // Older notifications lack an authority. VS Code's own recent-project list
  // can recover SSH/container identities; ambiguous hosts require a selection.
  let recent;
  try { recent = await vscode.commands.executeCommand('_workbench.getRecentlyOpened'); } catch { return null; }
  const candidates = new Map();
  for (const item of recent?.workspaces || []) {
    if (!item.folderUri) continue;
    try {
      const raw = item.folderUri;
      const uri = typeof raw === 'string' ? vscode.Uri.parse(raw) : vscode.Uri.from({scheme: raw.scheme,
        authority: raw.authority || '', path: raw.path || '', query: raw.query || '', fragment: raw.fragment || ''});
      if (uri.scheme !== 'vscode-remote') continue;
      const length = matchLength(cwd, [uri.path]);
      if (length < 0) continue;
      const value = destination({workspaceUri: uri.toString()});
      candidates.set(value.workspaceUri, {...value, length});
    } catch { /* Ignore malformed or unsupported recent entries. */ }
  }
  const ordered = [...candidates.values()].sort((a, b) => b.length - a.length);
  if (!ordered.length) return null;
  const best = ordered.filter(item => item.length === ordered[0].length);
  if (best.length === 1) return best[0];
  const selected = await vscode.window.showQuickPick(best.map(item => ({
    label: vscode.Uri.parse(item.workspaceUri).authority, description: normalizePath(cwd), value: item,
  })), {title: t('选择此项目的连接')});
  return selected?.value || null;
}

async function openProjectWindow(vscode, entry, context, {isCancelled = () => false} = {}) {
  const target = await projectTarget(vscode, entry, context);
  if (!target || isCancelled()) return {opened: false, reason: 'missing-project-connection'};
  // VS Code first matches an existing folder/workspace window, then creates a
  // new window if absent. The current window is not replaced.
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.parse(target.workspaceUri), {forceNewWindow: true});
  return {opened: !isCancelled(), workspaceUri: target.workspaceUri};
}
module.exports = {destination, projectTarget, openProjectWindow};
