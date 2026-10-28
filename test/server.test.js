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
import { REPLACEMENT_LAUNCHERS } from '../src/core/launchers.js';
import { DNS_PROVIDERS } from '../src/core/dns.js';

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
  const get = async path => fetch(base + path, { headers: { 'X-CleanTV-Token': 'secret' } });
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

test('DNS route validates provider IDs, uses the per-device job lock and streams results', async t => {
  const { engine, get, post } = await setup(t);
  const path = `/api/devices/${encoded}/dns`;
  const calls = [];
  let finish;
  engine.setDns = (serial, provider, progress) => new Promise(resolve => {
    calls.push({ serial, provider });
    finish = () => {
      const result = { action: 'dns', provider, result: 'configured' };
      progress({ done: 1, total: 1, ...result });
      resolve({ succeeded: 1, failed: 0, results: [result] });
    };
  });
  assert.deepEqual((await (await get(`/api/devices/${encoded}`)).json()).dnsProviders, DNS_PROVIDERS);
  for (const body of [{}, null, { provider: '' }, { provider: 'outside' }, { provider: 'dns.adguard-dns.com' },
    { provider: 'dns.example.com;id' }, { provider: { id: 'adguard' } }]) {
    assert.equal((await post(path, body)).status, 400);
  }
  assert.deepEqual(calls, []);
  for (const provider of [...DNS_PROVIDERS.map(entry => entry.id), 'off']) {
    const response = await post(path, { provider });
    assert.equal(response.status, 202);
    const { jobId } = await response.json();
    assert.equal((await post(path, { provider })).status, 409);
    assert.equal((await post(`/api/devices/${encoded}/restore`, { all: true })).status, 409);
    assert.equal((await post(`/api/devices/${encoded}/disconnect`, {})).status, 409);
    finish();
    const events = await (await get(`/api/jobs/${jobId}/events`)).text();
    assert.match(events, /event: progress/);
    assert.match(events, /event: complete/);
    assert.match(events, /"action":"dns"/);
    assert.deepEqual(calls.at(-1), { serial, provider });
    for (const headers of [
      { 'Content-Type': 'application/json' },
      { 'Content-Type': 'application/json', 'X-CleanTV-Token': 'wrong' },
      { 'X-CleanTV-Token': 'secret' },
      { 'Content-Type': 'application/json', 'X-CleanTV-Token': 'secret', Origin: 'http://evil.example' },
    ]) assert.equal((await fetch(response.url, { method: 'POST', headers, body: JSON.stringify({ provider }) })).status, 403);
  }
});

test('close-adb checks the port once after USB mode and disconnect, then removes any remaining transport', async t => {
  for (const [state, portClosed] of [['unreachable', true], ['device', false], ['unauthorized', null], ['offline', null], ['error', null]]) {
    await t.test(state, async t => {
      const run = fakeRunner({ [`-s ${serial} usb`]: {}, [`disconnect ${serial}`]: {},
        [`connect ${serial}`]: state === 'error' ? new CleanTvError('COMMAND_FAILED')
          : state === 'unreachable' ? { code: 1, stderr: 'cannot connect' } : {},
        'devices -l': { stdout: `${serial} ${state}` } });
      const { post } = await setup(t, { client: createAdbClient(run) });
      const response = await post(`/api/devices/${encoded}/close-adb`, {});
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, portClosed });
      assert.deepEqual(run.calls, [['-s', serial, 'usb'], ['disconnect', serial], ['connect', serial],
        ...(['unreachable', 'error'].includes(state) ? [] : [['devices', '-l']]), ['disconnect', serial]]);
    });
  }
});

test('close-adb preserves custom ports and rejects unsafe serials before any command', async t => {
  const serial = '192.168.1.5:1234';
  const run = fakeRunner({ [`-s ${serial} usb`]: {}, [`disconnect ${serial}`]: {}, [`connect ${serial}`]: { code: 1 } });
  const { post } = await setup(t, { client: createAdbClient(run) });
  for (const bad of ['bad', '192.168.1.5:0', '192.168.1.5:5555;id']) {
    assert.equal((await post(`/api/devices/${encodeURIComponent(bad)}/close-adb`, {})).status, 400);
  }
  assert.deepEqual(run.calls, []);
  assert.deepEqual(await (await post(`/api/devices/${encodeURIComponent(serial)}/close-adb`, {})).json(), { ok: true, portClosed: true });
  assert.deepEqual(run.calls, [['-s', serial, 'usb'], ['disconnect', serial], ['connect', serial], ['disconnect', serial]]);
});

