import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAdbClient } from '../src/core/adb/client.js';
import { createEngine } from '../src/core/engine.js';
import { createJournal } from '../src/core/journal.js';
import { DNS_PROVIDERS, privateDnsFor } from '../src/core/dns.js';

const serial = '192.168.1.5:5555';
const pkg = 'com.example.app';

function dnsClient({ mode = 'opportunistic', specifier = null } = {}) {
  const settings = { private_dns_mode: mode, private_dns_specifier: specifier };
  const calls = [];
  const control = { fail: false, failKey: null, mismatch: false, beforeWrite: async () => {} };
  const run = async args => {
    calls.push(args);
    assert.deepEqual(args.slice(0, 4), ['-s', serial, 'shell', 'settings']);
    const [, , , , operation, namespace, key, value] = args;
    if (operation === 'get') return { code: 0, stderr: '', stdout: settings[key] ?? 'null' };
    assert.equal(namespace, 'global');
    assert.ok(['private_dns_mode', 'private_dns_specifier'].includes(key));
    await control.beforeWrite();
    if (control.fail || control.failKey === key) return { code: 1, stderr: 'write rejected', stdout: '' };
    if (!control.mismatch) settings[key] = operation === 'delete' ? null : value;
    return { code: 0, stderr: '', stdout: '' };
  };
  return { client: createAdbClient(run), settings, calls, control };
}

test('DNS has a fixed provider list and rejects arbitrary provider IDs or hosts', () => {
  assert.ok(Object.isFrozen(DNS_PROVIDERS));
  for (const provider of DNS_PROVIDERS) {
    assert.ok(Object.isFrozen(provider));
    assert.deepEqual(privateDnsFor(provider.id), { mode: 'hostname', specifier: provider.host });
  }
  assert.deepEqual(privateDnsFor('off'), { mode: 'off', specifier: null });
  for (const input of [undefined, null, '', 'unknown', 'dns.example.com', 'dns.adguard-dns.com', {}, ['adguard']]) {
    assert.throws(() => privateDnsFor(input), { code: 'INVALID_INPUT' });
  }
});

test('setPrivateDns writes only DNS keys, deletes null specifiers and verifies all writes with getSettings', async () => {
  const { client, calls } = dnsClient();
  for (const settings of [privateDnsFor('adguard'), privateDnsFor('off'), { mode: 'opportunistic', specifier: 'original.example.com' },
    { mode: 'hostname', specifier: null }]) {
    const before = calls.length;
    await client.setPrivateDns(serial, settings);
    const writes = calls.slice(before, before + 2);
    assert.deepEqual(writes[0], ['-s', serial, 'shell', 'settings', settings.specifier === null ? 'delete' : 'put',
      'global', 'private_dns_specifier', ...(settings.specifier === null ? [] : [settings.specifier])]);
    assert.deepEqual(writes[1], ['-s', serial, 'shell', 'settings', 'put', 'global', 'private_dns_mode', settings.mode]);
    assert.equal(calls.slice(before + 2).length, 6);
    assert.ok(calls.slice(before + 2).every(args => args[4] === 'get'));
    const actual = await client.getSettings(serial);
    assert.equal(actual['global/private_dns_mode'], settings.mode);
    assert.equal(actual['global/private_dns_specifier'], settings.specifier);
  }
});

test('setPrivateDns rejects unsafe modes and strict-hostname violations before any command', async () => {
  const { client, calls } = dnsClient();
  for (const mode of [undefined, null, '', 'automatic', 'hostname;id', 'off\n']) {
    await assert.rejects(client.setPrivateDns(serial, { mode, specifier: null }), { code: 'INVALID_INPUT' });
  }
  for (const specifier of [undefined, '', 'example', '127.0.0.1', 'https://dns.example.com', 'dns.example.com:853',
    ' dns.example.com', 'dns.example.com\n', 'dns.example.com;id', 'dns.example.com&&id', '$(id).example.com',
    '-dns.example.com', 'dns-.example.com', 'dns..example.com', 'dns_example.com', 'dns.example.com.',
    `${'a'.repeat(64)}.com`, `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.com`]) {
    await assert.rejects(client.setPrivateDns(serial, { mode: 'hostname', specifier }), { code: 'INVALID_INPUT' });
  }
  for (const value of [undefined, null, {}]) await assert.rejects(client.setPrivateDns(serial, value), { code: 'INVALID_INPUT' });
  assert.deepEqual(calls, []);
});

