'use strict';
const {t, translator} = require('./i18n');

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const privacy = require('./privacy-storage');
const {normalizeTask} = require('../collector/src/task-data');
const {destination} = require('./project-window');
const {validateSoundFile, validateSoundVolume} = require('./sound');
const {normalizePath} = require('./routing');
const {clean} = require('./presentation');

const TYPES = new Set(['done', 'approval', 'approval_resolved', 'question', 'test', 'task']);
const TITLES = { done: 'Codex 本轮已回复', approval: 'Codex 等待审批', question: 'Codex 等待回答', test: 'Codex 通知测试' };
const MAX_HISTORY = 200;
const MAX_SEEN = 5000;
const BROKER_PROTOCOL_VERSION = 13;

// Display and deletion derive state from the complete round; an alert can
// carry newer telemetry than the stable task event.
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
  if (event.type === 'question' && event.question_mode === 'async') return 'waiting_async';
  return {done: 'completed', question: 'waiting_input', approval: 'waiting_approval'}[event.type] || 'unknown';
}
function taskRows(entries, {requireConnected = true} = {}) {
  const tasks = new Map();
  for (const entry of [...entries].sort((a, b) => a.event.timestamp - b.event.timestamp || a.receivedAt - b.receivedAt)) {
    const id = taskIdentity(entry);
    let row = tasks.get(id);
    if (!row) { row = {id, records: []}; tasks.set(id, row); }
    row.records.push(entry);
  }
  return [...tasks.values()].filter(row => row.records.some(entry => entry.event.type !== 'approval_resolved')).map(row => {
    const ordered = row.records;
    const alerts = ordered.filter(entry => !['task', 'approval_resolved'].includes(entry.event.type));
    const unread = alerts.filter(entry => !entry.read);
    const representative = unread.at(-1) || alerts.at(-1) || ordered.at(-1);
    const telemetry = ordered.filter(entry => entry.event.task).sort((a, b) =>
      a.event.task.sequence - b.event.task.sequence || a.receivedAt - b.receivedAt).at(-1);
    const latest = ordered.filter(entry => entry.event.type !== 'approval_resolved').at(-1);
    const resolved = resolvedApprovalKeys(ordered);
    let state = telemetry?.event.task.state || inferredState(latest.event);
    // Hook approval can arrive after the most recent rollout snapshot.
    const pendingApproval = [...ordered].reverse().find(entry => entry.event.type === 'approval' &&
      entry.event.timestamp > (telemetry?.event.task.continuedAt || 0) && !resolved.has(entry.key));
    if (pendingApproval && !['completed', 'cancelled', 'failed'].includes(state)) state = 'waiting_approval';
    else if (latest.event.type === 'approval' && resolved.has(latest.key)) state = telemetry?.event.task.state || 'running';
    else if (latest.event.type !== 'task' && latest.event.timestamp > (telemetry?.event.timestamp || 0)) state = inferredState(latest.event);
    const target = latest.targetWindowId || representative.targetWindowId;
    if (requireConnected && (!target || latest.taskConfirmed === false) && ['running', 'waiting_input', 'waiting_async', 'waiting_approval'].includes(state)) state = 'unknown';
    return {...representative, taskId: row.id, records: ordered, relatedKeys: ordered.map(entry => entry.key),
      read: unread.length === 0, taskState: state, telemetry: telemetry?.event.task,
      receivedAt: Math.max(...ordered.map(entry => entry.receivedAt)), targetWindowId: target};
  }).map((row, index, rows) => {
    // A later explicit round start supersedes an unfinished historical round.
    const active = ['running', 'waiting_input', 'waiting_async', 'waiting_approval'].includes(row.taskState);
    const start = row.telemetry?.startedAt ?? Math.min(...row.records.map(record => record.event.timestamp));
    if (active && rows.some(other => other !== row && other.source.id === row.source.id &&
      other.event.session_id === row.event.session_id && pathIdentity(other.event.cwd || other.source.cwd) === pathIdentity(row.event.cwd || row.source.cwd) &&
      (other.telemetry?.startedAt > start || other.telemetry?.startedAt === start &&
        other.telemetry?.startSequence > row.telemetry?.startSequence))) return {...row, taskState: 'unknown'};
    return row;
  });
}