test('close-adb disconnects after a successful reconnect even if device verification fails', async t => {
  const run = fakeRunner({ [`-s ${serial} usb`]: {}, [`disconnect ${serial}`]: {},
    [`connect ${serial}`]: {}, 'devices -l': new CleanTvError('COMMAND_FAILED') });
  const { post } = await setup(t, { client: createAdbClient(run) });
  assert.deepEqual(await (await post(`/api/devices/${encoded}/close-adb`, {})).json(), { ok: true, portClosed: null });
  assert.deepEqual(run.calls, [['-s', serial, 'usb'], ['disconnect', serial], ['connect', serial],
    ['devices', '-l'], ['disconnect', serial]]);
});

test('close-adb reports cleanup disconnect failures and releases the device reservation', async t => {
  for (const state of ['device', 'unreachable', 'error']) {
    await t.test(state, async t => {
      const run = fakeRunner({ [`-s ${serial} usb`]: {}, [`disconnect ${serial}`]: {},
        [`connect ${serial}`]: state === 'unreachable' ? { code: 1 } : {},
        'devices -l': state === 'error' ? new CleanTvError('COMMAND_FAILED') : { stdout: `${serial} device` } });
      let disconnects = 0;
      const client = createAdbClient(async args => {
        const result = await run(args);
        return args[0] === 'disconnect' && ++disconnects === 2 ? { ...result, code: 1 } : result;
      });
      const { post, get } = await setup(t, { client });
      const response = await post(`/api/devices/${encoded}/close-adb`, {});
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: { code: 'COMMAND_FAILED', message: 'The TV could not complete the action.' } });
      assert.equal(disconnects, 2);
      const job = await post(`/api/devices/${encoded}/disable`, { packages: ['com.example.foo'] });
      assert.equal(job.status, 202);
      await (await get(`/api/jobs/${(await job.json()).jobId}/events`)).text();
    });
  }
});

test('close-adb reserves the device against concurrent jobs and another close-adb through cleanup', async t => {
  for (const stage of ['usb', 'connect', 'cleanup']) {
    await t.test(stage, async t => {
      const entered = Promise.withResolvers();
      const gate = Promise.withResolvers();
      const run = fakeRunner({ [`-s ${serial} usb`]: {}, [`disconnect ${serial}`]: {},
        [`connect ${serial}`]: {}, 'devices -l': { stdout: `${serial} device` } });
      let disconnects = 0;
      let paused = false;
      const client = createAdbClient(async args => {
        const result = await run(args);
        if (args[0] === 'disconnect') disconnects++;
        if (!paused && (stage === 'usb' && args[2] === 'usb' || stage === 'connect' && args[0] === 'connect'
          || stage === 'cleanup' && args[0] === 'disconnect' && disconnects === 2)) {
          paused = true;
          entered.resolve();
          await gate.promise;
        }
        return result;
      });
      const { post, get, calls } = await setup(t, { client });
      const closing = post(`/api/devices/${encoded}/close-adb`, {});
      await entered.promise;
      try {
        const before = run.calls.length;
        for (const [suffix, body] of [['disable', { packages: ['com.example.foo'] }], ['close-adb', {}]]) {
          const response = await post(`/api/devices/${encoded}/${suffix}`, body);
          assert.equal(response.status, 409);
          assert.equal((await response.json()).error.code, 'DEVICE_BUSY');
        }
        assert.deepEqual(calls, []);
        assert.equal(run.calls.length, before);
      } finally {
        gate.resolve();
        assert.equal((await closing).status, 200);
      }
      const job = await post(`/api/devices/${encoded}/disable`, { packages: ['com.example.foo'] });
      assert.equal(job.status, 202);
      await (await get(`/api/jobs/${(await job.json()).jobId}/events`)).text();
    });
  }
});

