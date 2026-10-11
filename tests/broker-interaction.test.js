'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {EventEmitter, once} = require('node:events');
const {startBroker, NativeNotifier} = require('../ui/lib/broker');
const {BrokerClient} = require('../ui/lib/client');
const {NotificationStore, BROKER_PROTOCOL_VERSION} = require('../ui/lib/broker-core');
const {matchLength} = require('../ui/lib/routing');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const source = {id: 'shared-host', label: 'GPU', host: 'gpu', home: '/codex', cwd: '/a'};
const event = (id, cwd = '/a') => ({version: 1, id, type: 'done', timestamp: Date.now() / 1000, cwd, originator: 'codex_vscode',
  session_id: '11111111-2222-4333-8444-555555555555'});
const storage = label => path.resolve(__dirname, 'runtime', label + '-' + crypto.randomUUID());
// These cases exercise delivery cancellation, so explicitly enable done alerts.
const doneDeliveryPolicy = {soundOnDone: true, desktopOnDone: true};

test('brief approval review is cancelled on continuation; persistent waits still alert', {timeout: 12000}, async () => {
  const directory = storage('approval-resolution');
  const client = new BrokerClient(directory, path.resolve(__dirname, '../ui/lib/broker.js'));
  const native = new EventEmitter(); native.close = () => {}; const delivered = [], cancelled = [];
  native.deliver = async (batch, latest) => delivered.push(latest());
  native.cancel = keys => cancelled.push(...keys);
  const broker = startBroker({storage: directory, pipe: client.pipe, nativeNotifier: native, noNative: true,
    approvalDelayMs: 150, batchOptions: {batchMs: 20, intervalMs: 10}});
  const send = value => client.request('event', {source, event: value, options: {sound: true, desktop: true}});
  const stamp = Date.now() / 1000;
  const approval = {...event('approval'), type: 'approval', turn_id: 'round', timestamp: stamp};
  const progress = {...event('progress'), type: 'task', turn_id: 'round', timestamp: stamp + 1,
    task: {state: 'running', sequence: 10, model: '', usage: {complete: false, segments: []}}};
  try {
    await once(broker.server, 'listening'); await client.connect();
    await send(approval);
    assert.equal(delivered.length, 0, 'Approval popup is buffered while review runs');
    await send({...progress, task: {...progress.task, continuedAt: stamp + 0.5}});
    await pause(250);
    assert.equal(delivered.length, 0); assert.equal((await client.request('history')).unread, 0);
    assert.ok(cancelled.includes(source.id + ':approval'));
    const persistent = {...approval, id: 'persistent', turn_id: 'persistent-round'};
    await send(persistent);
    await send({...progress, id: 'parallel-counters', turn_id: 'persistent-round'});
    await pause(250);
    assert.equal(delivered.length, 1, 'Token snapshots cannot suppress an unresolved wait');
    const continued = {...progress, id: 'parallel-counters', turn_id: 'persistent-round', task: {...progress.task, sequence: 20, continuedAt: stamp + 0.5}};
    await send(continued);
    assert.ok(cancelled.includes(source.id + ':persistent'), 'Already delivered native reminders are cancelled too');
    assert.equal((await client.request('history')).unread, 0);
    await send({...persistent, id: 'late', timestamp: stamp - 1});
    await pause(250); assert.equal(delivered.length, 1, 'Out-of-order hooks cannot re-alert');
  } finally {client.dispose(); broker.close();}
});

