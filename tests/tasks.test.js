'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {projectGroups, estimateCost, taskRows, usageDescription, compactUsage} = require('../ui/lib/tasks');
const {HistoryView} = require('../ui/lib/history');
const {NotificationStore, validateEvent} = require('../ui/lib/broker-core');
const {normalizeEvent, EventBridge} = require('../remote/src/core');
const {notificationOptions} = require('../ui/lib/presentation');
const segment = (model = 'gpt-6.1-sol', tier = 'standard') => ({model, tier, input: 1000, cachedInput: 400, cacheWrite: 100, output: 100, reasoningOutput: 40});
const task = (sequence, state = 'running') => ({sequence, state, model: 'gpt-6.1-sol', usage: {complete: true, segments: [segment()]}});
const source = {id: 'fixture-source', label: 'fixture-host', host: 'fixture-host', cwd: '/fixture/project'};
const event = (id, type = 'task', sequence = 10, state = 'running') => ({version: 1, id, type, timestamp: Date.now() / 1000,
  cwd: '/fixture/project', session_id: 'session-1234', turn_id: 'turn-5678', originator: 'codex_vscode', task: task(sequence, state)});
const row = (id, sequence, state = 'running', extra = {}) => ({key: source.id + ':' + id, source,
  read: true, receivedAt: sequence, targetWindowId: 'this-window', event: event(id, 'task', sequence, state), ...extra});
const mock = {
  EventEmitter: class {fire() {} dispose() {}},
  TreeItem: class {constructor(label, state) {this.label = label; this.collapsibleState = state;}},
  ThemeIcon: class {constructor(id, color) {this.id = id; this.color = color;}},
  ThemeColor: class {constructor(id) {this.id = id;}},
  TreeItemCollapsibleState: {None: 0, Collapsed: 1, Expanded: 2},
};
test('projects group by full path and source rather than basename, Windows spelling is normalized', () => {
  const winProject = 'Z' + ':/fixture/Project';
  const winOther = 'z' + ':\\fixture\\project\\';
  const entries = [row('a', 1), row('b', 2, 'running', {event: {...event('b'), cwd: '/another/project'}}),
    row('c', 3, 'running', {source: {...source, id: 'other-host'}}),
    row('d', 4, 'running', {event: {...event('d'), cwd: winProject, turn_id: 'one'}}),
    row('e', 5, 'running', {event: {...event('e'), cwd: winOther, turn_id: 'two'}})];
  const groups = projectGroups(entries, 'this-window');
  assert.equal(groups.length, 4);
  assert.equal(groups.find(g => g.cwd === winProject).entries.length, 2);
  assert.equal(new Set(groups.map(g => g.id)).size, 4);
});
test('a turn is one row, read state stays independent of progress and state colors', () => {
  const running = row('live', 10);
  const done = row('done', 20, 'completed', {read: false, event: event('done', 'done', 20, 'completed')});
  const view = new HistoryView(mock, 'this-window');
  view.update([running]);
  const live = view.getChildren(view.groups[0])[0];
  const runningItem = view.getTreeItem(live);
  assert.equal(runningItem.iconPath.color.id, 'charts.blue');
  assert.equal(runningItem.label, '1.1K tok');
  assert.match(runningItem.tooltip, /1,100 tokens.*\$0\.0023/);
  view.update([running, done]);
  assert.equal(view.groups[0].entries.length, 1);
  const completed = view.groups[0].entries[0];
  const item = view.getTreeItem(completed);
  assert.equal(item.id, runningItem.id);
  assert.equal(item.description, '完成');
  assert.equal(item.label.label.includes('session-1234'), false);
  assert.match(item.tooltip, /本轮完成/);
  assert.equal(item.contextValue, 'unreadNotification');
  assert.equal(item.iconPath.color.id, 'charts.green');
  assert.match(item.tooltip, /其中推理.*40/);
  assert.deepEqual(view.keysFor('done'), ['done']); // Unqualified keys are not accepted as row keys.
  assert.deepEqual(view.keysFor(done.key), [running.key, done.key]);
  view.update([running, {...done, read: true}]);
  assert.equal(view.groups[0].entries[0].taskState, 'completed');
  assert.equal(view.getTreeItem(view.groups[0].entries[0]).iconPath.color.id, 'charts.green');
});