test('close-adb reports USB mode and initial disconnect failures without probing', async t => {
  for (const failUsb of [true, false]) {
    const run = fakeRunner({ [`-s ${serial} usb`]: { code: failUsb ? 1 : 0 }, [`disconnect ${serial}`]: { code: 1 } });
    const { post } = await setup(t, { client: createAdbClient(run) });
    const response = await post(`/api/devices/${encoded}/close-adb`, {});
    assert.equal((await response.json()).error.code, 'COMMAND_FAILED');
    assert.deepEqual(run.calls, [['-s', serial, 'usb'], ...(failUsb ? [] : [['disconnect', serial]])]);
  }
});

test('disconnect and close-adb refuse a busy serial for every job type and permit them after completion', async t => {
  const other = '192.168.1.6:5555';
  const run = fakeRunner({ [`disconnect ${serial}`]: {}, [`disconnect ${other}`]: {}, [`-s ${serial} usb`]: {},
    [`connect ${serial}`]: { code: 1 } });
  const { engine, post, get } = await setup(t, { client: createAdbClient(run) });
  for (const [method, suffix, body] of [
    ['disable', '/disable', { packages: ['com.example.foo'] }],
    ['restore', '/restore', { all: true }],
    ['setDns', '/dns', { provider: 'off' }],
    ['swapLauncher', '/launcher/swap', { package: 'com.spocky.projengmenu' }],
    ['restoreLauncher', '/launcher/restore', {}],
    ['recoverLauncher', '/launcher/recover', {}],
  ]) {
    let finish;
    engine[method] = () => new Promise(resolve => { finish = resolve; });
    const { jobId } = await (await post(`/api/devices/${encoded}${suffix}`, body)).json();
    const before = run.calls.length;
    for (const action of ['disconnect', 'close-adb']) {
      const blocked = await post(`/api/devices/${encoded}/${action}`, {});
      assert.equal(blocked.status, 409);
      assert.equal((await blocked.json()).error.code, 'DEVICE_BUSY');
    }
    assert.equal(run.calls.length, before);
    assert.equal((await post(`/api/devices/${encodeURIComponent(other)}/disconnect`, {})).status, 200);
    finish({ succeeded: 0, failed: 0, results: [] });
    await (await get(`/api/jobs/${jobId}/events`)).text();
    assert.equal((await post(`/api/devices/${encoded}/disconnect`, {})).status, 200);
    assert.equal((await post(`/api/devices/${encoded}/close-adb`, {})).status, 200);
  }
});

test('device and package GETs include only non-empty reenabled lists and never disable automatically', async t => {
  const { engine, calls, get, post } = await setup(t);
  for (const reenabled of [undefined, [], ['com.example.foo']]) {
    engine.inspect = async () => ({ info: { serial }, presets: [], packages: [], reenabled });
    for (const suffix of ['', '/packages']) {
      const response = await get(`/api/devices/${encoded}${suffix}`);
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(Object.hasOwn(data, 'reenabled'), Boolean(reenabled?.length));
      if (reenabled?.length) assert.deepEqual(data.reenabled, reenabled);
    }
  }
  assert.ok(!calls.some(call => call[0] === 'disable'));
  const response = await post(`/api/devices/${encoded}/disable`, { packages: ['com.example.foo'] });
  assert.equal(response.status, 202);
  const events = await (await get(`/api/jobs/${(await response.json()).jobId}/events`)).text();
  assert.match(events, /"result":"disabled"/);
  assert.deepEqual(calls, [['disable', serial, ['com.example.foo']]]);
});