test('saved running tasks require fresh observer evidence after a window reconnects', {timeout: 20000}, async () => {
  const directory = storage('live-evidence');
  const client = new BrokerClient(directory, path.resolve(__dirname, '../ui/lib/broker.js'));
  const saved = {...event('saved-running'), type: 'task', turn_id: 'saved-turn', replayed: true,
    task: {state: 'running', sequence: 10, model: '', usage: {complete: false, segments: []}}};
  const store = new NotificationStore(directory, {fileName: `broker-state-v${BROKER_PROTOCOL_VERSION}.json`});
  store.add(source, saved, {});
  const broker = startBroker({storage: directory, pipe: client.pipe, noNative: true});
  await once(broker.server, 'listening');
  let next;
  const register = value => value.request('window', {window: {id: value.clientId, label: 'fixture',
    sourceId: source.id, workspaceCwd: '/a', workspaceCwds: ['/a'], workspaceUri: '', focused: false, policy: {}}});
  const state = async value => require('../ui/lib/tasks').taskRows((await value.request('history')).entries)[0].taskState;
  try {
    await client.connect(); await register(client);
    assert.equal(await state(client), 'unknown');
    await client.request('event', {source, event: saved, options: {}});
    assert.equal(await state(client), 'unknown', 'Replayed starts must not revive saved activity');
    const fresh = {...saved, replayed: false, task: {...saved.task, sequence: 20}};
    await client.request('event', {source, event: fresh, options: {}});
    assert.equal(await state(client), 'running');
    next = new BrokerClient(directory, path.resolve(__dirname, '../ui/lib/broker.js'));
    await next.connect(); await register(next);
    assert.equal(await state(next), 'running', 'Another connected observer preserves live evidence');
    client.dispose();
    for (let attempt = 0; attempt < 50 && await state(next) !== 'unknown'; attempt++) await pause(20);
    assert.equal(await state(next), 'unknown', 'Closing the reporting window invalidates its evidence');
    await next.request('event', {source, event: {...fresh, replayed: true, task: {...fresh.task, sequence: 30}}, options: {}});
    assert.equal(await state(next), 'unknown');
    await next.request('event', {source, event: {...fresh, replayed: false, task: {...fresh.task, sequence: 40}}, options: {}});
    assert.equal(await state(next), 'running');
  } finally {client.dispose(); next?.dispose(); broker.close();}
});

test('new-round acknowledgement cancels queued old reminders without muting the current round', {timeout: 12000}, async () => {
  const directory = storage('round-delivery');
  const client = new BrokerClient(directory, path.resolve(__dirname, '../ui/lib/broker.js'));
  const delivered = [];
  const native = new EventEmitter(); native.close = () => {}; native.cancel = () => {};
  native.deliver = async (batch, latest) => {const current = latest(); if (current) delivered.push(current);};
  const broker = startBroker({storage: directory, pipe: client.pipe, nativeNotifier: native, noNative: true,
    batchOptions: {batchMs: 200, intervalMs: 10}});
  await once(broker.server, 'listening');
  try {
    await client.connect();
    await client.request('window', {window: {id: client.clientId, sourceId: source.id, workspaceCwd: '/a',
      workspaceCwds: ['/a'], focused: false, policy: doneDeliveryPolicy}});
    const base = Date.now() / 1000;
    const old = {...event('old-round'), timestamp: base - 1, turn_id: 'old-turn',
      task: {state: 'completed', sequence: 10, startedAt: base - 2, model: ''}};
    const oldReceipt = await client.request('event', {source, event: old, options: {sound: true, desktop: true}});
    const next = {...event('new-round'), timestamp: base, type: 'task', turn_id: 'new-turn',
      task: {state: 'running', sequence: 20, startedAt: base, model: ''}};
    await client.request('event', {source, event: next, options: {}});
    const current = await client.request('event', {source, event: {...next, id: 'new-question', type: 'question',
      task: {...next.task, state: 'waiting_input', sequence: 30}}, options: {sound: true, desktop: true}});
    await pause(350);
    assert.ok(!delivered.some(batch => batch.keys.includes(oldReceipt.key)));
    assert.ok(delivered.some(batch => batch.keys.includes(current.key)), 'Current reminders must remain audible');
  } finally {client.dispose(); broker.close();}
});

