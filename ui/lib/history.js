'use strict';
const crypto = require('node:crypto');
const {t, getLanguage} = require('./i18n');
const {clean, projectName, eventTitle, historyGroups} = require('./presentation');
const {STATES, projectGroups, usageDescription, taskTooltip} = require('./tasks');

class HistoryView {
  constructor(vscode, windowId, options = {}) {
    this.vscode = vscode;
    this.windowId = windowId;
    this.options = typeof options === 'function' ? options : () => options;
    this.entries = [];
    this.groups = [];
    this.changed = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changed.event;
  }
  update(entries) {
    this.entries = entries;
    this.groups = this.options().groupBy === 'history' ? historyGroups(entries, this.windowId) : projectGroups(entries, this.windowId);
    this.changed.fire();
  }
  getChildren(element) { return element?.entries || this.groups; }
  getParent(entry) { return this.groups.find(group => group.entries.some(item => item.key === entry.key)); }
  keysFor(key) {
    const row = this.groups.flatMap(group => group.entries).find(row => row.key === key || row.relatedKeys?.includes(key));
    return row?.relatedKeys || [key];
  }
  getTreeItem(entry) {
    const vscode = this.vscode;
    if (entry.project) {
      const item = new vscode.TreeItem(`${entry.title} (${entry.entries.length})`,
        entry.current || entry.active || entry.unread ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
      item.id = entry.id;
      const running = entry.entries.filter(row => row.taskState === 'running').length;
      const waiting = entry.entries.filter(row => ['waiting_input', 'waiting_approval'].includes(row.taskState)).length;
      const segments = entry.entries.flatMap(row => row.telemetry?.usage?.segments || []);
      const complete = entry.entries.every(row => row.telemetry?.usage?.complete && row.telemetry.usage.segments.length);
      item.description = [entry.current ? t('本窗口') : t('其他窗口'), clean(entry.source.label || entry.source.host, 80),
        ...(running ? [t`${running} 进行中`] : []), ...(waiting ? [t`${waiting} 阻塞`] : [])].join(' · ');
      item.tooltip = `${clean(entry.cwd, 2048)}\n${item.description}\n${t('已采集任务合计')}: ${usageDescription({usage: {segments, complete}}, this.options())}`;
      item.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor(waiting ? 'charts.orange' : running ? 'charts.blue' : 'descriptionForeground'));
      item.contextValue = 'projectTaskGroup';
      return item;
    }
    if (entry.entries) {
      const item = new vscode.TreeItem(`${entry.title} (${entry.entries.length})`, entry.unread ?
        vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
      item.id = entry.id;
      item.iconPath = new vscode.ThemeIcon(entry.unread ? 'circle-filled' : 'check-all',
        new vscode.ThemeColor(entry.unread ? 'list.warningForeground' : 'descriptionForeground'));
      item.contextValue = entry.unread ? 'unreadNotificationGroup' : 'readNotificationGroup';
      return item;
    }
    if (entry.taskState) {
      const [state, icon, color] = STATES[entry.taskState] || STATES.unknown;
      const shortSession = clean(entry.event.session_id, 8);
      const shortTurn = clean(entry.event.turn_id, 8);
      const label = `${entry.read ? '' : '● '}${t(state)} · ${t('任务')} ${shortSession}${shortTurn ? '/' + shortTurn : ''}`;
      const item = new vscode.TreeItem(entry.read ? label : {label, highlights: [[0, label.length]]}, vscode.TreeItemCollapsibleState.None);
      item.id = 'task-' + crypto.createHash('sha256').update(entry.taskId).digest('hex');
      item.description = usageDescription(entry.telemetry, this.options());
      item.tooltip = taskTooltip(entry, this.options());
      item.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
      item.command = {command: 'codexNotifier.showEntry', title: t('打开对应会话并标为已读'), arguments: [entry.key]};
      item.contextValue = entry.read ? 'readNotification' : 'unreadNotification';
      item.accessibilityInformation = {label: `${label}，${item.description}`};
      return item;
    }
    const project = projectName(entry.event.cwd);
    const label = `${entry.read ? t('已读') : t('● 未读')} · ${project} · ${eventTitle(entry).split(' · ')[0]}`;
    const item = new vscode.TreeItem(entry.read ? label : {label, highlights: [[0, label.length]]}, vscode.TreeItemCollapsibleState.None);
    item.id = entry.key;
    const date = new Date(entry.receivedAt);
    item.description = `${clean(entry.targetWindowLabel || entry.source.label || entry.source.host, 160)} · ${date.toLocaleTimeString(getLanguage())}`;
    item.tooltip = t`${entry.read ? t('已读') : t('未读')} · ${eventTitle(entry)}\n目标窗口：${clean(entry.targetWindowLabel) || t('尚未连接')}\n目录：${clean(entry.event.cwd)}\n会话：${clean(entry.event.session_id)}\n${date.toLocaleString(getLanguage())}\n单击静默标记并打开对应会话`;
    item.iconPath = new vscode.ThemeIcon(entry.read ? 'check' : 'circle-filled', new vscode.ThemeColor(entry.read ?
      'descriptionForeground' : ['approval', 'question'].includes(entry.event.type) ? 'list.errorForeground' : 'list.warningForeground'));
    item.command = {command: 'codexNotifier.showEntry', title: t('打开对应会话并标为已读'), arguments: [entry.key]};
    item.contextValue = entry.read ? 'readNotification' : 'unreadNotification';
    item.accessibilityInformation = {label: `${label}，${item.description}`};
    return item;
  }
  dispose() { this.changed.dispose(); }
}
module.exports = {HistoryView};
