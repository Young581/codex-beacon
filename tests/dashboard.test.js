'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {Dashboard, dashboardData, usageTotals, html} = require('../ui/lib/dashboard');
const {configureLanguage, MESSAGES} = require('../ui/lib/i18n');
const source = {id: 'source', label: 'Local', host: 'localhost', cwd: '/workspace/a', home: '/private-home'};
const entry = (id, state = 'running', overrides = {}) => ({key: 'source:' + id, read: true, receivedAt: 100000 + Number(id || 0),
  source, targetWindowId: 'window', event: {type: 'task', id, cwd: source.cwd, timestamp: 100 + Number(id || 0),
    session_id: 'session', turn_id: 'turn-' + id, task: {state, sequence: 1, model: 'gpt-6.1-sol', usage: {complete: true,
      segments: [{model: 'gpt-6.1-sol', tier: 'standard', input: 1000, cachedInput: 100, cacheWrite: 0, output: 200, reasoningOutput: 50}]}}}, ...overrides});
test.afterEach(() => configureLanguage(() => 'zh-CN'));

test('dashboard counts each latest turn once, excludes tests and preserves partial/unknown usage', () => {
  const first = entry('1');
  const older = {...first, key: 'old', receivedAt: first.receivedAt - 1,
    event: {...first.event, task: {...first.event.task, sequence: 0}}};
  const question = {...entry('2', 'waiting_input'), read: false};
  question.event.task.usage.complete = false;
  const questionAlert = {...question, key: 'question-alert', event: {...question.event, type: 'question', id: 'question-alert'}};
  const unknown = entry('3', 'completed'); unknown.event.task.usage.segments[0].model = 'unknown-model';
  const noUsage = entry('4', 'failed'); delete noUsage.event.task.usage;
  const synthetic = {...entry('5'), event: {...entry('5').event, type: 'test'}};
  const result = dashboardData({entries: [older, first, question, questionAlert, unknown, noUsage, synthetic]}, {windowId: 'window'});
  assert.equal(result.totals.tasks, 4); assert.equal(result.totals.running, 1);
  assert.equal(result.totals.blocked, 1); assert.equal(result.totals.completed, 1);
  assert.equal(result.totals.unread, 1); assert.equal(result.totals.tokens, 3600);
  assert.equal(result.totals.metered, 3); assert.equal(result.totals.unpriced, 2);
  assert.ok(result.totals.partial);
  assert.equal(result.projects[0].tasks.find(row => row.key === noUsage.key).cost, null);
  assert.equal(result.projects[0].tasks.find(row => row.key === noUsage.key).tokens, null);
  assert.equal(result.projects[0].tasks.find(row => row.key === unknown.key).cost, null);
  assert.ok(result.totals.amount > 0, 'Known estimated costs are shown with their unknown coverage count');
  assert.equal(usageTotals([], {}).amount, null);
});

test('asynchronous questions count as needing attention while work can continue', () => {
  const question = entry('1', 'waiting_async', {read: false});
  const result = dashboardData({entries: [question]}, {windowId: 'window'});
  assert.equal(result.totals.blocked, 1);
  assert.equal(result.totals.running, 1);
  assert.equal(result.projects[0].tasks[0].state, 'waiting_async');
});

test('custom prices use the sidebar calculator and separate projects with the same name', () => {
  const a = entry('1'), b = entry('2'); b.event.cwd = '/other/a';
  const result = dashboardData({entries: [a, b]}, {windowId: 'window', options: {
    modelPrices: {'gpt-6.1-sol': {input: 1, cachedInput: 0, output: 2}}, pricingTier: 'priority'}});
  assert.equal(result.projects.length, 2); assert.notEqual(result.projects[0].id, result.projects[1].id);
  assert.equal(result.projects[0].title, result.projects[1].title);
  assert.ok(Math.abs(result.totals.amount - .0026) < 1e-9);
});

test('webview projection omits raw sources, prompts and histories while retaining safe task details', () => {
  const malicious = '<img src=x onerror=alert(1)>';
  const row = entry('1', 'completed', {source: {...source, label: malicious, home: 'PRIVATE_HOME', token: 'PRIVATE_CREDENTIAL'},
    prompt: 'PRIVATE_PROMPT'});
  row.event.session_title = malicious;
  const model = dashboardData({entries: [row]}, {windowId: 'window'});
  const json = JSON.stringify(model);
  assert.ok(!json.includes('PRIVATE_')); assert.equal(model.records, undefined);
  assert.ok(model.projects.every(project => project.records === undefined));
  assert.equal(model.projects[0].source, malicious, 'Metadata remains text, not markup');
  assert.equal(model.projects[0].tasks[0].session, 'session');
  assert.equal(model.projects[0].tasks[0].title, malicious, 'Chat names remain text, not markup');
  assert.equal(model.projects[0].tasks[0].turn, 'turn-1');
});