function conversationKey(record) {
  return JSON.stringify([record.source.id, normalizePath(record.event.cwd || record.source.cwd || ''), record.event.session_id]);
}
function turnKey(record) { return JSON.stringify([conversationKey(record), record.event.turn_id]); }
function resolvedApprovalKeys(entries) {
  const pending = new Map(), resolved = new Set();
  for (const record of [...entries].sort((a, b) => a.event.timestamp - b.event.timestamp)) {
    if (!record.event.action_key || !['approval', 'approval_resolved'].includes(record.event.type)) continue;
    const key = JSON.stringify([turnKey(record), record.event.action_key]);
    if (!pending.has(key)) pending.set(key, []);
    const queue = pending.get(key);
    if (record.event.type === 'approval') queue.push(record);
    else if (queue.length && queue[0].event.timestamp < record.event.timestamp) resolved.add(queue.shift().key);
  }
  return resolved;
}
function readEarlierRounds(entries) {
  const starts = new Map();
  const turnStarts = new Map();
  const continuations = new Map();
  const resolved = resolvedApprovalKeys(entries);
  for (const record of entries) {
    if (record.event.session_id && record.event.turn_id && record.event.task) {
      const task = record.event.task;
      const time = ['completed', 'cancelled', 'failed'].includes(task.state) ? record.event.timestamp : task.continuedAt;
      if (time !== undefined) continuations.set(turnKey(record), Math.max(continuations.get(turnKey(record)) || 0, time));
    }
    const startedAt = record.event.task?.startedAt;
    if (!record.event.session_id || !record.event.turn_id || startedAt === undefined) continue;
    const key = conversationKey(record);
    const previous = starts.get(key);
    const sequence = record.event.task.startSequence;
    if (!previous || startedAt > previous.time || startedAt === previous.time && sequence > previous.sequence)
      starts.set(key, {time: startedAt, sequence, turn: record.event.turn_id});
    turnStarts.set(turnKey(record), {time: startedAt, sequence});
  }
  const readKeys = [];
  const records = entries.map(record => {
    // Resolution belongs to this exact source/project/conversation/round.
    // Counters and unrelated parallel tool outputs cannot acknowledge approval.
    if (!record.read && record.event.type === 'approval' &&
        ((continuations.get(turnKey(record)) || 0) > record.event.timestamp ||
         resolved.has(record.key))) {
      readKeys.push(record.key);
      return {...record, read: true};
    }
    const latest = starts.get(conversationKey(record));
    if (record.read || record.event.type === 'test' || !latest || record.event.turn_id === latest.turn) return record;
    const start = turnStarts.get(turnKey(record));
    const time = start?.time ?? record.event.timestamp;
    if (time > latest.time || time === latest.time && !(start?.sequence < latest.sequence)) return record;
    readKeys.push(record.key);
    return {...record, read: true};
  });
  return {records, readKeys};
}

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
}

function field(value, name, limit, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u001f\u007f]/u.test(value) || (required && !value.trim())) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

function validateSource(source) {
  object(source, 'source');
  return {
    id: field(source.id, 'source.id', 256, true),
    label: field(source.label, 'source.label', 200),
    host: field(source.host, 'source.host', 200),
    home: field(source.home, 'source.home', 2048),
    cwd: field(source.cwd, 'source.cwd', 2048),
  };
}

