'use strict';
const crypto = require('node:crypto');
const {t, getLanguage} = require('./i18n');
const {clean, projectName} = require('./presentation');

const STATES = {
  running: ['进行中', 'sync~spin', 'charts.blue'],
  waiting_input: ['阻塞 · 等待回答', 'question', 'charts.yellow'],
  waiting_async: ['等待回答 · 继续运行', 'comment-discussion', 'charts.purple'],
  waiting_approval: ['阻塞 · 等待审批', 'shield', 'charts.orange'],
  completed: ['本轮完成', 'pass-filled', 'charts.green'],
  failed: ['失败', 'error', 'charts.red'],
  cancelled: ['已取消', 'circle-slash', 'descriptionForeground'],
  unknown: ['状态未确认', 'question', 'descriptionForeground'],
};
// USD / million tokens, official standard short-context rates checked 2026-10-10.
// Cache writes are a subset of input, reasoning tokens a subset of output.
const DEFAULT_PRICES = {
  'gpt-6.1-sol': {input: 2, cachedInput: 0.1, cacheWrite: 2.5, output: 10, long: {input: 4, cachedInput: 0.2, cacheWrite: 5, output: 15}},
  'gpt-6-astra': {input: 10, cachedInput: 1, cacheWrite: 12.5, output: 50, long: {input: 20, cachedInput: 2, cacheWrite: 25, output: 75}},
  'gpt-6-luna': {input: 0.1, cachedInput: 0.01, cacheWrite: 0.125, output: 0.5, long: {input: 0.2, cachedInput: 0.02, cacheWrite: 0.25, output: 0.75}},
  'gpt-5.6-sol': {input: 4, cachedInput: 0.4, cacheWrite: 5, output: 20, long: {input: 8, cachedInput: 0.8, cacheWrite: 10, output: 30}},
  'gpt-5.3-codex': {input: 1.75, cachedInput: 0.175, output: 14},
};

function pathIdentity(cwd) {
  let result = clean(cwd, 2048).replace(/\\/g, '/').replace(/\/+$/, '');
  if (/^[a-z]:\//i.test(result) || result.startsWith('//')) result = result.toLowerCase();
  return result || '/';
}
function taskIdentity(entry) {
  const event = entry.event;
  return JSON.stringify([entry.source.id, pathIdentity(event.cwd || entry.source.cwd), event.session_id,
    event.turn_id || event.id]);
}
function inferredState(event) {
  return {done: 'completed', question: 'waiting_input', approval: 'waiting_approval'}[event.type] || 'unknown';
}
function taskRows(entries) {
  const tasks = new Map();
  for (const entry of [...entries].sort((a, b) => a.event.timestamp - b.event.timestamp || a.receivedAt - b.receivedAt)) {
    const id = taskIdentity(entry);
    let row = tasks.get(id);
    if (!row) { row = {id, records: []}; tasks.set(id, row); }
    row.records.push(entry);
  }
  return [...tasks.values()].map(row => {
    const ordered = row.records;
    const alerts = ordered.filter(entry => entry.event.type !== 'task');
    const unread = alerts.filter(entry => !entry.read);
    const representative = unread.at(-1) || alerts.at(-1) || ordered.at(-1);
    const telemetry = ordered.filter(entry => entry.event.task).sort((a, b) =>
      a.event.task.sequence - b.event.task.sequence || a.receivedAt - b.receivedAt).at(-1);
    const latest = ordered.at(-1);
    let state = telemetry?.event.task.state || inferredState(latest.event);
    // Hook approval can arrive after the most recent rollout snapshot.
    if (latest.event.type !== 'task' && latest.event.timestamp > (telemetry?.event.timestamp || 0)) state = inferredState(latest.event);
    const target = latest.targetWindowId || representative.targetWindowId;
    if (!target && ['running', 'waiting_input', 'waiting_async', 'waiting_approval'].includes(state)) state = 'unknown';
    return {...representative, taskId: row.id, records: ordered, relatedKeys: ordered.map(entry => entry.key),
      read: unread.length === 0, taskState: state, telemetry: telemetry?.event.task,
      receivedAt: Math.max(...ordered.map(entry => entry.receivedAt)), targetWindowId: target};
  });
}

function roundLabel(row) { return t`第 ${row.turnNumber || 1} 轮`; }
function conversationGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    const identity = JSON.stringify([row.source.id, pathIdentity(row.event.cwd || row.source.cwd), row.event.session_id || row.taskId]);
    if (!groups.has(identity)) groups.set(identity, {
      id: 'conversation-' + crypto.createHash('sha256').update(identity).digest('hex'), conversation: true, entries: [],
    });
    groups.get(identity).entries.push(row);
  }
  const order = row => {
    const sequences = row.records.filter(record => record.event.task).map(record => record.event.task.sequence);
    return {sequence: sequences.length ? Math.min(...sequences) : null,
      time: Math.min(...row.records.map(record => record.event.timestamp))};
  };
  return [...groups.values()].map(group => {
    // Numbers describe retained rounds, not the lifetime count of a Codex chat.
    // Rollout sequence is a file position, so state updates preserve turn order.
    const useSequences = group.entries.every(row => order(row).sequence !== null);
    const chronological = [...group.entries].sort((a, b) => {
      const left = order(a), right = order(b);
      return (useSequences ? left.sequence - right.sequence : left.time - right.time) ||
        a.taskId.localeCompare(b.taskId);
    });
    chronological.forEach((row, index) => {row.turnNumber = index + 1; row.conversationId = group.id;});
    const named = [...group.entries].sort((a, b) => b.receivedAt - a.receivedAt).find(row => row.event.session_title);
    group.title = clean(named?.event.session_title, 160) || t('未命名对话');
    group.unread = group.entries.some(row => !row.read);
    group.active = group.entries.some(row => ['running', 'waiting_input', 'waiting_async', 'waiting_approval'].includes(row.taskState));
    group.receivedAt = Math.max(...group.entries.map(row => row.receivedAt));
    return group;
  }).sort((a, b) => Number(b.active) - Number(a.active) || Number(b.unread) - Number(a.unread) || b.receivedAt - a.receivedAt);
}

