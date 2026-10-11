'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {PassThrough} = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {probePython, resolvePython, pythonEnvironment} = require('../remote/src/python-runtime');
const {settings, windowsPythonCandidates} = require('../remote/src/core');
const {powershell} = require('../ui/lib/ipc-security');

const executable = path.join(os.tmpdir(),'beacon-python',process.platform==='win32'?'python.exe':'python3');
const reply = (version = [3, 13, 0], python = executable) => JSON.stringify({protocol:'codex-beacon-python-v1', version, executable:python});
function fakeSpawn(responses) {
  const children = [];
  const spawn = (python, args, options) => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => {child.killed=true;};
    children.push({python,args,options,child});
    const response = responses.shift();
    setImmediate(() => {
      if (response?.error) child.emit('error', Object.assign(new Error('PRIVATE'), {code:response.error}));
      else if (response) {child.stdout.write(response.stdout || ''); child.stderr.write(response.stderr || ''); child.emit('close',response.code??0);}
    });
    return child;
  };
  return {spawn,children};
}
function environment() {
  const root = path.win32.join(os.tmpdir(),'Beacon Python Test');
  const old = path.win32.join(root,'Programs','Python','Python315','python.exe');
  const good = path.win32.join(root,'Programs','Python','Python313','python.exe');
  const launcher = path.win32.join(root,'Programs','Python','Launcher','py.exe');
  return {old,good,launcher,env:{platform:'win32',home:root,env:{LOCALAPPDATA:root,PATH:''},fs:{
    readdirSync(directory) {return directory === path.win32.join(root,'Programs','Python') ? ['Python315','Python313'] : [];},
    statSync(file) {return {isFile:()=>[old,good,launcher].includes(file)};},
  }}};
}

test('Windows prefers installed runtime candidates over a launcher with stale targets', () => {
  const state=environment(); const candidates=windowsPythonCandidates(state.env);
  assert.deepEqual(candidates.slice(0,3).map(item=>item.python),[state.old,state.good,state.launcher]);
});

test('a real 101 startup result falls through to a verified runtime without relaying stderr or using a shell', async () => {
  const state=environment(); const fake=fakeSpawn([{code:101,stderr:'PRIVATE credential and path'}, {stdout:reply([3,13,0],state.good)}]);
  const runtime=await resolvePython({python:state.old,pythonArgs:[]},{environment:state.env,spawn:fake.spawn});
  assert.equal(runtime.python,state.good); assert.deepEqual(runtime.pythonArgs,['-I','-S']);
  assert.equal(runtime.version,'3.13.0'); assert.equal(fake.children.length,2);
  assert.equal(fake.children[0].options.shell,false);
  assert.ok(fake.children[0].args.includes('-c'));
});

test('explicit Python paths are authoritative and missing runtimes report only bounded error codes', async () => {
  const state=environment(); const fake=fakeSpawn([{code:101,stdout:'PRIVATE',stderr:'SECRET'}]);
  await assert.rejects(resolvePython({python:state.launcher,pythonArgs:[]},{auto:false,environment:state.env,spawn:fake.spawn}),
    error=>error.code==='PYTHON_RUNTIME_UNAVAILABLE' && JSON.stringify(error.attempts)==='["EXIT_101"]' && !error.message.includes('PRIVATE'));
  assert.equal(fake.children.length,1);
});

test('runtime probes reject Python 3.7, invalid metadata, oversized output and stalled processes', async () => {
  for(const response of [{stdout:reply([3,7,0])},{stdout:'Python'},{stdout:reply([3,13,0],'relative.exe')},{stdout:'x'.repeat(8193)},null]) {
    const fake=fakeSpawn([response]);
    await assert.rejects(probePython({python:executable,pythonArgs:[]},{spawn:fake.spawn,timeoutMs:30}),
      error=>['PYTHON_TOO_OLD','PYTHON_INVALID_RESPONSE','PYTHON_TIMEOUT'].includes(error.code));
    assert.equal(fake.children[0].child.killed,true);
  }
});

test('probe cancellation kills only its child and never continues to another candidate', async () => {
  const fake=fakeSpawn([null]); const controller=new AbortController();
  const result=resolvePython({python:executable,pythonArgs:[]},{auto:false,spawn:fake.spawn,signal:controller.signal});
  controller.abort(); await assert.rejects(result,error=>error.code==='PYTHON_CANCELLED');
  assert.equal(fake.children.length,1); assert.equal(fake.children[0].child.killed,true);
});

test('Python environment removes broken overrides and blocks launcher-triggered automatic installation', () => {
  const input={PATH:'unchanged',CODEX_HOME:'unchanged',PYTHONHOME:'PRIVATE',PYTHONPATH:'PRIVATE',PYLAUNCHER_ALLOW_INSTALL:'1',PYLAUNCHER_ALWAYS_INSTALL:'1'};
  const result=pythonEnvironment(input);
  assert.equal(result.PATH,input.PATH); assert.equal(result.CODEX_HOME,input.CODEX_HOME);
  assert.equal(result.PYTHON_MANAGER_AUTOMATIC_INSTALL,'false'); assert.equal(result.PYTHONIOENCODING,'utf-8');
  for(const key of ['PYTHONHOME','PYTHONPATH','PYLAUNCHER_ALLOW_INSTALL','PYLAUNCHER_ALWAYS_INSTALL']) assert.equal(Object.hasOwn(result,key),false);
  assert.equal(input.PYTHONHOME,'PRIVATE');
});

test('Windows recovers from an actual executable returning 101 using a real Python process',
  {skip:process.platform!=='win32',timeout:30000}, async t=>{
    const runtime=await resolvePython(settings({get:(key,fallback)=>fallback}));
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'beacon-python-101-'));
    t.after(()=>fs.promises.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
    const bad=path.join(directory,'Programs','Python','Python315','python.exe'); fs.mkdirSync(path.dirname(bad),{recursive:true});
    const source=path.join(directory,'build-launcher.ps1');
    fs.writeFileSync(source,"param([string]$Destination)\nAdd-Type -TypeDefinition 'public static class BeaconBrokenLauncher {public static int Main() {return 101;}}' -OutputAssembly $Destination -OutputType ConsoleApplication\n");
    const built=spawnSync(powershell(),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',source,'-Destination',bad],
      {windowsHide:true,encoding:'utf8',timeout:10000});
    assert.ifError(built.error); assert.equal(built.status,0,built.stderr);
    const broken=spawnSync(bad,[],{windowsHide:true}); assert.equal(broken.status,101);
    const isolated={platform:'win32',home:directory,env:{LOCALAPPDATA:directory,PATH:path.dirname(runtime.python)}};
    const recovered=await resolvePython({python:bad,pythonArgs:[]},{environment:isolated});
    assert.equal(recovered.python.toLowerCase(),runtime.python.toLowerCase()); assert.equal(recovered.version,runtime.version);
  });