function validateEvent(event) {
  object(event, 'event');
  if (event.version !== 1) throw new Error('Unsupported event.version');
  if (!TYPES.has(event.type)) throw new Error('Invalid event.type');
  if (typeof event.timestamp !== 'number' || !Number.isFinite(event.timestamp) || event.timestamp < 0 || event.timestamp > 4102444800) {
    throw new Error('Invalid event.timestamp');
  }
  const result = {
    version: 1,
    id: field(event.id, 'event.id', 256, true),
    type: event.type,
    timestamp: event.timestamp,
    host: field(event.host, 'event.host', 200),
    label: field(event.label, 'event.label', 200),
    cwd: field(event.cwd, 'event.cwd', 2048),
    session_id: field(event.session_id, 'event.session_id', 256),
    turn_id: field(event.turn_id, 'event.turn_id', 256),
    originator: field(event.originator, 'event.originator', 64),
  };
  if (event.task !== undefined) result.task = normalizeTask(event.task);
  if (event.question_mode !== undefined) {
    if (event.type !== 'question' || !['async', 'blocking'].includes(event.question_mode)) throw new Error('Invalid question mode');
    result.question_mode = event.question_mode;
  }
  if (event.action_key !== undefined) {
    if (!['approval', 'approval_resolved'].includes(event.type) || typeof event.action_key !== 'string' || !/^[a-f0-9]{64}$/.test(event.action_key)) throw new Error('Invalid approval action key');
    result.action_key = event.action_key;
  }
  if (event.type === 'approval_resolved' && (!result.action_key || !result.session_id || !result.turn_id)) throw new Error('Invalid approval resolution');
  if (event.replayed !== undefined) {
    if (typeof event.replayed !== 'boolean') throw new Error('Invalid event replay flag');
    result.replayed = event.replayed;
  }
  if (event.session_title !== undefined) result.session_title = field(event.session_title, 'event.session_title', 160);
  if (event.type === 'task' && (!result.task || !result.session_id || !result.turn_id)) throw new Error('Invalid task identity');
  return result;
}

function validateOptions(options = {}) {
  object(options, 'options');
  for (const key of ['sound', 'desktop']) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new Error(`Invalid options.${key}`);
  }
  return { sound: options.sound !== false, desktop: options.desktop !== false,
    ...(options.soundVolume !== undefined ? {soundVolume: validateSoundVolume(options.soundVolume)} : {}),
    ...(options.soundFile !== undefined ? {soundFile: validateSoundFile(options.soundFile)} : {}) };
}

