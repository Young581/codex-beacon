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
  const chat = view.getChildren(view.groups[0])[0];
  const live = view.getChildren(chat)[0];
  const runningItem = view.getTreeItem(live);
  assert.equal(runningItem.iconPath.color.id, 'charts.blue');
  assert.equal(runningItem.label, '第 1 轮');
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

test('compact usage remains available for detail summaries', () => {
  const usage = {complete: false, segments: [{...segment(), input: 4475490}]};
  assert.equal(compactUsage({usage}, {}), '4.48M* tok');
  assert.match(usageDescription({usage}, {}), /4,475,590 tokens.*部分统计/);
  assert.equal(compactUsage(undefined, {}), '无用量');
  assert.equal(compactUsage({usage: {complete: true, segments: [segment('unknown')]}}, {}), '1.1K tok');
});

test('sidebar groups named conversations and numbers rounds before state sorting', () => {
  const first = row('first', 10, 'completed'); first.event.turn_id = 'first-turn'; first.event.session_title = 'Checkout';
  const second = row('second', 20, 'waiting_input', {read: false}); second.event.turn_id = 'second-turn'; second.event.type = 'question';
  const other = row('other', 30); other.event.session_id = 'different-chat';
  const foreign = {...first, key: 'foreign', source: {...source, id: 'other-source'}};
  const view = new HistoryView(mock, 'this-window'); view.update([second, other, first, foreign]);
  const project = view.groups.find(group => group.source.id === source.id);
  const chat = view.getChildren(project).find(group => group.title === 'Checkout');
  assert.equal(view.getChildren(project).length, 2);
  assert.equal(view.getTreeItem(chat).description, '2 轮');
  assert.equal(view.getParent(chat), project);
  assert.equal(view.getParent(chat.entries[0]), chat);
  assert.deepEqual(chat.entries.map(row => row.turnNumber), [2, 1], 'Blocked rounds may display first without renumbering');
  assert.equal(view.getTreeItem(chat.entries[0]).label.label, '● 第 2 轮');
  assert.equal(view.getTreeItem(view.getChildren(project).find(group => group !== chat)).label, '未命名对话');
  assert.equal(view.groups.find(group => group.source.id === 'other-source').entries[0].turnNumber, 1);
  const updated = {...second, event: {...second.event, timestamp: second.event.timestamp + 100,
    task: {...second.event.task, sequence: 40, state: 'completed'}}};
  view.update([updated, first, other]);
  assert.equal(view.groups[0].entries.find(row => row.key === updated.key).turnNumber, 2);
  view.update([first]);
  assert.equal(view.groups[0].conversations.length, 1);
  assert.equal(view.getParent(updated), undefined);
  assert.equal(view.getTreeItem(view.groups[0].entries[0]).label, '第 1 轮');
});
test('active unconnected tasks are explicitly unconfirmed; hook approval overrides older telemetry', () => {
  const running = row('live', 10);
  assert.equal(taskRows([{...running, targetWindowId: undefined}])[0].taskState, 'unknown');
  const approval = {...row('approve', 20), read: false, event: {...event('approve', 'approval'), timestamp: running.event.timestamp + 1}};
  delete approval.event.task;
  assert.equal(taskRows([running, approval])[0].taskState, 'waiting_approval');
});

test('async delivery remains nonblocking without telemetry; counters do not resolve approvals', () => {
  const async = row('async', 10, 'running'); async.event.type = 'question';
  async.event.question_mode = 'async'; delete async.event.task;
  assert.equal(taskRows([async])[0].taskState, 'waiting_async');
  const running = row('live', 10);
  const approval = {...row('approve', 20), read: false, event: {...event('approve', 'approval'), timestamp: running.event.timestamp + 1}};
  delete approval.event.task;
  const counters = row('counters', 30); counters.event.timestamp = approval.event.timestamp + 1;
  assert.equal(taskRows([running, approval, counters])[0].taskState, 'waiting_approval');
  const delayed = {...counters, event: {...counters.event, task: {...counters.event.task, continuedAt: approval.event.timestamp - 1}}};
  assert.equal(taskRows([running, approval, delayed])[0].taskState, 'waiting_approval');
  counters.event.task.continuedAt = approval.event.timestamp + 0.5;
  assert.equal(taskRows([running, approval, counters])[0].taskState, 'running');
});