test('custom sounds follow live destination policy and an explicit muted-window preview uses its selected file', {timeout: 12000}, async () => {
  const directory = storage('custom-sound-policy');
  const client = new BrokerClient(directory, path.resolve(__dirname, '../ui/lib/broker.js'));
  const deliveries = [];
  const native = new EventEmitter(); native.close = () => {};
  native.deliver = async (batch, latest) => {deliveries.push(latest());};
  const broker = startBroker({storage: directory, pipe: client.pipe, nativeNotifier: native, noNative: true,
    batchOptions: {batchMs: 30, intervalMs: 10}});
  const first = path.join(directory, 'first.wav'), next = path.join(directory, 'next.mp3');
  const window = {id: client.clientId, sourceId: source.id, workspaceCwd: '/a', focused: false,
    policy: {sound: true, soundFile: first}};
  try {
    await once(broker.server, 'listening'); await client.connect();
    assert.ok(client.capabilities.includes('custom-sound-v1'));
    await client.request('window', {window});
    await client.request('event', {source, event: event('custom-live'), options: {desktop: false, sound: true}});
    window.policy.soundFile = next;
    await client.request('window', {window});
    await pause(180);
    assert.equal(deliveries.length, 1); assert.equal(deliveries[0].soundFile, next);
    window.policy.sound = false;
    await client.request('window', {window});
    await client.request('event', {source, event: event('custom-muted'), options: {desktop: false, sound: true}});
    await pause(80); assert.equal(deliveries.length, 1);
    await client.request('interact');
    await client.request('test', {source, options: {desktop: false, sound: true, soundFile: first}});
    await pause(150);
    assert.equal(deliveries.length, 2); assert.equal(deliveries[1].soundFile, first);
    assert.equal(deliveries[1].desktop, false);
    assert.deepEqual(deliveries[1].keys, []);
    assert.equal(JSON.stringify(await client.request('history')).includes(first), false, 'Audio paths do not enter task history');
  } finally {client.dispose(); broker.close();}
});

test('background completion alerts the foreground client and routes its click back to the owner', {timeout: 12000}, async () => {
  const directory = storage('foreground-alert');
  const a = new BrokerClient(directory, path.resolve(__dirname, '../ui/lib/broker.js'));
  const b = new BrokerClient(directory, path.resolve(__dirname, '../ui/lib/broker.js'));
  const native = new EventEmitter();
  let nativeCalls = 0;
  native.close = () => {};
  native.deliver = async () => {nativeCalls++;}; // Shell acceptance does not prove visibility.
  const broker = startBroker({storage: directory, pipe: a.pipe, nativeNotifier: native, noNative: true,
    batchOptions: {batchMs: 20, intervalMs: 10}});
  const alertsA = [], alertsB = [], opens = [];
  a.on('desktopAlert', value => alertsA.push(value));
  b.on('desktopAlert', value => alertsB.push(value));
  a.on('openEntry', value => opens.push(value));
  try {
    await once(broker.server, 'listening');
    await Promise.all([a.connect(), b.connect()]);
    for (const [client, cwd, focused] of [[a, '/a', false], [b, '/b', true]]) {
      await client.request('window', {window: {id: client.clientId, sourceId: source.id,
        workspaceCwd: cwd, workspaceCwds: [cwd], focused, policy: doneDeliveryPolicy}});
    }
    const receipt = await a.request('event', {source, event: event('foreground-alert'), options: {desktop: true, sound: true}});
    await pause(150);
    assert.equal(alertsA.length, 0);
    assert.equal(alertsB.length, 1, 'Foreground VS Code must offer a clickable alert even if the system balloon is hidden');
    assert.deepEqual(alertsB[0].keys, [receipt.key]);
    assert.equal(nativeCalls, 1);
    assert.equal((await b.request('openEntry', {key: receipt.key})).routed, true);
    await pause(30);
    assert.equal(opens[0].key, receipt.key);
    assert.equal((await b.request('history')).entries[0].read, false);
    await a.request('event', {source, event: event('muted-after-click'), options: {desktop: true, sound: true}});
    await pause(80);
    assert.equal(alertsB.length, 1, 'Clicking must suppress pending alerts for the target');
  } finally {a.dispose(); b.dispose(); broker.close();}
});

