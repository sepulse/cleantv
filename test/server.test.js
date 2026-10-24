import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createAppServer } from '../src/server/index.js';
import { createEngine } from '../src/core/engine.js';
import { CleanTvError } from '../src/core/errors.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { createAdbClient } from '../src/core/adb/client.js';
import { fakeRunner } from './helpers/fake-runner.js';

const serial = '192.168.1.5:5555';
const encoded = encodeURIComponent(serial);
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

async function setup(t, overrides = {}) {
  const calls = [];
  const client = {
    devices: async () => [{ serial, state: 'device', model: 'TV' }],
    connect: async (...args) => { calls.push(['connect', ...args]); return { serial, state: 'device' }; },
    disconnect: async value => { calls.push(['disconnect', value]); },
  };
  const info = { serial, deviceId: 'TV123', brand: 'Brand', manufacturer: 'Maker', model: 'TV', androidVersion: '12', sdk: 31,
    isGoogleTv: true, homePackage: 'com.example.home' };
  const engine = {
    inspect: async value => { calls.push(['inspect', value]); return { info, presets: ['common'], packages: [{ package: 'com.example.foo' }] }; },
    history: async value => { calls.push(['history', value]); return [{ at: 'today', action: 'disable', package: 'com.example.foo', result: 'disabled' }]; },
    disable: async (value, pkgs, progress) => {
      calls.push(['disable', value, pkgs]);
      progress({ done: 1, total: 1, package: pkgs[0], result: 'disabled' });
      return { succeeded: 1, failed: 0, results: [{ package: pkgs[0], result: 'disabled' }] };
    },
    restore: async (value, pkgs, progress) => {
      calls.push(['restore', value, pkgs]);
      progress({ done: 1, total: 1, package: 'com.example.foo', result: 'enabled' });
      return { succeeded: 1, failed: 0, results: [{ package: 'com.example.foo', result: 'enabled' }] };
    },
  };
  const scan = async ({ signal }) => { assert.equal(signal.aborted, false); return [{ ip: '192.168.1.5', port: 5555 }]; };
  const server = createAppServer({ engine, client, journal: {}, scan, publicDir, token: 'secret', ...overrides });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async path => fetch(base + path);
  const post = async (path, body) => fetch(base + path, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-CleanTV-Token': 'secret',
  }, body: JSON.stringify(body) });
  return { client, engine, calls, get, post };
}

test('all API routes return their contracted shapes', async t => {
  const { calls, get, post } = await setup(t);
  assert.deepEqual(await (await get('/api/health')).json(), { ok: true, adb: { found: true, path: null, version: null } });
  assert.deepEqual(await (await post('/api/discover', {})).json(), { candidates: [{ ip: '192.168.1.5', port: 5555 }] });
  assert.deepEqual(await (await post('/api/devices/connect', { ip: '192.168.1.5' })).json(), { serial, state: 'device' });
  assert.deepEqual(await (await get('/api/devices')).json(), { devices: [{ serial, state: 'device' }] });
  const device = await (await get(`/api/devices/${encoded}`)).json();
  assert.equal(device.deviceId, 'TV123');
  assert.deepEqual(device.presets, ['common']);
  assert.deepEqual(await (await get(`/api/devices/${encoded}/packages`)).json(), { packages: [{ package: 'com.example.foo' }] });
  assert.deepEqual(await (await get(`/api/devices/${encoded}/history`)).json(), { entries: [{ at: 'today', action: 'disable', package: 'com.example.foo', result: 'disabled' }] });
  assert.deepEqual(await (await post(`/api/devices/${encoded}/disconnect`, {})).json(), { ok: true });
  const disable = await post(`/api/devices/${encoded}/disable`, { packages: ['com.example.foo'] });
  assert.equal(disable.status, 202);
  const { jobId } = await disable.json();
  const events = await (await get(`/api/jobs/${jobId}/events`)).text();
  assert.ok(events.indexOf('event: progress') < events.indexOf('event: complete'));
  assert.match(events, /"succeeded":1/);
  const restore = await post(`/api/devices/${encoded}/restore`, { all: true });
  assert.equal(restore.status, 202);
  const restoreEvents = await (await get(`/api/jobs/${(await restore.json()).jobId}/events`)).text();
  assert.match(restoreEvents, /event: complete/);
  assert.ok(calls.some(call => call[0] === 'restore' && call[2] === 'all'));
  assert.equal((await get('/api/jobs/unknown/events')).status, 404);
});