function projectGroups(entries, windowId) {
  const projects = new Map();
  for (const row of taskRows(entries)) {
    const cwd = row.event.cwd || row.source.cwd;
    const isTest = row.event.type === 'test';
    const identity = JSON.stringify([row.source.id, pathIdentity(cwd), ...(isTest ? ['test'] : [])]);
    if (!projects.has(identity)) projects.set(identity, {
      id: 'project-' + crypto.createHash('sha256').update(identity).digest('hex'),
      title: isTest ? t('测试') : projectName(cwd), cwd, source: row.source, entries: [], project: true, test: isTest,
    });
    projects.get(identity).entries.push(row);
  }
  const priority = {waiting_approval: 0, waiting_input: 1, waiting_async: 2, running: 3, failed: 4, unknown: 5, completed: 6, cancelled: 7};
  return [...projects.values()].map(group => {
    group.entries.sort((a, b) => (priority[a.taskState] ?? 7) - (priority[b.taskState] ?? 7) || b.receivedAt - a.receivedAt);
    group.unread = group.entries.some(row => !row.read);
    group.current = group.entries.some(row => row.targetWindowId === windowId);
    group.active = group.entries.some(row => ['running', 'waiting_input', 'waiting_async', 'waiting_approval'].includes(row.taskState));
    group.conversations = group.test ? [] : conversationGroups(group.entries);
    return group;
  }).sort((a, b) => Number(b.current) - Number(a.current) || Number(b.active) - Number(a.active) ||
    Number(b.unread) - Number(a.unread) || a.title.localeCompare(b.title));
}