test('acknowledgement and interaction silence only the matching window; explicit tests still work', {timeout: 12000}, async () => {
  const directory = storage('interaction');
  const a = new BrokerClient(directory, path.resolve(__dirname, '../ui/lib/broker.js'));
  const b = new BrokerClient(directory, path.resolve(__dirname, '../ui/lib/broker.js'));
  let now = Date.now();
  const delivered = [];
  const native = new EventEmitter();
  native.close = () => {};
  native.deliver = async (batch, latest) => {const value = latest(); if (value) delivered.push(value);};
  const broker = startBroker({storage: directory, pipe: a.pipe, nativeNotifier: native, noNative: true, now: () => now,
    batchOptions: {batchMs: 30, intervalMs: 10}});
  await once(broker.server, 'listening');
  const registration = (client, cwd, focused, policy) => client.request('window', {window: {
    id: client.clientId, label: cwd, sourceId: source.id, workspaceCwd: cwd, workspaceCwds: [cwd],
    workspaceUri: '', routeUri: '', focused, policy: {...doneDeliveryPolicy, ...policy}}});
  try {
    await Promise.all([a.connect(), b.connect()]);
    await registration(a, '/a', false);
    await registration(b, '/b', true);
    const first = await a.request('event', {source, event: event('first'), options: {sound: true, desktop: true}});
    await a.request('markRead', {key: first.key});
    await pause(80);
    assert.equal(delivered.length, 0, 'Acknowledged queued alerts must not play');
    await a.request('event', {source, event: event('during-interaction'), options: {sound: true, desktop: true}});
    const other = await b.request('event', {source, event: event('other-window', '/b'), options: {sound: true, desktop: true}});
    await pause(80);
    assert.deepEqual(delivered.flatMap(batch => batch.keys), [other.key]);
    const explicit = await a.request('test', {source, options: {sound: true, desktop: true}});
    await pause(80);
    assert.ok(delivered.some(batch => batch.keys.includes(explicit.key)), 'An explicit sound test bypasses interaction silence');

    now += 16000;
    await registration(a, '/a', false, {onlyWhenUnfocused: true});
    await registration(b, '/b', true, {onlyWhenUnfocused: true});
    // Foreground B observes A's log first with B's stale/silent options.
    const background = await b.request('event', {source, event: event('background-owner'), options: {sound: false, desktop: false}});
    // Background A observes foreground B first with A's audible options.
    const foreground = await a.request('event', {source, event: event('foreground-owner', '/b'), options: {sound: true, desktop: true}});
    await pause(80);
    assert.ok(delivered.some(batch => batch.keys.includes(background.key)));
    assert.ok(!delivered.some(batch => batch.keys.includes(foreground.key)), 'Policy must come from the target window');

    const opened = [];
    a.on('openEntry', message => opened.push(['a', message.key]));
    b.on('openEntry', message => opened.push(['b', message.key]));
    native.emit('click', {keys: [other.key]});
    await pause(30);
    assert.deepEqual(opened, [['b', other.key]]);
    assert.equal((await a.request('history')).entries.find(item => item.key === other.key).read, false,
      'A native click only routes; it cannot acknowledge an external URI on behalf of the target UI');
    await b.request('markRead', {key: other.key});
    assert.equal((await a.request('history')).entries.find(item => item.key === other.key).read, true);

    const originalMarkRead = broker.store.markRead;
    let prematureWrites = 0;
    broker.store.markRead = () => {prematureWrites++; throw new Error('simulated locked state file');};
    assert.doesNotThrow(() => native.emit('click', {keys: [background.key]}));
    assert.equal(prematureWrites, 0, 'Clicking must not write read state before the target accepts navigation');
    broker.store.markRead = originalMarkRead;
    assert.equal((await a.request('ping')).version, BROKER_PROTOCOL_VERSION);
  } finally {a.dispose(); b.dispose(); broker.close();}
});

test('a read notification cancels native retry before another sound can be emitted', {skip: process.platform !== 'win32'}, async () => {
  const native = new NativeNotifier();
  let live = true, attempts = 0;
  native.once = async () => {attempts++; live = false; throw new Error('temporary failure');};
  const batch = {title: 'test', body: 'test', sound: true, desktop: true};
  try {await native.deliver(batch, () => live ? batch : null); assert.equal(attempts, 1);}
  finally {native.close();}
});