test('disconnect refuses a busy serial for every job type and permits it after completion', async t => {
  const other = '192.168.1.6:5555';
  const run = fakeRunner({ [`disconnect ${serial}`]: {}, [`disconnect ${other}`]: {} });
  const { engine, post, get } = await setup(t, { client: createAdbClient(run) });
  for (const [method, suffix, body] of [
    ['disable', '/disable', { packages: ['com.example.foo'] }],
    ['swapLauncher', '/launcher/swap', { package: 'com.spocky.projengmenu' }],
    ['restoreLauncher', '/launcher/restore', {}],
  ]) {
    let finish;
    engine[method] = () => new Promise(resolve => { finish = resolve; });
    const { jobId } = await (await post(`/api/devices/${encoded}${suffix}`, body)).json();
    const before = run.calls.length;
    const blocked = await post(`/api/devices/${encoded}/disconnect`, {});
    assert.equal(blocked.status, 409);
    assert.equal((await blocked.json()).error.code, 'DEVICE_BUSY');
    assert.equal(run.calls.length, before);
    assert.equal((await post(`/api/devices/${encodeURIComponent(other)}/disconnect`, {})).status, 200);
    finish({ succeeded: 0, failed: 0, results: [] });
    await (await get(`/api/jobs/${jobId}/events`)).text();
    assert.equal((await post(`/api/devices/${encoded}/disconnect`, {})).status, 200);
  }
});

test('inspection recovery flags and recovery guidance survive HTTP and SSE', async t => {
  const { engine, get, post } = await setup(t);
  engine.inspect = async () => ({ info: { serial }, presets: [], packages: [], recovered: true, journalWarning: true });
  for (const suffix of ['', '/packages']) {
    const result = await (await get(`/api/devices/${encoded}${suffix}`)).json();
    assert.equal(result.recovered, true);
    assert.equal(result.journalWarning, true);
  }
  engine.restoreLauncher = async () => ({ succeeded: 1, failed: 1, results: [], journalWarning: true,
    manualHomePackage: 'com.google.android.tvlauncher' });
  const { jobId } = await (await post(`/api/devices/${encoded}/launcher/restore`, {})).json();
  const events = await (await get(`/api/jobs/${jobId}/events`)).text();
  assert.match(events, /"journalWarning":true/);
  assert.match(events, /"manualHomePackage":"com.google.android.tvlauncher"/);
});

test('busy serial, input validation, and absent ADB', async t => {
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const engine = { disable: async () => { await gate; return { succeeded: 0, failed: 0, results: [] }; } };
  const { post } = await setup(t, { engine });
  assert.equal((await post(`/api/devices/${encoded}/disable`, { packages: ['com.example.foo'] })).status, 202);
  assert.equal((await post(`/api/devices/${encoded}/disable`, { packages: ['com.example.foo'] })).status, 409);
  finish();
  assert.equal((await post(`/api/devices/${encoded}/restore`, { all: true, packages: ['com.example.foo'] })).status, 400);
  assert.equal((await post('/api/devices/connect', { ip: '192.168.1.5', port: '5555' })).status, 400);
  assert.equal((await post(`/api/devices/${encodeURIComponent('bad:5555')}/disconnect`, {})).status, 400);
  const missing = await setup(t, { client: null, engine: null });
  assert.equal((await (await missing.get('/api/health')).json()).adb.found, false);
  assert.equal((await missing.get('/api/devices')).status, 503);
  assert.equal((await missing.post(`/api/devices/${encoded}/disconnect`, {})).status, 503);
  assert.equal((await missing.get(`/api/devices/${encoded}/launcher`)).status, 503);
  for (const route of ['open-store', 'swap', 'restore']) assert.equal((await missing.post(`/api/devices/${encoded}/launcher/${route}`, {})).status, 503);
});

test('known error codes map to statuses and unexpected faults are redacted', async t => {
  const { engine, get } = await setup(t);
  const cases = [
    ['INVALID_INPUT', 400], ['FORBIDDEN', 403], ['DEVICE_BUSY', 409], ['DEVICE_UNAUTHORIZED', 409],
    ['DEVICE_OFFLINE', 409], ['DEVICE_UNREACHABLE', 404], ['PACKAGE_PROTECTED', 422],
    ['PACKAGE_NOT_IN_REGISTRY', 422], ['PACKAGE_IS_LAUNCHER', 422], ['ADB_NOT_FOUND', 503],
    ['TIMEOUT', 504], ['COMMAND_FAILED', 502],
  ];
  for (const [code, status] of cases) {
    engine.inspect = async () => { throw new CleanTvError(code, 'public message'); };
    const response = await get(`/api/devices/${encoded}`);
    assert.equal(response.status, status, code);
    const message = { COMMAND_FAILED: 'The TV could not complete the action.',
      TIMEOUT: 'The TV took too long to respond.', ADB_NOT_FOUND: 'The TV connection tool is not available.' }[code] ?? 'public message';
    assert.deepEqual(await response.json(), { error: { code, message } });
  }
  engine.inspect = async () => { throw new Error('private diagnostic'); };
  const response = await get(`/api/devices/${encoded}`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: { code: 'INTERNAL', message: 'Internal server error' } });
});

