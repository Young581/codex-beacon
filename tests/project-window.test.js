'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const {destination, projectTarget, openProjectWindow} = require('../ui/lib/project-window');
const {NotificationStore} = require('../ui/lib/broker-core');
const {WindowRegistry} = require('../ui/lib/routing');
const source = {id: 'local-fixture', label: 'fixture', cwd: '/fixture/project'};
const event = {version: 1, type: 'done', id: 'one', timestamp: Date.now()/1000, originator: 'codex_vscode',
  cwd: '/fixture/project', session_id: crypto.randomUUID(), turn_id: crypto.randomUUID()};
function mock(recent = []) {
  const calls = [];
  const parse = value => {
    const u = new URL(value);
    return {scheme: u.protocol.slice(0, -1), authority: u.host, path: decodeURIComponent(u.pathname), toString: () => value};
  };
  return {calls, Uri: {parse, file: value => parse('file://' + value), from: raw => parse(raw.scheme + '://' + raw.authority + raw.path)},
    commands: {async executeCommand(name, ...args) {calls.push({name, args});return name === '_workbench.getRecentlyOpened' ? {workspaces: recent} : undefined;}},
    window: {async showQuickPick() {return undefined;}}};
}
test('saved SSH and container authorities open the exact project without changing the current window', async () => {
  for (const authority of ['ssh-remote+fixture', 'dev-container+fixture']) {
    const vscode = mock();const uri = 'vscode-remote://' + authority + '/fixture/project';
    const entry = {source, event, read: false, destination: {workspaceUri: uri, label: 'fixture'}};
    assert.deepEqual(await openProjectWindow(vscode, entry, {}), {opened: true, workspaceUri: uri});
    assert.equal(vscode.calls.length, 1);
    assert.equal(vscode.calls[0].name, 'vscode.openFolder');
    assert.equal(vscode.calls[0].args[0].toString(), uri);
    assert.deepEqual(vscode.calls[0].args[1], {forceNewWindow: true});
    assert.equal(entry.read, false);
  }
});
test('older local notifications recover from their source path; remote paths never become local folders', async () => {
  const vscode = mock();const entry = {source, event};
  assert.equal((await projectTarget(vscode, entry, {localSourceId: source.id})).workspaceUri, 'file:///fixture/project');
  assert.equal(await projectTarget(vscode, entry, {localSourceId: 'other'}), null);
  assert.equal(vscode.calls.some(call => call.name === 'vscode.openFolder'), false);
});
test('matching multi-root workspaces keep their workspace file', async () => {
  const vscode = mock();const workspaceUri = 'file:///fixture/saved.code-workspace';
  assert.equal((await projectTarget(vscode, {source, event}, {sourceId: source.id, workspaceUri, roots: [event.cwd]})).workspaceUri, workspaceUri);
});
test('old remote notifications can recover a serialized VS Code recent-project URI', async () => {
  const raw = {scheme: 'vscode-remote', authority: 'ssh-remote+fixture', path: '/fixture/project'};
  const vscode = mock([{folderUri: raw}]);
  const target = await projectTarget(vscode, {source, event}, {localSourceId: 'other'});
  assert.equal(target.workspaceUri, 'vscode-remote://ssh-remote+fixture/fixture/project');
});
test('ambiguous remote connections require a choice and cancellation opens nothing', async () => {
  const vscode = mock(['one', 'two'].map(host => ({folderUri: {scheme: 'vscode-remote', authority: 'ssh-remote+' + host, path: event.cwd}})));
  assert.equal((await openProjectWindow(vscode, {source, event}, {localSourceId: 'other'})).opened, false);
  assert.equal(vscode.calls.some(call => call.name === 'vscode.openFolder'), false);
});
test('URI allowlist rejects command links, queries and malformed destinations', () => {
  for (const uri of ['command:run', 'https://fixture/project', 'file:///fixture?command=x', 'file:///fixture#fragment', 'vscode-remote:///project', 'file:///fixture\n']) {
    assert.throws(() => destination({workspaceUri: uri}));
  }
});
test('project destinations survive restart and are removed with their original notification', () => {
  const dir = path.join(__dirname, '.broker-test-data', crypto.randomUUID());
  const store = new NotificationStore(dir);store.add(source, event, {});
  const workspaceUri = 'vscode-remote://ssh-remote+fixture/fixture/project';
  assert.equal(store.rememberWindows(() => ({workspaceUri, label: 'fixture'})), true);
  assert.equal(store.rememberWindows(() => ({workspaceUri, label: 'fixture'})), false);
  const restored = new NotificationStore(dir);
  assert.equal(restored.history().entries[0].destination.workspaceUri, workspaceUri);
  restored.deleteEntry({key: source.id + ':one'});
  assert.equal(new NotificationStore(dir).history().entries.length, 0);
});
test('privacy cancellation while resolving a recent project cannot open a window', async () => {
  const vscode = mock([{folderUri: {scheme: 'vscode-remote', authority: 'ssh-remote+fixture', path: event.cwd}}]);
  assert.equal((await openProjectWindow(vscode, {source, event}, {}, {isCancelled: () => true})).opened, false);
  assert.equal(vscode.calls.some(call => call.name === 'vscode.openFolder'), false);
});

test('a saved nested project cannot be routed to an open ancestor project', () => {
  const registry = new WindowRegistry();
  const workspaceUri = 'vscode-remote://ssh-remote+fixture/fixture';
  registry.update('parent', {id: 'parent', sourceId: source.id, label: 'parent', workspaceUri,
    workspaceCwd: '/fixture', workspaceCwds: ['/fixture'], focused: true});
  const entry = {source, event, destination: {workspaceUri: workspaceUri + '/project'}};
  assert.equal(registry.select(entry), undefined);
  registry.update('project', {id: 'project', sourceId: source.id, label: 'project',
    workspaceUri: entry.destination.workspaceUri, workspaceCwd: event.cwd, workspaceCwds: [event.cwd], focused: false});
  assert.equal(registry.select(entry).id, 'project');
});