test('routing cancels queued and in-flight alerts permanently while failed navigation stays unread', {timeout: 12000}, async () => {
  const directory = storage('navigation-cancellation');
  const a = new BrokerClient(directory, path.resolve(__dirname, '../ui/lib/broker.js'));
  const b = new BrokerClient(directory, path.resolve(__dirname, '../ui/lib/broker.js'));
  let now = Date.now(), release, signalStarted;
  const started = new Promise(resolve => {signalStarted = resolve;});
  const blocked = new Promise(resolve => {release = resolve;});
  let attempts = 0;
  const delivered = [];
  const native = new EventEmitter();
  native.close = () => {};
  native.deliver = async (batch, latest) => {
    if (++attempts === 1) {signalStarted(); await blocked;}
    const current = latest();
    if (current) delivered.push(current);
  };
  const broker = startBroker({storage: directory, pipe: a.pipe, nativeNotifier: native, noNative: true,
    now: () => now, batchOptions: {batchMs: 20, intervalMs: 10}});
  await once(broker.server, 'listening');
  const opened = [];
  b.on('openEntry', message => opened.push(message.key));
  const register = (client, cwd) => client.request('window', {window: {id: client.clientId, label: cwd,
    sourceId: source.id, workspaceCwd: cwd, workspaceCwds: [cwd], focused: false, policy: doneDeliveryPolicy}});
  const notify = (id, cwd, rawSource = source) => a.request('event', {
    source: rawSource, event: event(id, cwd), options: {desktop: true, sound: true}});
  try {
    await Promise.all([a.connect(), b.connect()]);
    await register(a, '/a');
    await register(b, '/b');
    const pending = await notify('in-flight-b', '/b');
    await started;
    const queued = await notify('queued-b', '/b');
    const unaffected = await notify('queued-a', '/a');
    const receipt = await a.request('openEntry', {key: pending.key});
    assert.equal(receipt.clientId, b.clientId);
    await b.request('ping');
    assert.deepEqual(opened, [pending.key]);
    assert.equal((await a.request('history')).entries.find(item => item.key === pending.key).read, false);
    const duringMute = await notify('during-target-interaction', '/b');
    now += 16000;
    release();
    await pause(80);
    assert.deepEqual(delivered.flatMap(batch => batch.keys), [unaffected.key],
      'Neither in-flight retries, already queued events, nor events received while handling B may revive after 15 seconds');
    const afterMute = await notify('new-after-interaction', '/b');
    await pause(80);
    assert.ok(delivered.some(batch => batch.keys.includes(afterMute.key)), 'New later events may notify again');
    const beforeAck = (await a.request('history')).entries;
    for (const key of [pending.key, queued.key, duringMute.key]) assert.equal(beforeAck.find(item => item.key === key).read, false);
    await b.request('markRead', {key: pending.key});
    assert.equal((await a.request('history')).entries.find(item => item.key === pending.key).read, true);

    const unavailable = await notify('no-window', '/missing', {...source, id: 'disconnected-host'});
    await a.request('interact', {key: unavailable.key});
    assert.deepEqual(await a.request('openEntry', {key: unavailable.key}), {routed: false, reason: 'window-unavailable'});
    now += 16000;
    await pause(80);
    assert.ok(!delivered.some(batch => batch.keys.includes(unavailable.key)));
    assert.equal((await a.request('history')).entries.find(item => item.key === unavailable.key).read, false);

    const unavailableNative = await notify('native-no-window', '/missing', {...source, id: 'disconnected-host'});
    native.emit('click', {keys: [unavailableNative.key]});
    now += 16000;
    await pause(80);
    assert.ok(!delivered.some(batch => batch.keys.includes(unavailableNative.key)));
    assert.equal((await a.request('history')).entries.find(item => item.key === unavailableNative.key).read, false);
  } finally {release(); a.dispose(); b.dispose(); broker.close();}
});