test('engine maps device states before package work and history reads newest first', async () => {
  const calls = [];
  let state = 'device';
  const client = {
    devices: async () => state === 'missing' ? [] : [{ serial, state }],
    listPackages: async () => { calls.push('packages'); return []; },
    getprops: async () => ({ 'ro.serialno': 'TV123' }),
    resolveHomeActivity: async () => null,
  };
  const journal = { read: async () => [
    { at: 'old', action: 'disable', package: 'com.example.foo', status: 'ok' },
    { at: 'new', action: 'enable', package: 'com.example.foo', status: 'failed' },
  ] };
  const engine = createEngine({ client, journal, presets: [] });
  for (const [status, code] of [['missing', 'DEVICE_UNREACHABLE'], ['unauthorized', 'DEVICE_UNAUTHORIZED'], ['offline', 'DEVICE_OFFLINE']]) {
    state = status;
    await assert.rejects(engine.inspect(serial), { code });
    assert.equal(calls.length, 0);
  }
  state = 'device';
  assert.deepEqual(await engine.history(serial), [
    { at: 'new', action: 'enable', package: 'com.example.foo', result: 'failed' },
    { at: 'old', action: 'disable', package: 'com.example.foo', result: 'disabled' },
  ]);
  journal.read = async () => { throw new SyntaxError('corrupt'); };
  assert.deepEqual(await engine.history(serial), []);
});

test('history drops resolved pending intents but keeps unresolved ones and distinct actions', async () => {
  const client = { devices: async () => [{ serial, state: 'device' }], listPackages: async () => [],
    getprops: async () => ({ 'ro.serialno': 'TV123' }), resolveHomeActivity: async () => null };
  const records = [
    { at: '1', package: 'com.example.foo', action: 'disable', status: 'pending' },
    { at: '2', package: 'com.example.foo', action: 'disable', status: 'ok' },
    { at: '3', package: 'com.example.foo', action: 'enable', status: 'pending' },
  ];
  const engine = createEngine({ client, presets: [], journal: { read: async () => records } });
  assert.deepEqual((await engine.history(serial)).map(item => item.result), ['pending', 'disabled']);
});

test('command diagnostics are redacted in HTTP and SSE', async t => {
  const { engine, get, post } = await setup(t);
  for (const code of ['COMMAND_FAILED', 'TIMEOUT', 'ADB_NOT_FOUND']) {
    engine.inspect = async () => { throw new CleanTvError(code, 'private path and output'); };
    const response = await get(`/api/devices/${encoded}`);
    assert.doesNotMatch(await response.text(), /private path/);
    engine.disable = async () => { throw new CleanTvError(code, 'private path and output'); };
    const { jobId } = await (await post(`/api/devices/${encoded}/disable`, { packages: ['com.example.foo'] })).json();
    const events = await (await get(`/api/jobs/${jobId}/events`)).text();
    assert.match(events, new RegExp(code));
    assert.doesNotMatch(events, /private path/);
  }
});

test('unknown routes and jobs have NOT_FOUND, distinct from unreachable TVs', async t => {
  const { get } = await setup(t);
  for (const path of ['/api/unknown', '/missing', '/api/jobs/unknown/events']) {
    const response = await get(path);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, 'NOT_FOUND');
  }
});

test('bootstrap resolves presets and public files outside the repo working directory', async () => {
  const moduleUrl = new URL('../src/server/index.js', import.meta.url).href;
  const source = `import { main } from ${JSON.stringify(moduleUrl)};
    const server = await main();
    try {
      const response = await fetch('http://127.0.0.1:' + server.address().port + '/');
      if (response.status !== 200 || !(await response.text()).includes('cleantv-token')) process.exitCode = 1;
    } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }`;
  await promisify(execFile)(process.execPath, ['--input-type=module', '-e', source], {
    cwd: tmpdir(), env: { ...process.env, CLEANTV_ADB: 'nonexistent-cleantv-test-adb' }, timeout: 15000,
  });
});

test('manualHomePackage from inspection survives the device, packages and launcher payloads', async t => {
  const { engine, get } = await setup(t);
  engine.inspect = async () => ({ info: { serial }, presets: [], packages: [], manualHomePackage: 'com.google.android.tvlauncher' });
  engine.launcherStatus = async () => ({ manualHomePackage: 'com.google.android.tvlauncher' });
  for (const suffix of ['', '/packages', '/launcher']) {
    assert.equal((await (await get(`/api/devices/${encoded}${suffix}`)).json()).manualHomePackage, 'com.google.android.tvlauncher');
  }
});