test('dashboard projects expose named conversations and numeric retained rounds without UUID titles', () => {
  const first = entry('1', 'completed'); first.event.session_title = 'Checkout'; first.event.task.sequence = 10;
  const second = entry('2', 'waiting_input'); second.event.task.sequence = 20;
  const other = entry('3'); other.event.session_id = '649aac2c-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const result = dashboardData({entries: [second, other, first]}, {windowId: 'window'});
  const group = result.projects[0];
  assert.equal(group.conversations.length, 2);
  const task = group.tasks.find(row => row.key === second.key);
  assert.equal(task.title, 'Checkout'); assert.equal(task.turnNumber, 2); assert.equal(task.roundLabel, '第 2 轮');
  assert.equal(group.conversations.find(chat => chat.id === task.conversationId).rounds, '2 轮');
  assert.equal(group.tasks.find(row => row.key === other.key).title, '未命名对话');
  configureLanguage(() => 'en');
  const english = dashboardData({entries: [first, second]}, {windowId: 'window'});
  assert.equal(english.projects[0].tasks.find(row => row.key === second.key).roundLabel, 'Round 2');
  assert.equal(english.projects[0].conversations[0].rounds, '2 rounds');
});

test('dashboard labels follow one language and privacy-paused receiving stays explicit', () => {
  configureLanguage(() => 'en');
  const model = dashboardData({entries: [], privacyPaused: true}, {connected: true});
  assert.equal(model.language, 'en'); assert.equal(model.paused, true); assert.equal(model.privacyPaused, true);
  for (const [key, value] of Object.entries(model.text)) assert.equal(/[\u3400-\u9fff]/u.test(value), false, key);
  assert.equal(model.text.title, 'Project overview');
  assert.ok(MESSAGES['Codex Beacon · 仪表盘']);
});

function fixture(action = async () => {}) {
  const panels = [];
  let snapshot = {entries: [entry('1')]};
  const vscode = {ViewColumn: {One: 1}, Uri: {file: path => ({path})}, window: {
    createWebviewPanel(type, title, column, options) {
      const panel = {type, title, column, options, messages: [], reveals: 0,
        reveal() {this.reveals++;}, onDidDispose(fn) {this.onDispose = fn;},
        dispose() {this.onDispose?.();}, webview: {
          cspSource: 'vscode-webview://fixture', asWebviewUri: uri => ({toString: () => 'vscode-webview://fixture/' + uri.path}),
          onDidReceiveMessage(fn) {panel.receive = fn; return {dispose() {panel.receiverDisposed = true;}};},
          async postMessage(value) {panel.messages.push(value); return true;},
        }};
      panels.push(panel); return panel;
    },
  }};
  const dashboard = new Dashboard(vscode, {extensionPath: '/extension'}, {
    data: () => dashboardData(snapshot, {windowId: 'window'}), action});
  return {dashboard, panels, setSnapshot: value => {snapshot = value;}};
}

test('dashboard opens a singleton editor panel and waits for readiness before posting data', async () => {
  const {dashboard, panels} = fixture();
  dashboard.open(); dashboard.open();
  assert.equal(panels.length, 1); assert.equal(panels[0].reveals, 1);
  assert.equal(panels[0].column, 1); assert.ok(panels[0].options.retainContextWhenHidden);
  assert.equal(panels[0].messages.length, 0);
  await panels[0].receive({type: 'ready'});
  assert.equal(panels[0].messages.at(-1).data.totals.tasks, 1);
  assert.ok(panels[0].webview.html.includes("default-src 'none'"));
  assert.ok(!panels[0].webview.html.includes('source:1'));
  dashboard.dispose(); assert.ok(panels[0].receiverDisposed);
});

test('the former menu opens the management page in the existing dashboard', async () => {
  const {dashboard, panels} = fixture();
  dashboard.open('management');
  const panel = panels[0]; assert.equal(panel.messages.length, 0);
  await panel.receive({type: 'ready'});
  assert.deepEqual(panel.messages.at(-1), {type: 'view', page: 'management'});
  dashboard.open(); assert.equal(panels.length, 1);
  dashboard.open('management');
  assert.deepEqual(panel.messages.at(-1), {type: 'view', page: 'management'});
  dashboard.dispose();
});