test('event sounds follow the destination window, live edits, inheritance and merged priority', {timeout: 12000}, async () => {
  const directory = storage('event-sound-policy');
  const a = new BrokerClient(directory, path.resolve(__dirname, '../ui/lib/broker.js'));
  const b = new BrokerClient(directory, path.resolve(__dirname, '../ui/lib/broker.js'));
  const deliveries = [];
  const native = new EventEmitter(); native.close = () => {};
  native.deliver = async (batch, latest) => {deliveries.push(latest());};
  const broker = startBroker({storage: directory, pipe: a.pipe, nativeNotifier: native, noNative: true,
    batchOptions: {batchMs: 250, intervalMs: 10}});
  const common = path.join(directory, 'common.wav');
  const done = path.join(directory, 'done.wav'), question = path.join(directory, 'question.mp3'), approval = path.join(directory, 'approval.wav');
  const owner = {id: b.clientId, sourceId: source.id, workspaceCwd: '/b', focused: false,
    policy: {sound: true, soundVolume: 35, desktopNotifications: false, soundFile: common, soundFileOnDone: done, soundFileOnQuestion: question, soundFileOnApproval: approval}};
  const send = async (id, type) => a.request('event', {source, event: {...event(id, '/b'), type}, options: {sound: true, desktop: false, soundFile: common}});
  try {
    await once(broker.server, 'listening'); await a.connect(); await b.connect();
    assert.ok(a.capabilities.includes('event-sounds-v1'));
    await a.request('window', {window: {id: a.clientId, sourceId: source.id, workspaceCwd: '/a', focused: false, policy: {soundFile: common, soundVolume: 91}}});
    await b.request('window', {window: owner});
    for (const [type, file] of [['done', done], ['question', question], ['approval', approval]]) {
      await send('event-' + type, type); await pause(400);
      assert.equal(deliveries.at(-1).soundFile, file, 'The observing window must not replace the destination sound');
      assert.equal(deliveries.at(-1).soundVolume, 35, 'Volume belongs to the destination window');
    }
    await send('queued-question', 'question');
    const changed = path.join(directory, 'new-question.wav'); owner.policy.soundFileOnQuestion = changed;
    owner.policy.soundVolume = 62;
    await b.request('window', {window: owner}); await pause(400);
    assert.equal(deliveries.at(-1).soundFile, changed);
    assert.equal(deliveries.at(-1).soundVolume, 62, 'Queued notifications use live volume');
    owner.policy.soundFileOnDone = ''; await b.request('window', {window: owner});
    await send('inherited-done', 'done'); await pause(400); assert.equal(deliveries.at(-1).soundFile, common);
    const before = deliveries.length;
    await Promise.all([send('merged-done', 'done'), send('merged-question', 'question'), send('merged-approval', 'approval')]);
    await pause(400); assert.equal(deliveries.length, before + 1); assert.equal(deliveries.at(-1).soundFile, approval);
    owner.policy.sound = false; await b.request('window', {window: owner});
    await send('muted-approval', 'approval'); await pause(400); assert.equal(deliveries.length, before + 1);
  } finally {a.dispose(); b.dispose(); broker.close();}
});

