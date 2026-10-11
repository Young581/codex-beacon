'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const {t, getLanguage} = require('./i18n');
const {clean} = require('./presentation');
const {STATES, projectGroups, estimateCost, taskTooltip} = require('./tasks');

const ROW_ACTIONS = new Set(['open', 'window', 'read', 'delete']);
const GLOBAL_ACTIONS = new Set(['refresh', 'sound', 'preview', 'language', 'settings', 'status', 'pause', 'resume', 'privacy', 'clearRead']);
const LABELS = {
  eyebrow: '工作空间动态', title: '项目任务总览', subtitle: '跟踪每个项目的进度，用量与提醒。',
  projects: '项目', allProjects: '全部项目', current: '本窗口', other: '其他窗口',
  tasks: '任务', running: '进行中', blocked: '等待处理', completed: '本轮完成', failed: '失败或取消',
  tokens: '已采集 Token', cost: 'API 费用估算', metered: '有用量记录', unpriced: '任务费用未知', partial: '含部分统计',
  unread: '未读', all: '全部', search: '搜索项目、模型或会话', searchLabel: '搜索任务',
  open: '打开会话', window: '打开项目窗口', read: '标为已读', delete: '删除任务记录',
  details: '任务详情', model: '模型', noUsage: '无用量', unknown: '未知', task: '本轮任务',
  refresh: '刷新', sound: '提示音', preview: '试听提示音', language: '语言', settings: '设置',
  pause: '暂停提醒', resume: '恢复提醒', privacy: '隐私与恢复', clearRead: '清空已读',
  status: '连接状态', connected: '通知后台已连接', disconnected: '正在重新连接', error: '采集异常',
  paused: '提醒已暂停', privacyPaused: '隐私清理后已暂停接收',
  emptyTitle: '还没有项目任务', emptyText: '在 VS Code 的 Codex 中开始任务，进度和用量会自动出现在这里。',
  noMatches: '没有匹配的任务', reset: '重置筛选', footer: '仅统计保留的任务记录；金额为 API 估算，完成表示本轮回复结束。',
  input: '输入', output: '输出', cached: '缓存命中', reasoning: '其中推理',
  updated: '最近更新', showAll: '查看全部任务',
};

function usageTotals(rows, options) {
  let tokens = 0, amount = 0, metered = 0, unpriced = 0, partial = false;
  for (const row of rows) {
    const usage = row.telemetry?.usage;
    if (usage?.segments?.length) {
      metered++;
      tokens += usage.segments.reduce((sum, segment) => sum + segment.input + segment.output, 0);
      partial ||= !usage.complete;
    }
    const cost = estimateCost(usage, options);
    if (cost.amount === null) unpriced++;
    else amount += cost.amount;
  }
  return {tokens: metered ? tokens : null, amount: unpriced === rows.length ? null : amount, metered, unpriced, partial};
}

function dashboardData(snapshot, {windowId, options = {}, paused = false, connected = false, collectionState = ''} = {}) {
  // Project tasks use the same grouping and price calculation as the sidebar.
  // Synthetic notification tests are not project work.
  const groups = projectGroups((snapshot.entries || []).filter(row => row.event.type !== 'test'), windowId);
  const rows = groups.flatMap(group => group.entries);
  const projects = groups.map(group => ({id: group.id, title: clean(group.title, 200), cwd: clean(group.cwd, 2048),
    source: clean(group.source.label || group.source.host, 200), current: group.current,
    totals: usageTotals(group.entries, options), tasks: group.entries.map((row, index) => {
      const usage = row.telemetry?.usage;
      const segments = usage?.segments || [];
      const cost = estimateCost(usage, options);
      const sums = Object.fromEntries(['input', 'output', 'cachedInput', 'reasoningOutput']
        .map(key => [key, segments.reduce((sum, segment) => sum + (segment[key] || 0), 0)]));
      return {key: row.key, index: index + 1, state: row.taskState,
        stateLabel: t((STATES[row.taskState] || STATES.unknown)[0]), unread: !row.read,
        model: clean([...new Set(segments.map(segment => segment.model).filter(Boolean))].join(', ') || row.telemetry?.model, 200),
        session: clean(row.event.session_id, 256), time: row.receivedAt,
        tokens: segments.length ? sums.input + sums.output : null, cost: cost.amount,
        complete: !!usage?.complete, counts: sums, details: taskTooltip(row, options)};
    })}));
  return {language: getLanguage(), text: Object.fromEntries(Object.entries(LABELS).map(([key, label]) => [key, t(label)])),
    connected, collectionState, paused: paused || !!snapshot.privacyPaused, privacyPaused: !!snapshot.privacyPaused,
    totals: {...usageTotals(rows, options), projects: groups.length, tasks: rows.length,
      running: rows.filter(row => ['running', 'waiting_async'].includes(row.taskState)).length,
      blocked: rows.filter(row => ['waiting_input', 'waiting_approval'].includes(row.taskState)).length,
      completed: rows.filter(row => row.taskState === 'completed').length, unread: rows.filter(row => !row.read).length},
    projects};
}

