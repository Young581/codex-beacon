'use strict';
const path = require('node:path');
const childProcess = require('node:child_process');
const {windowsPythonCandidates} = require('./core');

const PROBE = "import sys,json,sqlite3; print(json.dumps({'protocol':'codex-beacon-python-v1','version':list(sys.version_info[:3]),'executable':sys.executable}))";
function pythonEnvironment(environment = process.env) {
  const env = {...environment};
  // The plugin checks installed runtimes; it never requests launcher installs.
  for (const key of Object.keys(env)) if (/^(?:PYTHONHOME|PYTHONPATH|PYTHONIOENCODING|PYTHON_MANAGER_AUTOMATIC_INSTALL|PYLAUNCHER_ALLOW_INSTALL|PYLAUNCHER_ALWAYS_INSTALL)$/i.test(key)) delete env[key];
  env.PYTHONIOENCODING = 'utf-8'; env.PYTHON_MANAGER_AUTOMATIC_INSTALL = 'false';
  return env;
}

function probePython(candidate, {spawn = childProcess.spawn, signal, timeoutMs = 4000,
  platform = process.platform, env = process.env} = {}) {
  return new Promise((resolve, reject) => {
    let child, buffer = Buffer.alloc(0), complete = false;
    const finish = (error, value) => {
      if (complete) return;
      complete = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      if (error) {try {child?.kill();} catch {} reject(error);} else resolve(value);
    };
    const failure = code => Object.assign(new Error(code), {code});
    const cancel = () => finish(failure('PYTHON_CANCELLED'));
    const timer = setTimeout(() => finish(failure('PYTHON_TIMEOUT')), timeoutMs);
    if (signal?.aborted) {cancel(); return;}
    signal?.addEventListener('abort', cancel, {once: true});
    try {
      child = spawn(candidate.python, [...candidate.pythonArgs, '-I', '-S', '-c', PROBE],
        {shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: pythonEnvironment(env)});
      child.stdout.on('data', chunk => {
        if (buffer.length + chunk.length > 8192) return finish(failure('PYTHON_INVALID_RESPONSE'));
        buffer = Buffer.concat([buffer, chunk]);
      });
      // Never expose arbitrary launcher stderr, environment values or tracebacks.
      child.stderr.on('data', () => {});
      child.on('error', error => finish(failure(['ENOENT','EACCES','EPERM'].includes(error.code) ? error.code : 'PYTHON_SPAWN_FAILED')));
      child.on('close', code => {
        if (complete) return;
        if (code !== 0) return finish(failure(Number.isInteger(code) ? 'EXIT_' + code : 'PYTHON_EXITED'));
        let result;
        try {result = JSON.parse(buffer.toString('utf8').trim());} catch {return finish(failure('PYTHON_INVALID_RESPONSE'));}
        if (result?.protocol !== 'codex-beacon-python-v1' || !Array.isArray(result.version) || result.version.length !== 3 ||
            !result.version.every(value => Number.isInteger(value) && value >= 0) ||
            typeof result.executable !== 'string' || result.executable.length > 2048 || /[\u0000-\u001f\u007f]/u.test(result.executable) ||
            !(platform === 'win32' ? path.win32 : path.posix).isAbsolute(result.executable)) return finish(failure('PYTHON_INVALID_RESPONSE'));
        if (result.version[0] !== 3 || result.version[1] < 8) return finish(failure('PYTHON_TOO_OLD'));
        finish(null, {python: result.executable, pythonArgs: ['-I', '-S'], version: result.version.join('.')});
      });
    } catch (error) {finish(failure(['ENOENT','EACCES','EPERM'].includes(error.code) ? error.code : 'PYTHON_SPAWN_FAILED'));}
  });
}

async function resolvePython(config, {auto = true, environment = {}, signal, ...options} = {}) {
  const platform = environment.platform || process.platform;
  const candidates = auto && platform === 'win32' ? windowsPythonCandidates(environment)
    : [{python: config.python, pythonArgs: config.pythonArgs}];
  const attempts = [];
  const deadline = Date.now() + 20000;
  for (const candidate of candidates) {
    if (Date.now() >= deadline) break;
    try {return await probePython(candidate, {...options, platform, env: environment.env || process.env, signal,
      timeoutMs: Math.min(options.timeoutMs || 4000, deadline - Date.now())});}
    catch (error) {
      if (error.code === 'PYTHON_CANCELLED') throw error;
      attempts.push(error.code);
    }
  }
  throw Object.assign(new Error('PYTHON_RUNTIME_UNAVAILABLE'), {code: 'PYTHON_RUNTIME_UNAVAILABLE', attempts});
}

module.exports = {probePython, resolvePython, pythonEnvironment};