test('message bridge rejects arbitrary commands, forged keys, replay and stale records after cleanup', async () => {
  const calls = [];
  const {dashboard, panels, setSnapshot} = fixture(async (...args) => calls.push(args));
  dashboard.open(); const panel = panels[0]; await panel.receive({type: 'ready'});
  for (const message of [{type: 'action', id: 1, action: 'workbench.action.openSettings'},
    {type: 'action', id: 2, action: 'read', key: 'forged'},
    {type: 'action', id: 3, action: 'settings', key: 'source:1'},
    {type: 'action', id: '4', action: 'settings'}]) await panel.receive(message);
  assert.deepEqual(calls, []);
  const valid = {type: 'action', id: 5, action: 'read', key: 'source:1'};
  await panel.receive(valid); await panel.receive(valid);
  assert.deepEqual(calls, [['read', 'source:1']]);
  setSnapshot({entries: [], privacyPaused: true}); dashboard.update();
  await panel.receive({...valid, id: 6}); assert.equal(calls.length, 1);
  dashboard.dispose(); await panel.receive({type: 'action', id: 7, action: 'settings'});
  assert.equal(calls.length, 1);
});

test('concurrent clicks are acknowledged without repeating actions; closing a panel drops late results', async () => {
  let release, calls = 0;
  const {dashboard, panels} = fixture(() => {calls++; return new Promise(resolve => {release = resolve;});});
  dashboard.open(); const panel = panels[0]; await panel.receive({type: 'ready'});
  const pending = panel.receive({type: 'action', id: 1, action: 'refresh'});
  await panel.receive({type: 'action', id: 2, action: 'refresh'});
  assert.equal(calls, 1); assert.ok(panel.messages.at(-1).busy);
  panel.dispose(); const sent = panel.messages.length; release(); await pending;
  assert.equal(panel.messages.length, sent);
  dashboard.dispose();
});

test('management settings accept only explicit values and return action failures to the webview', async () => {
  const calls = [];
  const {dashboard, panels} = fixture(async (...args) => {
    calls.push(args);
    return args[0] === 'configureHook' ? {error: 'Python unavailable'} : {};
  });
  dashboard.open(); const panel = panels[0]; await panel.receive({type: 'ready'});
  for (const [id, action, value] of [[1, 'setLanguage', 'arbitrary'], [2, 'setOpenLocation', 'shell'],
    [3, 'setAutoHook', 'true'], [4, 'settings', {command: 'evil'}]]) {
    await panel.receive({type: 'action', id, action, value});
  }
  assert.deepEqual(calls, []);
  await panel.receive({type: 'action', id: 5, action: 'setLanguage', value: 'en'});
  await panel.receive({type: 'action', id: 6, action: 'setAutoHook', value: false});
  await panel.receive({type: 'action', id: 7, action: 'configureHook'});
  assert.deepEqual(calls.slice(0, 2), [['setLanguage', undefined, 'en'], ['setAutoHook', undefined, false]]);
  assert.equal(panel.messages.at(-1).error, 'Python unavailable');
  dashboard.dispose();
});

test('sound scenario actions accept only supported event enums and expose filenames without local directories', async () => {
  const calls = [];
  const {dashboard, panels} = fixture(async (...args) => calls.push(args));
  dashboard.open(); const panel = panels[0]; await panel.receive({type: 'ready'});
  for (const [id, value] of [[1, 'arbitrary.wav'], [2, ['done']], [3, '__proto__'], [4, 'default']]) {
    await panel.receive({type: 'action', id, action: 'chooseEventSound', value});
  }
  assert.deepEqual(calls, []);
  for (const [id, action, value] of [[5, 'chooseEventSound', 'done'], [6, 'previewEventSound', 'question'], [7, 'resetEventSound', 'approval']]) {
    await panel.receive({type: 'action', id, action, value});
  }
  assert.deepEqual(calls, [['chooseEventSound', undefined, 'done'], ['previewEventSound', undefined, 'question'], ['resetEventSound', undefined, 'approval']]);
  const model = dashboardData({entries: []}, {preferences: {soundFileOnDone: '/private-folder/complete.wav'}});
  assert.equal(model.management.eventSounds.done, 'complete.wav');
  assert.equal(JSON.stringify(model).includes('private-folder'), false);
  dashboard.dispose();
});