function atomicallyWrite(file, data) {
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(data), { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

class NotificationStore extends EventEmitter {
  constructor(storage, {fileName = 'broker-state.json', legacyFileName, now = Date.now, initialize = true} = {}) {
    super();
    if (!path.isAbsolute(storage)) throw new Error('storage must be an absolute path');
    fs.mkdirSync(storage, { recursive: true });
    this.storage = privacy.checkDirectory(storage);
    this.now = now;
    this.control = privacy.readControl(storage);
    if (path.basename(fileName) !== fileName || (legacyFileName && path.basename(legacyFileName) !== legacyFileName)) throw new Error('Invalid state filename');
    this.file = path.join(storage, fileName);
    this.entries = [];
    this.seen = new Set();
    this.seenAt = new Map();
    this.needsMigration = false;
    if (initialize) this.reload({legacyFileName});
  }

  // A broker initializes only after it owns the listener. Re-read both the
  // privacy controls and disk snapshot then, since another broker may have
  // changed them while this process was waiting to reserve the pipe.
  reload({legacyFileName} = {}) {
    if (legacyFileName && path.basename(legacyFileName) !== legacyFileName) throw new Error('Invalid state filename');
    this.control = privacy.readControl(this.storage);
    this.entries = []; this.seen = new Set(); this.seenAt = new Map();
    const legacy = legacyFileName && path.join(this.storage, legacyFileName);
    const migrate = !this.control.cutoff && !this.control.paused && !fs.existsSync(this.file) && legacy && fs.existsSync(legacy);
    if (!this.control.paused) this.load(migrate ? legacy : this.file);
    this.needsMigration = Boolean(migrate);
    this.prune();
  }

  load(inputFile = this.file) {
    try {
      if (privacy.checkedFile(this.storage, path.basename(inputFile)).info.size > 4 * 1024 * 1024) throw new Error('Broker state is too large');
      const state = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
      if (state.version !== 1 || !Array.isArray(state.entries) || !Array.isArray(state.seen)) throw new Error('Invalid broker state');
      const entries = state.entries.slice(-MAX_HISTORY).map(record => {
        object(record, 'record');
        const source = validateSource(record.source);
        const event = validateEvent(record.event);
        const key = `${source.id}:${event.id}`;
        if (record.key !== key || typeof record.read !== 'boolean' || !Number.isFinite(record.receivedAt)) throw new Error('Invalid history record');
        return { key, receivedAt: record.receivedAt, source, event, read: record.read,
          ...(record.destination ? {destination: destination(record.destination)} : {}) };
      });
      const seen = state.seen.slice(-MAX_SEEN).map(key => field(key, 'seen key', 513, true));
      this.entries = entries;
      this.seen = new Set(seen);
      const savedTimes = state.seenAt && typeof state.seenAt === 'object' && !Array.isArray(state.seenAt) ? state.seenAt : {};
      this.seenAt = new Map(seen.map(key => [key, Number.isFinite(savedTimes[key]) && savedTimes[key] >= 0 ? Math.min(savedTimes[key], this.now()) : this.now()]));
      for (const record of entries) this.seen.add(record.key);
      this.trimSeen();
    } catch (error) {
      if (error.code !== 'ENOENT') {
        // Keep a damaged file for diagnosis instead of silently overwriting it.
        throw new Error(`Cannot load notification history: ${error.message}`);
      }
    }
  }

  trimSeen() {
    while (this.seen.size > MAX_SEEN) {
      const key = this.seen.values().next().value;
      this.seen.delete(key); this.seenAt.delete(key);
    }
    for (const key of this.seenAt.keys()) if (!this.seen.has(key)) this.seenAt.delete(key);
  }

  save() {
    privacy.checkedFile(this.storage, path.basename(this.file), true);
    atomicallyWrite(this.file, {version: 1, entries: this.entries, seen: [...this.seen],
      seenAt: Object.fromEntries([...this.seen].map(key => [key, this.seenAt.get(key) ?? this.now()]))});
  }

  rememberWindows(resolveWindow) {
    const previous = this.entries;
    let changed = false;
    this.entries = previous.map(record => {
      const window = resolveWindow(record);
      if (!window?.workspaceUri) return record;
      let value;
      try { value = destination(window); } catch { return record; }
      if (JSON.stringify(record.destination) === JSON.stringify(value)) return record;
      changed = true;
      return {...record, destination: value};
    });
    if (!changed) return false;
    try { this.save(); } catch (error) { this.entries = previous; throw error; }
    this.emit('changed');
    return true;
  }

  prune() {
    const cutoff = this.now() - this.control.retentionDays * privacy.DAY;
    const before = this.entries;
    const seen = this.seen;
    const seenAt = this.seenAt;
    this.entries = before.filter(record => record.receivedAt >= cutoff && record.event.timestamp * 1000 > this.control.cutoff);
    this.seen = new Set([...seen].filter(key => (seenAt.get(key) ?? this.now()) >= cutoff));
    this.seenAt = new Map([...seenAt].filter(([key]) => this.seen.has(key)));
    const removed = before.filter(record => !this.entries.includes(record)).map(record => record.key);
    if (removed.length || seen.size !== this.seen.size) {
      try { this.save(); } catch (error) { this.entries = before; this.seen = seen; this.seenAt = seenAt; throw error; }
      if (removed.length) this.emit('removed', removed);
      this.emit('changed');
    }
    const legacy = privacy.cacheFiles(this.storage).filter(item => item.name !== path.basename(this.file) && item.name !== 'broker-token' && item.modifiedAt < cutoff);
    privacy.removeCacheFiles(this.storage, legacy.map(item => item.name));
    return {expired: removed.length};
  }

  setRetentionDays(days) {
    const next = {...this.control, retentionDays: privacy.retentionDays(days)};
    if (next.retentionDays === this.control.retentionDays) return {retentionDays: next.retentionDays};
    privacy.writeControl(this.storage, next); this.control = next;
    this.prune();
    return {retentionDays: next.retentionDays};
  }

  privacyStatus() {
    const files = privacy.cacheFiles(this.storage);
    return {retentionDays: this.control.retentionDays, paused: this.control.paused,
      files, totalBytes: files.reduce((sum, item) => sum + item.bytes, 0),
      retainedControl: t('只保留保留期、暂停状态、清理时间和新通信凭据，不含会话标识')};
  }

  resetPrivacy() {
    const files = privacy.cacheFiles(this.storage);
    // Pause durably before deleting anything; partial I/O failures never resume ingest.
    const next = {...this.control, paused: true, cutoff: this.now()};
    privacy.writeControl(this.storage, next); this.control = next;
    const keys = this.entries.map(record => record.key);
    this.entries = []; this.seen = new Set(); this.seenAt = new Map();
    this.emit('removed', keys); this.emit('changed');
    const deletedCount = privacy.removeCacheFiles(this.storage, files.map(item => item.name));
    return {cleared: true, paused: true, deletedCount};
  }

  resumePrivacy() {
    const next = {...this.control, paused: false};
    privacy.writeControl(this.storage, next); this.control = next;
    return {paused: false};
  }

  add(rawSource, rawEvent, rawOptions) {
    const source = validateSource(rawSource);
    const event = validateEvent(rawEvent);
    const options = validateOptions(rawOptions);
    this.prune();
    if (!event.session_title && event.session_id) {
      const named = this.entries.find(row => row.source.id === source.id && row.event.session_id === event.session_id && row.event.session_title);
      if (named) event.session_title = named.event.session_title;
    }
    if (this.control.paused || event.timestamp * 1000 <= this.control.cutoff || event.timestamp * 1000 < this.now() - this.control.retentionDays * privacy.DAY) {
      return {accepted: true, ignored: true, reason: this.control.paused ? 'privacy-paused' : 'expired'};
    }
    const key = `${source.id}:${event.id}`;
    if (event.type === 'task' || event.type === 'approval_resolved') {
      if (event.type === 'approval_resolved' && this.seen.has(key)) return {accepted: true, duplicate: true, key};
      const index = this.entries.findIndex(record => record.key === key);
      const existing = this.entries[index];
      if (existing && (existing.event.session_id !== event.session_id || existing.event.turn_id !== event.turn_id || existing.event.cwd !== event.cwd)) throw new Error('Task identity changed');
      if (existing && (event.task.sequence <= existing.event.task.sequence || event.timestamp < existing.event.timestamp)) return {accepted: true, duplicate: true, key};
      // An explicit deletion keeps its tombstone, just as notifications do.
      if (!existing && this.seen.has(key)) return {accepted: true, duplicate: true, key};
      const previous = this.entries;
      const oldSeen = new Set(this.seen);
      const oldSeenAt = new Map(this.seenAt);
      const record = {key, receivedAt: this.now(), source, event, read: true,
        ...(existing?.destination ? {destination: existing.destination} : {})};
      this.entries = existing ? this.entries.map((row, i) => i === index ? record : row) : [...this.entries, record].slice(-MAX_HISTORY);
      const acknowledged = readEarlierRounds(this.entries);
      this.entries = acknowledged.records;
      this.seen.add(key); this.seenAt.set(key, this.now()); this.trimSeen();
      try { this.save(); } catch (error) { this.entries = previous; this.seen = oldSeen; this.seenAt = oldSeenAt; throw error; }
      if (acknowledged.readKeys.length) this.emit('read', acknowledged.readKeys);
      this.emit('changed');
      return {accepted: true, duplicate: false, key};
    }
    if (this.seen.has(key)) return { accepted: true, duplicate: true, key };
    const record = { key, receivedAt: this.now(), source, event, read: false };
    const oldEntries = this.entries;
    const oldSeen = new Set(this.seen);
    const oldSeenAt = new Map(this.seenAt);
    this.entries = [...this.entries, record].slice(-MAX_HISTORY);
    const acknowledged = readEarlierRounds(this.entries);
    this.entries = acknowledged.records;
    this.seen.add(key);
    this.seenAt.set(key, this.now());
    this.trimSeen();
    try { this.save(); } catch (error) { this.entries = oldEntries; this.seen = oldSeen; this.seenAt = oldSeenAt; throw error; }
    if (acknowledged.readKeys.length) this.emit('read', acknowledged.readKeys);
    this.emit('changed');
    const saved = this.entries.find(entry => entry.key === key);
    if (!saved.read) this.emit('event', saved, options);
    return { accepted: true, duplicate: false, key };
  }

  setSessionTitles(sourceId, titles) {
    field(sourceId, 'sourceId', 256, true);
    if (!Array.isArray(titles) || titles.length > 200) throw new Error('Invalid session titles');
    const names = new Map(titles.map(row => {
      object(row, 'session title');
      return [field(row.session_id, 'session_id', 256, true), field(row.title, 'title', 160, true)];
    }));
    this.prune();
    if (this.control.paused) return {updated: 0};
    let updated = 0;
    const previous = this.entries;
    this.entries = this.entries.map(row => {
      const title = row.source.id === sourceId && names.get(row.event.session_id);
      if (!title || row.event.type === 'test' || row.event.session_title === title) return row;
      updated++;
      return {...row, event: {...row.event, session_title: title}};
    });
    if (updated) {
      try {this.save();} catch (error) {this.entries = previous; throw error;}
      this.emit('changed');
    }
    return {updated};
  }

  history() {
    this.prune();
    return {entries: [...this.entries].reverse(), unread: this.entries.filter(record => !record.read).length,
      privacyPaused: this.control.paused, retentionDays: this.control.retentionDays};
  }

  markRead(request) {
    let keys;
    if (request.key !== undefined) keys = [field(request.key, 'key', 513, true)];
    else if (request.keys !== undefined) {
      if (!Array.isArray(request.keys) || request.keys.length > MAX_HISTORY) throw new Error('Invalid keys');
      keys = request.keys.map(key => field(key, 'key', 513, true));
    }
    const selected = keys ? new Set(keys) : undefined;
    const oldEntries = this.entries;
    this.entries = this.entries.map(record => (!selected || selected.has(record.key)) ? { ...record, read: true } : record);
    try { this.save(); } catch (error) { this.entries = oldEntries; throw error; }
    this.emit('changed');
    return { unread: this.entries.filter(record => !record.read).length };
  }

  deleteEntry(request) {
    object(request, 'delete request');
    const key = field(request.key, 'key', 513, true);
    return this.removeMatching(record => record.key === key);
  }

  clearRead({annotate} = {}) {
    const protectedKeys = new Set();
    const entries = annotate ? this.entries.map(annotate) : this.entries;
    for (const row of taskRows(entries, {requireConnected: !!annotate})) {
      // Preserve all evidence for active rounds and pending reminders,
      // including read questions and PostToolUse resolution records.
      if (!row.read || ['running', 'waiting_input', 'waiting_async', 'waiting_approval'].includes(row.taskState)) {
        for (const key of row.relatedKeys) protectedKeys.add(key);
      }
    }
    return this.removeMatching(record => record.read && !protectedKeys.has(record.key));
  }

  removeMatching(predicate) {
    const previous = this.entries;
    const removed = previous.filter(predicate);
    if (!removed.length) return {deleted: 0, unread: previous.filter(record => !record.read).length};
    const keys = new Set(removed.map(record => record.key));
    this.entries = previous.filter(record => !keys.has(record.key));
    // Preserve deduplication tombstones so an observer replay cannot resurrect
    // notifications the user deleted, including after a broker restart.
    try { this.save(); } catch (error) { this.entries = previous; throw error; }
    this.emit('removed', [...keys]);
    this.emit('changed');
    return {deleted: removed.length, unread: this.entries.filter(record => !record.read).length};
  }

  clear() {
    this.removeMatching(() => true);
    return { unread: 0 };
  }
}

function formatBatch(items) {
  const t = translator(items[0]?.record.notificationLanguage || 'zh-CN');
  const priority = { approval: 0, question: 1, done: 2, test: 3 };
  const visibleItems = items.filter(item => item.options.desktop);
  const sorted = [...visibleItems].sort((a, b) => priority[a.record.event.type] - priority[b.record.event.type]);
  const firstProject = sorted[0]?.record.event.cwd.replace(/\\/g, '/').replace(/\/$/, '').split('/').pop();
  const title = visibleItems.length === 1 ? t(TITLES[sorted[0].record.event.type]) + (firstProject ? ` · ${firstProject}` : '') : t`Codex 有 ${visibleItems.length} 条新提醒`;
  const lines = sorted.slice(0, 4).map(({ record }) => {
    const source = record.targetWindowLabel || record.source.label || record.event.label || record.source.host || record.event.host || record.source.id;
    const type = t(TITLES[record.event.type]).replace('Codex ', '');
    const project = record.event.cwd.replace(/\\/g, '/').replace(/\/$/, '').split('/').pop();
    const session = record.event.session_id ? ` · ${record.event.session_id.slice(0, 8)}` : '';
    return `${type}${project ? ' · ' + project.slice(0, 24) : ''} · ${source.slice(0, 48)}${session}`;
  });
  if (visibleItems.length > 4) lines.push(t`另有 ${visibleItems.length - 4} 条，请查看通知历史`);
  // A merged alert plays once, using the highest-priority audible event's sound.
  const audible = items.filter(item => item.options.sound && validateSoundVolume(item.options.soundVolume) > 0)
    .sort((a, b) => priority[a.record.event.type] - priority[b.record.event.type]);
  const soundFile = audible[0]?.options.soundFile;
  return { title, language: items[0]?.record.notificationLanguage === 'en' ? 'en' : 'zh-CN', body: lines.join('\n'), sound: audible.length > 0,
    soundVolume: validateSoundVolume(audible[0]?.options.soundVolume),
    ...(soundFile ? {soundFile} : {}), desktop: items.some(item => item.options.desktop), keys: visibleItems.map(item => item.record.key) };
}

class BatchScheduler extends EventEmitter {
  constructor(deliver, options = {}) {
    super();
    this.deliver = deliver;
    this.now = options.now || Date.now;
    this.scheduleTimer = options.setTimeout || setTimeout;
    this.cancelTimer = options.clearTimeout || clearTimeout;
    this.batchMs = options.batchMs ?? 700;
    this.intervalMs = options.intervalMs ?? 4000;
    this.queueLimit = options.queueLimit ?? 1000;
    this.filterItems = options.filterItems || (items => items);
    this.queue = [];
    this.timer = null;
    this.lastDelivery = -Infinity;
    this.delivering = false;
    this.closed = false;
  }

  add(record, options) {
    if (this.closed || (!options.desktop && !options.sound)) return;
    if (this.queue.length >= this.queueLimit) {
      this.emit('deliveryError', [record], 'Notification queue limit reached');
      return;
    }
    this.queue.push({ record, options, queuedAt: this.now() });
    this.plan();
  }

  plan() {
    if (this.closed || this.timer !== null || this.delivering || !this.queue.length) return;
    const due = Math.max(this.queue[0].queuedAt + this.batchMs, this.lastDelivery + this.intervalMs);
    this.timer = this.scheduleTimer(() => { this.timer = null; void this.flush(); }, Math.max(0, due - this.now()));
  }

  async flush() {
    if (this.closed || this.delivering || !this.queue.length) return;
    this.delivering = true;
    const items = this.filterItems(this.queue.splice(0));
    if (!items.length) { this.delivering = false; this.plan(); return; }
    this.lastDelivery = this.now();
    try {
      // One native popup must not mix window languages. Preserve delivery failure isolation.
      const groups = new Map();
      for (const item of items) {
        const language = item.record.notificationLanguage === 'en' ? 'en' : 'zh-CN';
        if (!groups.has(language)) groups.set(language, []);
        groups.get(language).push(item);
      }
      for (const group of groups.values()) {
        if (this.closed) break;
        const live = this.filterItems(group);
        if (!live.length) continue;
        try { await this.deliver(formatBatch(live), live.map(item => item.record)); }
        catch (error) { this.emit('deliveryError', live.map(item => item.record), error.message); }
      }
    }
    finally {
      this.delivering = false;
      this.plan();
    }
  }

  close() {
    this.closed = true;
    if (this.timer !== null) this.cancelTimer(this.timer);
    this.timer = null;
    this.queue = [];
  }

  cancel(predicate = () => true) {
    this.queue = this.queue.filter(item => !predicate(item.record));
    if (!this.queue.length && this.timer !== null) { this.cancelTimer(this.timer); this.timer = null; }
  }
}

module.exports = { NotificationStore, BatchScheduler, validateSource, validateEvent, validateOptions, formatBatch, MAX_HISTORY, MAX_SEEN, BROKER_PROTOCOL_VERSION, turnKey, resolvedApprovalKeys, pathIdentity, taskIdentity, taskRows };