test('inspection detects recovery and the protected recovery job returns its verified result through SSE', async t => {
  const { engine, get, post } = await setup(t);
  engine.inspect = async () => ({ info: { serial }, presets: [], packages: [], needsRecovery: true, journalWarning: true });
  for (const suffix of ['', '/packages']) {
    const result = await (await get(`/api/devices/${encoded}${suffix}`)).json();
    assert.equal(result.needsRecovery, true);
    assert.equal(result.journalWarning, true);
  }
  engine.recoverLauncher = async value => {
    assert.equal(value, serial);
    return { succeeded: 1, failed: 0, results: [], recovered: true, journalWarning: true,
      manualHomePackage: 'com.google.android.tvlauncher' };
  };
  const response = await post(`/api/devices/${encoded}/launcher/recover`, {});
  assert.equal(response.status, 202);
  const { jobId } = await response.json();
  assert.equal(Buffer.from(jobId, 'base64url').length, 16);
  const events = await (await fetch(`${response.url.split('/api/')[0]}/api/jobs/${jobId}/events`)).text();
  assert.match(events, /"recovered":true/);
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

test('launcher routes validate registry selections and preserve the absent-package policy', async t => {
  const { engine, get, post } = await setup(t);
  const calls = [];
  engine.launcherStatus = async (value, pkg) => { calls.push(['status', value, pkg]); return { package: pkg }; };
  engine.openLauncherStore = async (value, pkg) => { calls.push(['store', value, pkg]); };
  engine.swapLauncher = async (value, pkg) => { calls.push(['swap', value, pkg]); return { results: [] }; };
  const path = '/api/devices/' + encoded + '/launcher';
  assert.equal((await get(path)).status, 200);
  assert.deepEqual(calls.pop(), ['status', serial, undefined]);
  for (const { package: pkg } of REPLACEMENT_LAUNCHERS) {
    assert.deepEqual(await (await get(path + '?package=' + pkg)).json(), { package: pkg });
    assert.deepEqual(calls.pop(), ['status', serial, pkg]);
    if (pkg === 'io.github.sepulse.cleantv.home') assert.equal((await post(path + '/open-store', { package: pkg })).status, 400);
    else {
      assert.equal((await post(path + '/open-store', { package: pkg })).status, 200);
      assert.deepEqual(calls.pop(), ['store', serial, pkg]);
    }
    const response = await post(path + '/swap', { package: pkg });
    assert.equal(response.status, 202);
    await (await get('/api/jobs/' + (await response.json()).jobId + '/events')).text();
    assert.deepEqual(calls.pop(), ['swap', serial, pkg]);
  }
  for (const query of ['?package=', '?package=com.example.other', '?package=com.bad%3Binput',
    '?package=com.spocky.projengmenu&package=me.efesser.flauncher']) {
    const response = await get(path + query);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'INVALID_INPUT');
  }
  for (const suffix of ['/swap', '/open-store']) {
    for (const body of [{}, { package: null }, { package: '' }, { package: 'com.example.other' },
      { package: 'com.bad;input' }, { package: ['me.efesser.flauncher'] }]) {
      const response = await post(path + suffix, body);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'INVALID_INPUT');
    }
  }
  assert.deepEqual(calls, [], 'invalid requests never reach the engine or start a mutation');
});

test('zone list is served without a device; zones reach the engine only when listed', async t => {
  const { engine, get, post } = await setup(t);
  const list = await (await get('/api/prayer-zones')).json();
  assert.ok(list.states.some(entry => entry.zones.some(zone => zone.code === 'KDH01')));
  const calls = [];
  engine.swapLauncher = async (value, pkg, _progress, options) => { calls.push(['swap', value, pkg, options]); return { results: [] }; };
  engine.setPrayerZone = async (value, zone) => { calls.push(['zone', value, zone]); return {}; };
  const path = '/api/devices/' + encoded + '/launcher';
  const swap = await post(path + '/swap', { package: 'io.github.sepulse.cleantv.home', zone: 'KDH01' });
  assert.equal(swap.status, 202);
  await (await get('/api/jobs/' + (await swap.json()).jobId + '/events')).text();
  assert.deepEqual(calls.pop(), ['swap', serial, 'io.github.sepulse.cleantv.home', { zone: 'KDH01' }]);
  assert.equal((await post(path + '/prayer-zone', { zone: 'SGR01' })).status, 200);
  assert.deepEqual(calls.pop(), ['zone', serial, 'SGR01']);
  for (const body of [{ zone: 'KDH99' }, { zone: 'KDH01;reboot' }, { zone: null }, {}, { zone: 'KDH01', extra: 1 }, [], null]) {
    assert.equal((await post(path + '/prayer-zone', body)).status, 400);
  }
  for (const zone of ['KDH99', 'kdh01', 1]) {
    assert.equal((await post(path + '/swap', { package: 'io.github.sepulse.cleantv.home', zone })).status, 400);
  }
  assert.deepEqual(calls, [], 'invalid zones never reach the engine');
});