test('v12 migration prefers v11, falls back through older states, and never rewrites a live older broker state', async () => {
  for (const legacyFileName of ['broker-state-v11.json', 'broker-state-v10.json', 'broker-state-v9.json', 'broker-state-v8.json', 'broker-state-v7.json', 'broker-state-v6.json', 'broker-state-v5.json', 'broker-state-v4.json', 'broker-state-v3.json', 'broker-state-v2.json', 'broker-state.json']) {
    const directory = storage('migration');
    const legacy = new NotificationStore(directory, {fileName: legacyFileName});
    legacy.add(source, event('legacy'), {desktop: false, sound: false});
    if (legacyFileName !== 'broker-state.json') {
      const older = new NotificationStore(directory);
      older.add(source, event('older-v1'), {desktop: false, sound: false});
    }
    if (['broker-state-v4.json', 'broker-state-v3.json'].includes(legacyFileName)) {
      const older = new NotificationStore(directory, {fileName: 'broker-state-v2.json'});
      older.add(source, event('older-v2'), {desktop: false, sound: false});
    }
    const oldBytes = fs.readFileSync(legacy.file);
    const client = new BrokerClient(directory, path.resolve(__dirname, '../ui/lib/broker.js'));
    const broker = startBroker({storage: directory, pipe: client.pipe, noNative: true});
    await once(broker.server, 'listening');
    try {
      assert.equal(path.basename(broker.store.file), `broker-state-v${BROKER_PROTOCOL_VERSION}.json`);
      assert.equal(broker.store.needsMigration, false);
      assert.deepEqual(broker.store.entries.map(record => record.event.id), ['legacy']);
      broker.store.markRead({});
      assert.deepEqual(fs.readFileSync(legacy.file), oldBytes);
      legacy.add(source, event('late-legacy'), {desktop: false, sound: false});
      const reopened = new NotificationStore(directory, {fileName: `broker-state-v${BROKER_PROTOCOL_VERSION}.json`, legacyFileName});
      assert.equal(reopened.entries.length, 1);
      assert.equal(reopened.history().unread, 0);
    } finally {client.dispose(); broker.close();}
  }
});

test('attention requests use the authenticated window id, return asynchronous failures, and release bindings', async () => {
  const directory = storage('attention-protocol');
  const client = new BrokerClient(directory, path.resolve(__dirname, '../ui/lib/broker.js'));
  const operations = [];
  let closed = false;
  const attention = {request: async (op, data) => {
    operations.push({op, data});
    if (data.count === -1) throw new Error('invalid count');
    return {ok: op};
  }, close: () => {closed = true;}};
  const native = new EventEmitter();
  native.close = () => {};
  native.deliver = async () => {};
  const broker = startBroker({storage: directory, pipe: client.pipe, nativeNotifier: native, attentionNotifier: attention});
  await once(broker.server, 'listening');
  try {
    await client.connect();
    assert.deepEqual(await client.request('attentionBind', {id: 'another-window', marker: '[test-window]', pid: 123, executable: 'Code.exe'}), {ok: 'bind'});
    assert.deepEqual(operations[0], {op: 'bind', data: {id: client.clientId, marker: '[test-window]', pid: 123, executable: 'Code.exe'}});
    assert.deepEqual(await client.request('attentionUpdate', {count: 2, needsDecision: true, flash: false}), {ok: 'update'});
    assert.equal(operations[1].data.id, client.clientId);
    await assert.rejects(client.request('attentionUpdate', {count: -1}), /invalid count/);
    client.dispose();
    await pause(30);
    assert.ok(operations.some(item => item.op === 'release' && item.data.id === client.clientId));
  } finally {client.dispose(); broker.close();}
  assert.equal(closed, true);
});

test('no-native mode acknowledges window attention without starting its helper', async () => {
  const directory = storage('attention-disabled');
  const client = new BrokerClient(directory, path.resolve(__dirname, '../ui/lib/broker.js'));
  const broker = startBroker({storage: directory, pipe: client.pipe, noNative: true});
  await once(broker.server, 'listening');
  try {
    await client.connect();
    assert.deepEqual(await client.request('attentionBind', {marker: '[test-window]', pid: 123, executable: 'Code.exe'}), {disabled: true});
    assert.deepEqual(await client.request('attentionUpdate', {count: 2, needsDecision: true, flash: true}), {disabled: true});
  } finally {client.dispose(); broker.close();}
});

test('window directory matching handles drive roots, UNC case, multiple folders, and prefix boundaries', () => {
  assert.ok(matchLength('C:\\Repo\\Project', ['c:\\']) > 0);
  assert.ok(matchLength('\\\\SERVER\\Share\\repo', ['\\\\server\\share']) > 0);
  assert.ok(matchLength('/second/project/src', ['/first', '/second/project']) > 0);
  assert.equal(matchLength('/project-other', ['/project']), -1);
});