test('DNS verifies readback even on zero exit and reports rejected commands', async () => {
  for (const flag of ['fail', 'mismatch']) {
    const { client, control } = dnsClient();
    control[flag] = true;
    await assert.rejects(client.setPrivateDns(serial, privateDnsFor('adguard')), { code: 'COMMAND_FAILED' });
  }
});

test('baseline restoration deletes an originally absent mode and specifier', async () => {
  const { client, calls, settings } = dnsClient(privateDnsFor('adguard'));
  await client.restorePrivateDns(serial, { mode: null, specifier: null });
  assert.deepEqual(settings, { private_dns_mode: null, private_dns_specifier: null });
  assert.deepEqual(calls.slice(0, 2).map(args => args.slice(4)), [
    ['delete', 'global', 'private_dns_specifier'], ['delete', 'global', 'private_dns_mode'],
  ]);
});

async function setup(t, original = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'cleantv-dns-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const journal = createJournal(dir);
  const dns = dnsClient(original);
  const disabled = new Set();
  const client = { ...dns.client,
    devices: async () => [{ serial, state: 'device' }],
    getprops: async () => ({ 'ro.serialno': 'TV123' }),
    resolveHomeActivity: async () => 'com.example.home',
    resolveHomeComponent: async () => 'com.example.home/.Main',
    pressHome: async () => {},
    focusedPackage: async () => 'com.example.home',
    listPackages: async (_serial, options) => options?.disabledOnly ? [...disabled] : [pkg, 'com.example.home'],
    disableUser: async (_serial, pkg) => { disabled.add(pkg); return true; },
    enableUser: async (_serial, pkg) => { disabled.delete(pkg); return true; },
  };
  dns.control.beforeWrite = async () => {
    assert.ok(await journal.readBaseline('TV123'), 'baseline exists before the mutation');
    assert.equal((await journal.read('TV123')).at(-1).status, 'pending');
    assert.equal((await journal.read('TV123')).at(-1).action, 'dns');
  };
  const presets = [{ id: 'common', match: { any: true }, packages: [{ package: pkg, risk: 'green' }] }];
  return { ...dns, client, journal, disabled, engine: createEngine({ client, journal, presets }) };
}

test('DNS baseline precedes intent and mutation; journal pending becomes ok or failed; package history ignores DNS', async t => {
  const { engine, journal, control } = await setup(t);
  const progress = [];
  assert.equal((await engine.setDns(serial, 'adguard', event => progress.push(event))).succeeded, 1);
  assert.deepEqual((await journal.read('TV123')).map(record => [record.action, record.status]), [['dns', 'pending'], ['dns', 'ok']]);
  assert.equal(progress[0].action, 'dns');
  assert.equal(progress[0].done, 1);
  assert.deepEqual(await journal.disabledByUs('TV123'), []);
  assert.deepEqual(await engine.history(serial), []);
  control.fail = true;
  assert.equal((await engine.setDns(serial, 'off')).failed, 1);
  assert.equal((await journal.read('TV123')).at(-1).status, 'failed');
  assert.equal((await journal.read('TV123')).at(-1).error, 'COMMAND_FAILED');
});

test('unlisted providers, unavailable baseline or pending journal failure prevent any DNS write', async t => {
  for (const failure of ['provider', 'baseline', 'journal']) {
    const { engine, journal, calls } = await setup(t);
    if (failure === 'baseline') journal.saveBaseline = async () => { throw new Error('disk full'); };
    if (failure === 'journal') journal.append = async () => { throw new Error('disk full'); };
    await assert.rejects(engine.setDns(serial, failure === 'provider' ? 'outside' : 'adguard'));
    assert.ok(calls.every(args => args[4] === 'get'));
  }
});

test('Restore all restores exact original DNS after repeated choices and still restores packages', async t => {
  for (const original of [{ mode: 'hostname', specifier: 'original.example.com' },
    { mode: 'opportunistic', specifier: null }, { mode: 'off', specifier: 'old.example.com' },
    { mode: 'hostname', specifier: null }, { mode: null, specifier: null }]) {
    const { engine, settings, journal, disabled } = await setup(t, original);
    await engine.setDns(serial, 'adguard');
    const baseline = await journal.readBaseline('TV123');
    await engine.setDns(serial, 'off');
    await engine.disable(serial, [pkg]);
    const progress = [];
    const result = await engine.restore(serial, 'all', event => progress.push(event));
    assert.equal(result.failed, 0);
    assert.equal(result.succeeded, 2);
    assert.deepEqual(settings, { private_dns_mode: original.mode, private_dns_specifier: original.specifier });
    assert.equal(disabled.size, 0);
    assert.deepEqual(await journal.readBaseline('TV123'), baseline);
    assert.equal(result.results.at(-1).result, 'restored');
    assert.equal(progress.at(-1).done, progress.at(-1).total);
    assert.deepEqual(await engine.history(serial).then(entries => entries.map(entry => entry.action)), ['enable', 'disable']);
  }
});