test('collector bridge and broker preserve and validate continuation and question metadata', () => {
  const question = {...event('async-mode', 'question'), question_mode: 'async'};
  question.task.continuedAt = question.timestamp - 1;
  const bridged = normalizeEvent(question);
  assert.equal(bridged.question_mode, 'async');
  assert.equal(validateEvent(bridged).task.continuedAt, question.task.continuedAt);
  for (const mode of [false, 'unknown', {}, null]) {
    assert.equal(normalizeEvent({...question, question_mode: mode}), null);
    assert.throws(() => validateEvent({...question, question_mode: mode}), /question mode/);
  }
  for (const continuedAt of [-1, Infinity, NaN, '200', true, 4102444801]) {
    const invalid = {...question, task: {...question.task, continuedAt}};
    assert.equal(normalizeEvent(invalid), null);
    assert.throws(() => validateEvent(invalid), /continuation time/);
  }
});

test('continuation automatically reads only resolved approvals in its exact round', () => {
  const store = new NotificationStore(path.join(__dirname, '.broker-test-data', crypto.randomUUID()));
  const base = Date.now() / 1000;
  const approval = {...event('approval', 'approval'), timestamp: base}; delete approval.task;
  store.add(source, approval, {});
  store.add(source, {...approval, id: 'other-turn', turn_id: 'other'}, {});
  store.add({...source, id: 'foreign'}, {...approval, id: 'foreign'}, {});
  store.add(source, {...approval, id: 'other-project', cwd: '/other'}, {});
  const question = {...approval, id: 'question', type: 'question', question_mode: 'async'};
  store.add(source, question, {});
  const progress = {...event('progress', 'task', 30), timestamp: base + 2};
  store.add(source, progress, {});
  assert.equal(store.history().unread, 5, 'Counters alone preserve all reminders');
  progress.task.continuedAt = base + 1; progress.task.sequence = 40;
  store.add(source, progress, {});
  assert.equal(store.history().unread, 4);
  assert.equal(store.history().entries.find(r => r.event.id === 'approval').read, true);
  assert.equal(store.history().entries.find(r => r.event.id === 'question').read, false);
  store.add(source, {...approval, id: 'late-approval'}, {});
  assert.equal(store.history().entries.find(r => r.event.id === 'late-approval').read, true, 'Late delivery cannot revive a resolved approval');
});

test('tool resolution clears its matching approval but preserves parallel and repeated approvals', () => {
  const store = new NotificationStore(path.join(__dirname, '.broker-test-data', crypto.randomUUID()));
  const stamp = Date.now() / 1000;
  const approval = {...event('one', 'approval'), timestamp: stamp, action_key: 'a'.repeat(64)}; delete approval.task;
  const second = {...approval, id: 'two', action_key: 'b'.repeat(64)};
  store.add(source, event('running'), {}); store.add(source, approval, {}); store.add(source, second, {});
  const resolution = {...approval, type: 'approval_resolved', id: 'resolved', timestamp: stamp + 1};
  store.add(source, resolution, {sound: true, desktop: true});
  assert.equal(store.history().unread, 1);
  const records = store.history().entries.map(record => ({...record, targetWindowId: 'fixture'}));
  assert.equal(taskRows(records)[0].taskState, 'waiting_approval', 'The other parallel approval remains pending');
  store.add(source, {...resolution, id: 'second-resolved', action_key: second.action_key}, {});
  assert.equal(taskRows(store.history().entries.map(record => ({...record, targetWindowId: 'fixture'})))[0].taskState, 'running');
  store.add(source, {...approval, id: 'repeated', timestamp: stamp + 2}, {});
  assert.equal(store.history().unread, 1, 'An old resolution cannot clear a newer identical command');
  store.add(source, {...approval, id: 'same-command-parallel', timestamp: stamp + 2.1}, {});
  store.add(source, {...resolution, id: 'one-of-two-resolved', timestamp: stamp + 3}, {});
  assert.equal(store.history().unread, 1, 'One result resolves only one of two identical pending operations');
  const onlyResolution = {...records.at(-1), event: resolution};
  assert.deepEqual(taskRows([onlyResolution]), [], 'Internal lifecycle records never create task cards');
  assert.equal(normalizeEvent({...resolution, action_key: 'bad'}), null);
  assert.throws(() => validateEvent({...resolution, action_key: 'bad'}));
  assert.equal(require('../ui/lib/presentation').validEnvelope({version: 1, kind: 'event', source, event: resolution}), true);
  assert.deepEqual(notificationOptions({get: () => true}, false, 'approval_resolved'), {sound: false, desktop: false});
});

