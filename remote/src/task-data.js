'use strict';
const STATES = new Set(['running', 'waiting_input', 'waiting_async', 'waiting_approval', 'completed', 'failed', 'cancelled', 'unknown']);
function normalizeTask(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !STATES.has(value.state) ||
      !Number.isSafeInteger(value.sequence) || value.sequence < 0) throw new Error('Invalid task metadata');
  const text = input => {
    if (typeof input !== 'string' || input.length > 128 || /[\u0000-\u001f\u007f]/u.test(input)) throw new Error('Invalid task model/tier');
    return input;
  };
  const result = {state: value.state, sequence: value.sequence, model: text(value.model || '')};
  if (value.startedAt !== undefined) {
    if (!Number.isFinite(value.startedAt) || value.startedAt < 0 || value.startedAt > 4102444800) throw new Error('Invalid task start time');
    result.startedAt = value.startedAt;
  }
  if (value.startSequence !== undefined) {
    if (!Number.isSafeInteger(value.startSequence) || value.startSequence < 0 || value.startSequence > value.sequence) throw new Error('Invalid round start sequence');
    result.startSequence = value.startSequence;
  }
  const usage = value.usage;
  if (usage !== undefined) {
    if (!usage || typeof usage.complete !== 'boolean' || !Array.isArray(usage.segments) || usage.segments.length > 16) throw new Error('Invalid task usage');
    result.usage = {complete: usage.complete, segments: usage.segments.map(segment => {
      if (!segment || typeof segment !== 'object') throw new Error('Invalid usage segment');
      const normalized = {model: text(segment.model), tier: text(segment.tier)};
      for (const key of ['input', 'cachedInput', 'cacheWrite', 'output', 'reasoningOutput']) {
        if (!Number.isSafeInteger(segment[key]) || segment[key] < 0 || segment[key] > 1e12) throw new Error('Invalid token count');
        normalized[key] = segment[key];
      }
      if (normalized.cachedInput + normalized.cacheWrite > normalized.input || normalized.reasoningOutput > normalized.output) throw new Error('Invalid token subsets');
      return normalized;
    })};
  }
  return result;
}
module.exports = {normalizeTask};