function html(vscode, webview, extensionPath) {
  const nonce = crypto.randomBytes(24).toString('base64');
  const uri = name => webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'assets', name))).toString();
  const escape = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${escape(webview.cspSource)}; script-src 'nonce-${nonce}'; img-src ${escape(webview.cspSource)}; font-src ${escape(webview.cspSource)};">
<link rel="stylesheet" href="${escape(uri('dashboard.css'))}"><title>Codex Beacon</title></head>
<body><div id="app" aria-busy="true"></div><script nonce="${nonce}" src="${escape(uri('dashboard.js'))}"></script></body></html>`;
}

class Dashboard {
  constructor(vscode, context, {data, action, log = () => {}}) {
    Object.assign(this, {vscode, context, data, action, log});
    this.panel = null;
    this.model = null;
    this.lastRequest = 0;
    this.ready = false;
    this.busy = false;
    this.disposed = false;
    this.revision = 0;
  }
  open() {
    if (this.disposed) return;
    if (this.panel) {this.panel.reveal(this.vscode.ViewColumn.One); this.update(); return;}
    const panel = this.vscode.window.createWebviewPanel('codexBeacon.dashboard', t('Codex Beacon · 仪表盘'),
      this.vscode.ViewColumn.One, {enableScripts: true, retainContextWhenHidden: true,
        localResourceRoots: [this.vscode.Uri.file(path.join(this.context.extensionPath, 'assets'))]});
    this.panel = panel;
    this.ready = false; this.lastRequest = 0;
    const receiver = panel.webview.onDidReceiveMessage(message => this.receive(panel, message));
    panel.onDidDispose(() => {
      receiver.dispose();
      if (this.panel === panel) {this.panel = null; this.ready = false; this.model = null;}
    });
    panel.webview.html = html(this.vscode, panel.webview, this.context.extensionPath);
    this.update();
  }
  update() {
    if (!this.panel || this.disposed) return;
    this.model = this.data(); this.revision++;
    this.panel.title = t('Codex Beacon · 仪表盘');
    if (this.ready) this.post(this.panel, {type: 'data', revision: this.revision, data: this.model});
  }
  post(panel, value) {
    if (this.panel !== panel || this.disposed) return;
    Promise.resolve(panel.webview.postMessage(value)).catch(error => this.log(error.message));
  }
  async receive(panel, message) {
    if (this.panel !== panel || this.disposed || !message || typeof message !== 'object') return;
    if (message.type === 'ready') {this.ready = true; this.update(); return;}
    if (message.type !== 'action' || !Number.isSafeInteger(message.id) || message.id <= this.lastRequest ||
        typeof message.action !== 'string') return;
    const rowAction = ROW_ACTIONS.has(message.action);
    if (!rowAction && !GLOBAL_ACTIONS.has(message.action)) return;
    if (rowAction && (typeof message.key !== 'string' || !this.model?.projects.some(project =>
      project.tasks.some(task => task.key === message.key)))) return;
    if (!rowAction && message.key !== undefined) return;
    this.lastRequest = message.id;
    if (this.busy) {this.post(panel, {type: 'result', id: message.id, busy: true}); return;}
    this.busy = true;
    try {
      await this.action(message.action, rowAction ? message.key : undefined);
      this.update();
      this.post(panel, {type: 'result', id: message.id});
    } catch (error) {
      this.log(error.message);
      this.post(panel, {type: 'result', id: message.id, error: clean(error.message, 1000)});
    } finally {this.busy = false;}
  }
  dispose() {
    this.disposed = true;
    this.model = null;
    this.panel?.dispose(); this.panel = null;
  }
}
module.exports = {Dashboard, dashboardData, usageTotals, html, LABELS};