function estimateCost(usage, options = {}) {
  if (!usage?.segments?.length) return {amount: null, reason: 'no-usage'};
  let amount = 0;
  for (const segment of usage.segments) {
    const overridden = Object.hasOwn(options.modelPrices || {}, segment.model);
    let rates = overridden ? options.modelPrices[segment.model] : DEFAULT_PRICES[segment.model];
    if (options.pricingContext === 'long' && !overridden) rates = rates?.long;
    if (!rates || !['input', 'cachedInput', 'output'].every(key => Number.isFinite(rates[key]) && rates[key] >= 0) ||
        (segment.cacheWrite > 0 && (!Number.isFinite(rates.cacheWrite) || rates.cacheWrite < 0))) {
      return {amount: null, reason: 'no-price', model: segment.model};
    }
    // Custom rates are final prices; tier multipliers apply only to defaults.
    const tier = options.pricingTier === 'auto' || !options.pricingTier ? segment.tier || 'standard' : options.pricingTier;
    const multiplier = overridden ? 1 : {standard: 1, default: 1, auto: 1, priority: 2, fast: 2, ultrafast: 6, batch: 0.5, flex: 0.5}[tier];
    if (multiplier === undefined) return {amount: null, reason: 'unknown-tier'};
    if (!overridden && segment.model === 'gpt-5.3-codex' && !['standard', 'default', 'auto', 'fast', 'priority'].includes(tier)) return {amount: null, reason: 'unknown-tier'};
    if (!overridden && segment.model === 'gpt-5.6-sol' && !['standard', 'default', 'auto'].includes(tier)) return {amount: null, reason: 'unknown-tier'};
    amount += ((segment.input - segment.cachedInput - segment.cacheWrite) * rates.input +
      segment.cachedInput * rates.cachedInput + segment.cacheWrite * (rates.cacheWrite || 0) + segment.output * rates.output) / 1e6 * multiplier;
  }
  return {amount: Number.isFinite(amount) ? amount : null, partial: !usage.complete};
}
function number(value) { return value.toLocaleString(getLanguage()); }
function usageDescription(task, options) {
  const usage = task?.usage;
  if (!usage?.segments?.length) return t('Token 未提供') + ' · ' + t('费用未知');
  const tokens = usage.segments.reduce((sum, s) => sum + s.input + s.output, 0);
  const cost = estimateCost(usage, options);
  const tokenLabel = `${number(tokens)} tokens${usage.complete ? '' : ' (' + t('部分统计') + ')'}`;
  const price = cost.amount === null ? t(cost.reason === 'no-price' ? '未配置单价' : '费用未知') : `${t('估算')} $${cost.amount.toFixed(4)}`;
  return tokenLabel + ' · ' + price;
}
function compactUsage(task, options) {
  const usage = task?.usage;
  if (!usage?.segments?.length) return t('无用量');
  const tokens = usage.segments.reduce((sum, s) => sum + s.input + s.output, 0);
  const count = new Intl.NumberFormat('en', {notation: 'compact', maximumFractionDigits: 2}).format(tokens);
  return `${count}${usage.complete ? '' : '*'} tok`;
}
function taskTooltip(row, options) {
  const usage = row.telemetry?.usage;
  const segments = usage?.segments || [];
  const sums = segments.reduce((sum, s) => {
    for (const key of ['input', 'cachedInput', 'cacheWrite', 'output', 'reasoningOutput']) sum[key] += s[key];
    return sum;
  }, {input: 0, cachedInput: 0, cacheWrite: 0, output: 0, reasoningOutput: 0});
  const date = new Date(row.receivedAt).toLocaleString(getLanguage());
  return [t(STATES[row.taskState][0]), row.read ? t('已读') : t('未读'),
    ...(row.event.session_title ? [`${t('聊天名称')}: ${clean(row.event.session_title, 160)}`] : []),
    `${t('项目目录')}: ${clean(row.event.cwd || row.source.cwd, 2048)}`,
    `${t('会话')}: ${clean(row.event.session_id)}`, `${t('任务')}: ${clean(row.event.turn_id) || t('未提供')}`,
    `${t('目标窗口')}: ${clean(row.targetWindowLabel) || t('尚未连接')}`,
    `${t('模型')}: ${[...new Set(segments.map(s => s.model || t('未提供')))].join(', ') || row.telemetry?.model || t('未提供')}`,
    usageDescription(row.telemetry, options),
    ...(segments.length ? [`${t('输入')}: ${number(sums.input)} · ${t('缓存命中')}: ${number(sums.cachedInput)} · ${t('缓存写入')}: ${number(sums.cacheWrite)}`,
      `${t('输出')}: ${number(sums.output)} · ${t('其中推理')}: ${number(sums.reasoningOutput)}`] : []),
    t('金额为 API 估算，不是实际账单；不包含后台任务和其他会话。'),
    t('完成表示本轮回复结束。'), date].join('\n');
}
module.exports = {STATES, DEFAULT_PRICES, taskIdentity, taskRows, projectGroups, conversationGroups, roundLabel,
  estimateCost, usageDescription, compactUsage, taskTooltip};