test('Restore all reports DNS failure while package restoration still succeeds', async t => {
  for (const failure of ['command', 'baseline', 'unsafe-baseline']) {
    const { engine, control, journal, disabled } = await setup(t);
    await engine.setDns(serial, 'adguard');
    await engine.disable(serial, [pkg]);
    if (failure === 'command') control.fail = true;
    if (failure === 'baseline') journal.readBaseline = async () => { throw new Error('unreadable'); };
    if (failure === 'unsafe-baseline') journal.readBaseline = async () => ({ disabledBefore: [],
      settings: { 'global/private_dns_mode': 'hostname', 'global/private_dns_specifier': 'bad;input' } });
    const result = await engine.restore(serial, 'all');
    assert.equal(result.failed, 1);
    assert.equal(result.succeeded, 1);
    assert.equal(disabled.size, 0);
    assert.equal(result.results.find(item => item.action === 'dns').result, 'failed');
  }
});

test('Restore all recovers the first DNS attempt after a partial write or a failed final journal append', async t => {
  for (const failure of ['second-write', 'final-record']) {
    const original = { mode: 'opportunistic', specifier: 'original.example.com' };
    const { engine, control, journal, settings } = await setup(t, original);
    const append = journal.append;
    if (failure === 'second-write') control.failKey = 'private_dns_mode';
    else journal.append = async (id, record) => {
      if (record.action === 'dns' && record.status === 'ok') throw new Error('disk full');
      return append(id, record);
    };
    if (failure === 'second-write') assert.equal((await engine.setDns(serial, 'adguard')).failed, 1);
    else await assert.rejects(engine.setDns(serial, 'adguard'), /disk full/);
    assert.equal(settings.private_dns_specifier, 'dns.adguard-dns.com', 'TV changed before the failure');
    assert.ok(!(await journal.read('TV123')).some(record => record.status === 'ok'));
    control.failKey = null;
    journal.append = append;
    assert.equal((await engine.restore(serial, 'all')).failed, 0);
    assert.deepEqual(settings, { private_dns_mode: original.mode, private_dns_specifier: original.specifier });
  }
});

test('DNS records never pollute the late baseline touched-package set or targeted package restore', async t => {
  const { engine, journal, settings, calls, disabled } = await setup(t);
  disabled.add(pkg);
  await journal.append('TV123', { at: 'today', action: 'dns', status: 'ok', package: pkg, provider: 'off' });
  await engine.disable(serial, [pkg]);
  assert.deepEqual((await journal.readBaseline('TV123')).disabledBefore, [pkg]);
  const before = calls.length;
  await engine.restore(serial, [pkg]);
  assert.equal(calls.length, before);
  assert.equal(settings.private_dns_mode, 'opportunistic');
  assert.deepEqual(await journal.disabledByUs('TV123'), []);
});

test('a lost baseline after a DNS write never records the changed DNS as original or writes a guess', async t => {
  const { engine, journal, settings, calls, disabled } = await setup(t, privateDnsFor('adguard'));
  await journal.append('TV123', { at: new Date().toISOString(), action: 'dns', provider: 'adguard', status: 'ok' });
  assert.equal((await engine.disable(serial, [pkg])).succeeded, 1);
  const baseline = await journal.readBaseline('TV123');
  assert.equal(Object.hasOwn(baseline.settings, 'global/private_dns_mode'), false);
  assert.equal(Object.hasOwn(baseline.settings, 'global/private_dns_specifier'), false);
  await assert.rejects(engine.setDns(serial, 'off'));
  const result = await engine.restore(serial, 'all');
  assert.ok(result.results.some(item => item.package === pkg && item.result === 'enabled'));
  assert.ok(result.results.some(item => item.action === 'dns' && item.result === 'failed'));
  assert.equal(disabled.has(pkg), false);
  assert.ok(calls.every(args => args[4] === 'get'));
  assert.deepEqual(settings, { private_dns_mode: 'hostname', private_dns_specifier: 'dns.adguard-dns.com' });
});