test('compact rows show only tokens while exact usage and cost remain available in details', () => {
  const usage = {complete: false, segments: [{...segment(), input: 4475490}]};
  assert.equal(compactUsage({usage}, {}), '4.48M* tok');
  assert.match(usageDescription({usage}, {}), /4,475,590 tokens.*部分统计/);
  assert.equal(compactUsage(undefined, {}), '无用量');
  assert.equal(compactUsage({usage: {complete: true, segments: [segment('unknown')]}}, {}), '1.1K tok');
});
test('active unconnected tasks are explicitly unconfirmed; hook approval overrides older telemetry', () => {
  const running = row('live', 10);
  assert.equal(taskRows([{...running, targetWindowId: undefined}])[0].taskState, 'unknown');
  const approval = {...row('approve', 20), read: false, event: {...event('approve', 'approval'), timestamp: running.event.timestamp + 1}};
  delete approval.event.task;
  assert.equal(taskRows([running, approval])[0].taskState, 'waiting_approval');
});
test('cost splits cached and cache-write inputs, never bills reasoning output twice', () => {
  assert.equal(estimateCost({complete: true, segments: [segment()]}).amount, 0.00229);
  assert.equal(estimateCost({complete: true, segments: [{...segment(), reasoningOutput: 0}]}).amount, 0.00229);
  assert.equal(estimateCost({complete: false, segments: [segment(), segment('gpt-6-luna')]}).partial, true);
  assert.equal(estimateCost({complete: true, segments: [segment('unknown')]}).amount, null);
  assert.match(usageDescription({usage: {complete: true, segments: [segment('unknown')]}}, {}), /未配置单价/);
});
test('custom rates override defaults and tier, zero prices work, bad prices never become zero', () => {
  const usage = {complete: true, segments: [segment('custom', 'fast')]};
  assert.equal(estimateCost(usage, {modelPrices: {custom: {input: 1, cachedInput: 0, cacheWrite: 2, output: 3}}}).amount, 0.001);
  assert.equal(estimateCost(usage, {modelPrices: {custom: {input: 0, cachedInput: 0, cacheWrite: 0, output: 0}}}).amount, 0);
  assert.equal(estimateCost(usage, {modelPrices: {custom: {input: -1, cachedInput: 0, output: 0}}}).amount, null);
  assert.equal(estimateCost({complete: true, segments: [segment('gpt-6.1-sol', 'priority')]}).amount, 0.00458);
  assert.equal(estimateCost({complete: true, segments: [segment()]}, {pricingContext: 'long'}).amount, 0.00408);
});
test('task snapshots update durably without alerting; stale snapshots and deleted-task replay are ignored', () => {
  const storage = path.join(__dirname, '.broker-test-data', crypto.randomUUID());
  const store = new NotificationStore(storage);
  let alerts = 0; store.on('event', () => alerts++);
  store.add(source, event('live'), {sound: true, desktop: true});
  store.add(source, event('live', 'task', 20, 'waiting_input'), {});
  assert.equal(store.history().entries.length, 1);
  assert.equal(store.history().entries[0].event.task.state, 'waiting_input');
  assert.equal(store.history().unread, 0);
  assert.equal(alerts, 0);
  const restarted = new NotificationStore(storage);
  restarted.add(source, event('live', 'task', 15), {});
  assert.equal(restarted.history().entries[0].event.task.state, 'waiting_input');
  assert.equal(restarted.clearRead().deleted, 0);
  restarted.deleteEntry({key: source.id + ':live'});
  restarted.add(source, event('live', 'task', 30, 'completed'), {});
  assert.equal(new NotificationStore(storage).history().entries.length, 0);
});
test('clear-read preserves telemetry for active tasks and tasks with pending alerts', () => {
  const store = new NotificationStore(path.join(__dirname, '.broker-test-data', crypto.randomUUID()));
  store.add(source, event('live'), {});
  store.add(source, event('done', 'done', 20, 'completed'), {});
  store.add(source, event('live', 'task', 20, 'completed'), {});
  assert.equal(store.clearRead().deleted, 0);
  store.markRead({});
  assert.equal(store.clearRead().deleted, 2);
});
test('metadata validators drop private fields and reject invalid subsets, counters and task identities', () => {
  const input = event('fixture'); input.task.prompt = 'PRIVATE'; input.task.usage.segments[0].command = 'PRIVATE';
  assert.equal(JSON.stringify(validateEvent(input)).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(normalizeEvent(input)).includes('PRIVATE'), false);
  input.task.usage.segments[0].cachedInput = 2000;
  assert.throws(() => validateEvent(input)); assert.equal(normalizeEvent(input), null);
  assert.throws(() => validateEvent({...event('fixture'), turn_id: ''}));
  assert.throws(() => validateEvent({...event('fixture'), task: {...task(1), sequence: Infinity}}));
  const item = event('fixture'); item.task.usage.segments[0].input = -1;
  assert.equal(normalizeEvent(item), null);
  assert.deepEqual(notificationOptions({get: () => true}, false, 'task'), {sound: false, desktop: false});
});
test('event bridge delivers newer task snapshots even while the previous snapshot is in flight', async () => {
  const seen = []; let release;
  const bridge = new EventBridge(async (_, value) => {
    seen.push(value.event.task.sequence);
    if (seen.length === 1) await new Promise(resolve => {release = resolve;});
    return {accepted: true};
  }, () => {});
  bridge.event(source, event('live', 'task', 10));
  bridge.event(source, event('live', 'task', 20));
  release();
  while (bridge.busy) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(seen, [10, 20]);
  bridge.dispose();
});
