'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const {t, getLanguage} = require('./i18n');
const {clean} = require('./presentation');
const {STATES, projectGroups, estimateCost, roundLabel, taskTooltip} = require('./tasks');

const ROW_ACTIONS = new Set(['open', 'window', 'read', 'delete']);
const GLOBAL_ACTIONS = new Set(['refresh', 'sound', 'soundFile', 'resetSound', 'preview', 'language', 'settings', 'status', 'pause', 'resume', 'privacy', 'clearRead',
  'openLocation', 'installation', 'history', 'clearHistory', 'markRead', 'testNotification', 'testCollector', 'restartCollector',
  'configureHook', 'removeHook', 'openCodex', 'privacyPolicy', 'clearPrivateData', 'clearLocalPrivateData', 'resumePrivateData']);
const SETTING_ACTIONS = {setLanguage: ['auto', 'zh-CN', 'en'], setOpenLocation: ['sidebar', 'editor'], setAutoHook: [true, false],
  chooseEventSound: ['done', 'question', 'approval'], previewEventSound: ['done', 'question', 'approval'], resetEventSound: ['done', 'question', 'approval']};
const LABELS = {
  eyebrow: '工作空间动态', title: '项目任务总览', subtitle: '查看任务名称、模型与进度，展开查看用量和详情。',
  projects: '项目', conversations: '对话', allConversations: '全部对话', roundHint: '轮次按当前保留的对话记录排序，筛选不会改变轮次。',
  allProjects: '全部项目', current: '本窗口', other: '其他窗口',
  tasks: '任务', running: '进行中', blocked: '等待处理', completed: '本轮完成', failed: '失败或取消',
  tokens: '已采集 Token', cost: 'API 费用估算', metered: '有用量记录', unpriced: '任务费用未知', partial: '含部分统计',
  unread: '未读', all: '全部', search: '搜索任务名称、项目或模型', searchLabel: '搜索任务',
  open: '打开会话', window: '打开项目窗口', read: '标为已读', delete: '删除任务记录',
  details: '任务详情', model: '模型', noUsage: '无用量', unknown: '未知', task: '本轮任务', turn: '轮次',
  refresh: '刷新', sound: '提示音', preview: '试听提示音', language: '语言', settings: '设置',
  pause: '暂停提醒', resume: '恢复提醒', privacy: '隐私与恢复', clearRead: '清空已读',
  status: '连接状态', connected: '通知后台已连接', disconnected: '正在重新连接', error: '采集异常',
  paused: '提醒已暂停', privacyPaused: '隐私清理后已暂停接收',
  emptyTitle: '还没有项目任务', emptyText: '在 VS Code 的 Codex 中开始任务，进度和用量会自动出现在这里。',
  noMatches: '没有匹配的任务', reset: '重置筛选', footer: '完成表示本轮回复结束；用量与估算费用见任务详情。',
  input: '输入', output: '输出', cached: '缓存命中', reasoning: '其中推理',
  updated: '最近更新', showAll: '查看全部任务',
  management: '管理与设置', alerts: '提醒与显示', tools: '测试与连接', records: '通知与数据', approval: '审批提醒',
  openLocation: '会话打开位置', sidebar: 'Codex 会话侧栏', editor: '主编辑器', autoLanguage: '跟随 VS Code',
  soundFile: '选择音频文件（WAV／MP3）', resetSound: '恢复系统默认提示音', defaultSound: 'Windows 系统默认提示音',
  soundScenario: '提示音场景', commonSound: '通用提示音', doneSound: '本轮完成提示音', questionSound: '等待回答提示音', approvalSound: '等待审批提示音',
  inheritSound: '跟随通用提示音', soundHint: '未单独设置的场景使用通用提示音；通用提示音为空时使用系统默认声音。',
  installation: '检查／安装当前环境组件', history: '查看通知历史', clearHistory: '清空全部通知', markRead: '全部标为已读',
  testNotification: '测试本机弹窗和声音', testCollector: '测试当前窗口采集链路', restartCollector: '重启当前环境采集器',
  autoHook: '自动添加审批 Hook', configureHook: '重新配置审批提醒', removeHook: '移除审批提醒', openCodex: '打开 Codex',
  hookConfigured: '审批 Hook 已注册', hookMissing: '审批 Hook 尚未注册', hookChecking: '正在检查审批 Hook',
  hookInstalling: '正在添加审批 Hook', hookError: '审批 Hook 配置异常',
  hookTrustHint: '请打开 Codex 设置 → Hooks → PermissionRequest，核对 Beacon 脚本并点击信任。已信任的无需重复操作。',
  hookUnknown: '插件无法确认 Codex 中的信任状态，请在 Hooks 页面核对。',
  hookAutoHint: '采集器正常启动后自动添加。移除 Hook 时会关闭自动添加，避免重新出现。',
  environment: '当前环境', collection: '采集器', privacyPolicy: '阅读隐私说明',
  clearPrivateData: '清理当前环境及本机通知数据', clearLocalPrivateData: '仅清理本机全部通知缓存',
  resumePrivateData: '恢复当前环境采集和本机接收', privacyHint: '隐私清理会先展示范围并确认，清理后暂停采集和接收。',
  removeHookConfirm: '移除当前环境的审批提醒并关闭自动添加？', clearHistoryConfirm: '清空全部通知记录？',
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

function dashboardData(snapshot, {windowId, options = {}, paused = false, connected = false, collectionState = '',
  collectionMessage = '', environment = '', approvalHook = {}, preferences = {}} = {}) {
  // Project tasks use the same grouping and price calculation as the sidebar.
  // Synthetic notification tests are not project work.
  const groups = projectGroups((snapshot.entries || []).filter(row => row.event.type !== 'test'), windowId);
  const rows = groups.flatMap(group => group.entries);
  const projects = groups.map(group => ({id: group.id, title: clean(group.title, 200), cwd: clean(group.cwd, 2048),
    source: clean(group.source.label || group.source.host, 200), current: group.current,
    conversations: group.conversations.map(chat => ({id: chat.id, title: chat.title, rounds: t`${chat.entries.length} 轮`,
      unread: chat.unread, active: chat.active})),
    totals: usageTotals(group.entries, options), tasks: group.entries.map((row, index) => {
      const usage = row.telemetry?.usage;
      const segments = usage?.segments || [];
      const cost = estimateCost(usage, options);
      const sums = Object.fromEntries(['input', 'output', 'cachedInput', 'reasoningOutput']
        .map(key => [key, segments.reduce((sum, segment) => sum + (segment[key] || 0), 0)]));
      return {key: row.key, index: index + 1, state: row.taskState,
        stateLabel: t((STATES[row.taskState] || STATES.unknown)[0]), unread: !row.read,
        model: clean([...new Set(segments.map(segment => segment.model).filter(Boolean))].join(', ') || row.telemetry?.model, 200),
        title: group.conversations.find(chat => chat.id === row.conversationId)?.title || t('未命名对话'),
        conversationId: row.conversationId, turnNumber: row.turnNumber, roundLabel: roundLabel(row),
        turn: clean(row.event.turn_id, 256),
        session: clean(row.event.session_id, 256), time: row.receivedAt,
        tokens: segments.length ? sums.input + sums.output : null, cost: cost.amount,
        complete: !!usage?.complete, counts: sums, details: taskTooltip(row, options)};
    })}));
  return {language: getLanguage(), text: Object.fromEntries(Object.entries(LABELS).map(([key, label]) => [key, t(label)])),
    connected, collectionState, paused: paused || !!snapshot.privacyPaused, privacyPaused: !!snapshot.privacyPaused,
    management: {environment: clean(environment, 200), collectionMessage: clean(collectionMessage, 1000),
      hook: {configured: approvalHook.configured === true, setup: clean(approvalHook.setup || 'checking', 40),
        autoEnabled: approvalHook.autoEnabled !== false, trust: 'unknown'},
      language: ['auto', 'zh-CN', 'en'].includes(preferences.language) ? preferences.language : 'auto',
      openLocation: preferences.openLocation === 'editor' ? 'editor' : 'sidebar',
      soundName: clean(path.basename(preferences.soundFile || ''), 200),
      eventSounds: Object.fromEntries([['done', 'soundFileOnDone'], ['question', 'soundFileOnQuestion'], ['approval', 'soundFileOnApproval']]
        .map(([type, key]) => [type, clean(path.basename(preferences[key] || ''), 200)]))},
    totals: {...usageTotals(rows, options), projects: groups.length, tasks: rows.length,
      running: rows.filter(row => ['running', 'waiting_async'].includes(row.taskState)).length,
      blocked: rows.filter(row => ['waiting_input', 'waiting_approval', 'waiting_async'].includes(row.taskState)).length,
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
    this.requestedPage = null;
  }
  open(page) {
    if (this.disposed) return;
    if (['tasks', 'management'].includes(page)) this.requestedPage = page;
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
    if (this.ready) {
      this.post(this.panel, {type: 'data', revision: this.revision, data: this.model});
      if (this.requestedPage) {
        this.post(this.panel, {type: 'view', page: this.requestedPage});
        this.requestedPage = null;
      }
    }
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
    const settingAction = Object.hasOwn(SETTING_ACTIONS, message.action);
    if (!rowAction && !GLOBAL_ACTIONS.has(message.action) && !settingAction) return;
    if (settingAction ? !SETTING_ACTIONS[message.action].includes(message.value) : message.value !== undefined) return;
    if (rowAction && (typeof message.key !== 'string' || !this.model?.projects.some(project =>
      project.tasks.some(task => task.key === message.key)))) return;
    if (!rowAction && message.key !== undefined) return;
    this.lastRequest = message.id;
    if (this.busy) {this.post(panel, {type: 'result', id: message.id, busy: true}); return;}
    this.busy = true;
    try {
      const result = settingAction ? await this.action(message.action, undefined, message.value)
        : await this.action(message.action, rowAction ? message.key : undefined);
      if (result?.error) throw new Error(result.error);
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