test('reconnected project windows do not confirm saved activity; terminal results stay final', () => {
  for (const state of ['running', 'waiting_input', 'waiting_async', 'waiting_approval']) {
    assert.equal(taskRows([{...row(state, 10, state), taskConfirmed: false}])[0].taskState, 'unknown');
    assert.equal(taskRows([{...row(state, 10, state), taskConfirmed: true}])[0].taskState, state);
  }
  for (const state of ['completed', 'failed', 'cancelled']) {
    assert.equal(taskRows([{...row(state, 10, state), taskConfirmed: false}])[0].taskState, state);
  }
  const previous = row('previous', 10); previous.event.task.startedAt = 1;
  const next = row('next', 20); next.event.turn_id = 'next-turn'; next.event.task.startedAt = 2;
  assert.equal(taskRows([previous, next]).find(item => item.key === previous.key).taskState, 'unknown');
  const other = {...next, event: {...next.event, session_id: 'other-session'}};
  assert.equal(taskRows([previous, other]).find(item => item.key === previous.key).taskState, 'running');
});

test('starting a new round reads only earlier reminders in the same project, source and conversation', () => {
  const store = new NotificationStore(path.join(__dirname, '.broker-test-data', crypto.randomUUID()));
  const base = Date.now() / 1000;
  const first = {...event('first', 'done', 10, 'completed'), timestamp: base - 5};
  first.task.startedAt = base - 10;
  store.add(source, first, {});
  const otherChat = {...first, id: 'other-chat', session_id: 'other-chat'};
  store.add(source, otherChat, {});
  store.add({...source, id: 'other-source'}, {...first, id: 'other-source'}, {});
  store.add(source, {...first, id: 'other-project', cwd: '/another/project'}, {});
  const next = {...event('next', 'task', 30), timestamp: base, turn_id: 'new-turn'};
  next.task.startedAt = base;
  store.add(source, next, {});
  const history = store.history();
  assert.equal(history.entries.find(item => item.event.id === 'first').read, true);
  assert.equal(history.unread, 3);
  store.add(source, {...event('current-question', 'question', 40, 'waiting_input'), timestamp: base + 1, turn_id: 'new-turn',
    task: {...next.task, sequence: 40, state: 'waiting_input'}}, {});
  assert.equal(store.history().unread, 4, 'The new round keeps its own reminders unread');
  let lateAlerts = 0; store.on('event', () => lateAlerts++);
  store.add(source, {...first, id: 'late-first-done', timestamp: base + 2}, {sound: true, desktop: true});
  assert.equal(lateAlerts, 0, 'Delayed old-round notifications must not sound or become unread again');
  assert.equal(new NotificationStore(store.storage).history().unread, 4);
  store.add(source, {...first, id: 'first-telemetry', type: 'task'}, {});
  assert.equal(store.history().unread, 4, 'Out-of-order older rounds cannot read the current question');
});

test('usage-only updates without a round start do not auto-read and failed saves preserve unread reminders', () => {
  const store = new NotificationStore(path.join(__dirname, '.broker-test-data', crypto.randomUUID()));
  store.add(source, event('old', 'done', 10, 'completed'), {});
  store.add(source, {...event('usage-only'), turn_id: 'next'}, {});
  assert.equal(store.history().unread, 1);
  const next = {...event('explicit-start', 'task', 40), turn_id: 'next', task: {...task(40), startedAt: Date.now() / 1000 + 1}};
  const before = store.history(); const save = store.save;
  store.save = () => {throw new Error('locked state file');};
  assert.throws(() => store.add(source, next, {}), /locked/);
  assert.deepEqual(store.history(), before);
  store.save = save;
});

test('round start sequence orders starts with equal timestamps, regardless of arrival order', () => {
  const store = new NotificationStore(path.join(__dirname, '.broker-test-data', crypto.randomUUID()));
  const stamp = Date.now() / 1000;
  const previous = {...event('equal-first', 'done', 20, 'completed'), timestamp: stamp,
    task: {...task(20, 'completed'), startedAt: stamp, startSequence: 10}};
  const next = {...event('equal-next', 'question', 40, 'waiting_input'), timestamp: stamp, turn_id: 'next-turn',
    task: {...task(40, 'waiting_input'), startedAt: stamp, startSequence: 30}};
  store.add(source, next, {});
  store.add(source, previous, {});
  assert.equal(store.history().unread, 1);
  assert.equal(store.history().entries.find(record => record.event.id === previous.id).read, true);
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

test('clear-read removes the whole read round when only the completion alert has terminal telemetry', () => {
  for (const state of ['completed', 'failed', 'cancelled']) {
    const directory = path.join(__dirname, '.broker-test-data', crypto.randomUUID());
    const store = new NotificationStore(directory);
    const live = event('live');
    const done = event('done', 'done', 20, state);
    store.add(source, live, {});
    store.add(source, done, {});
    store.markRead({});
    assert.equal(taskRows(store.history().entries)[0].taskState, state);
    assert.deepEqual(store.clearRead(), {deleted: 2, unread: 0});
    assert.deepEqual(taskRows(store.history().entries), []);
    const restarted = new NotificationStore(directory);
    assert.equal(restarted.add(source, live, {}).duplicate, true);
    assert.equal(restarted.add(source, done, {}).duplicate, true);
    assert.equal(restarted.add(source, event('live', 'task', 30, state), {}).duplicate, true);
    assert.deepEqual(restarted.history().entries, []);
  }
});

test('clear-read preserves read questions and resolved approvals that still determine an active round', () => {
  for (const mode of ['blocking', 'async']) {
    const store = new NotificationStore(path.join(__dirname, '.broker-test-data', crypto.randomUUID()));
    store.add(source, event('live'), {});
    const question = {...event('question', 'question', 20, mode === 'async' ? 'waiting_async' : 'waiting_input'), question_mode: mode};
    store.add(source, question, {});
    store.markRead({});
    const before = taskRows(store.history().entries.map(record => ({...record, targetWindowId: 'this-window', taskConfirmed: true})));
    assert.equal(store.clearRead().deleted, 0);
    const after = taskRows(store.history().entries.map(record => ({...record, targetWindowId: 'this-window', taskConfirmed: true})));
    assert.equal(after[0].taskState, before[0].taskState);
    assert.deepEqual(after[0].relatedKeys, before[0].relatedKeys);
  }
  const store = new NotificationStore(path.join(__dirname, '.broker-test-data', crypto.randomUUID()));
  const timestamp = Date.now() / 1000;
  const approval = {...event('approval', 'approval'), timestamp: timestamp - 1, action_key: 'a'.repeat(64)};
  delete approval.task;
  const resolution = {...approval, id: 'resolution', type: 'approval_resolved', timestamp};
  store.add(source, approval, {});
  store.add(source, resolution, {});
  assert.equal(store.history().unread, 0);
  assert.equal(store.clearRead().deleted, 0);
  const remaining = store.history().entries.map(record => ({...record, targetWindowId: 'this-window', taskConfirmed: true}));
  assert.equal(taskRows(remaining)[0].taskState, 'running');
  assert.equal(remaining.length, 2);
});

test('clear-read preserves an unread round in full and isolates projects, sources and rounds', () => {
  const store = new NotificationStore(path.join(__dirname, '.broker-test-data', crypto.randomUUID()));
  store.add(source, event('read-live'), {});
  store.add(source, event('read-done', 'done', 20, 'completed'), {});
  store.markRead({});
  const variants = [
    {source, change: {cwd: '/other/project'}},
    {source: {...source, id: 'other-source'}, change: {}},
    {source, change: {turn_id: 'other-turn'}},
    {source, change: {session_id: 'other-session'}},
  ];
  for (const [index, variant] of variants.entries()) {
    store.add(variant.source, {...event('pending-live-' + index), ...variant.change}, {});
    store.add(variant.source, {...event('pending-done-' + index, 'done', 20, 'completed'), ...variant.change}, {});
  }
  assert.deepEqual(store.clearRead(), {deleted: 2, unread: variants.length});
  assert.equal(store.history().entries.length, variants.length * 2);
  assert.equal(taskRows(store.history().entries).every(row => row.taskState === 'completed' && !row.read), true);
});

test('clear-read rolls back an entire round when saving fails', () => {
  const store = new NotificationStore(path.join(__dirname, '.broker-test-data', crypto.randomUUID()));
  store.add(source, event('live'), {});
  store.add(source, event('done', 'done', 20, 'completed'), {});
  store.markRead({});
  const before = store.history().entries;
  let removed = false;
  store.on('removed', () => {removed = true;});
  store.save = () => {throw new Error('fixture save failure');};
  assert.throws(() => store.clearRead(), /fixture save failure/);
  assert.deepEqual(store.history().entries, before);
  assert.equal(removed, false);
  assert.equal(taskRows(store.history().entries)[0].taskState, 'completed');
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
