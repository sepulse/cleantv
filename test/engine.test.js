import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAdbClient } from '../src/core/adb/client.js';
import { createEngine } from '../src/core/engine.js';
import { createJournal } from '../src/core/journal.js';
import { CleanTvError } from '../src/core/errors.js';
import { fakeRunner } from './helpers/fake-runner.js';

const serial = '192.168.1.5:5555';
const entries = ['com.example.good', 'com.example.bad', 'com.example.mismatch', 'com.example.home', 'com.android.systemui', 'com.example.red']
  .map(pkg => ({ package: pkg, risk: pkg.endsWith('.red') ? 'red' : 'green', category: 'bloat' }));
const presets = [{ id: 'common', match: { any: true }, packages: entries }];

async function setup(t, { disabled = [], installed = entries.map(e => e.package), failure, mismatch } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'cleantv-engine-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const journal = createJournal(dir);
  const commands = [];
  const disabledSet = new Set(disabled);
  const client = {
    getprops: async () => ({ 'ro.serialno': 'TV123', 'ro.product.brand': 'Example', 'ro.product.model': 'TV' }),
    resolveHomeActivity: async () => 'com.example.home',
    listPackages: async (s, options) => {
      assert.equal(s, serial);
      commands.push(options?.disabledOnly ? 'list-disabled' : 'list');
      return options?.disabledOnly ? [...disabledSet] : installed;
    },
    disableUser: async (s, pkg) => {
      assert.equal(s, serial);
      assert.equal((await journal.read('TV123')).at(-1).status, 'pending');
      assert.equal((await journal.read('TV123')).at(-1).package, pkg);
      commands.push(`disable:${pkg}`);
      if (pkg === failure) throw new CleanTvError('COMMAND_FAILED');
      if (pkg !== mismatch) disabledSet.add(pkg);
      return true;
    },
    enableUser: async (s, pkg) => {
      assert.equal(s, serial);
      assert.equal((await journal.read('TV123')).at(-1).status, 'pending');
      commands.push(`enable:${pkg}`);
      if (pkg === failure) return false;
      if (pkg !== mismatch) disabledSet.delete(pkg);
      return true;
    },
  };
  return { engine: createEngine({ client, journal, presets }), client, journal, commands, disabledSet, dir };
}

test('inspect composes real client parsers, device info, matching and states without duplicate reads', async () => {
  const prefix = `-s ${serial} shell`;
  const run = fakeRunner({
    [`${prefix} getprop`]: { stdout: '[ro.serialno]: [TV123]\r\n[ro.product.brand]: [Brand]\r\n' },
    [`${prefix} cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME`]: { stdout: 'com.example.home/.Main\r\n' },
    [`${prefix} pm list packages --user 0`]: { stdout: 'package:com.example.good\r\npackage:com.google.android.apps.tv.launcherx\r\n' },
    [`${prefix} pm list packages --user 0 -d`]: { stdout: 'package:com.example.good\r\n' },
  });
  const inspection = await createEngine({ client: createAdbClient(run), presets }).inspect(serial);
  assert.equal(inspection.info.deviceId, 'TV123');
  assert.equal(inspection.info.isGoogleTv, true);
  assert.deepEqual(inspection.presets, ['common']);
  assert.equal(inspection.packages.length, entries.length);
  assert.equal(inspection.packages[0].enabled, false);
  assert.equal(inspection.packages[1].installed, false);
  assert.equal(run.calls.filter(args => args.includes('packages')).length, 2);
});

test('disable sequentially journals, verifies, skips blocked entries and continues after failures', async t => {
  const { engine, journal, commands } = await setup(t, { failure: 'com.example.bad', mismatch: 'com.example.mismatch' });
  const progress = [];
  const pkgs = ['bad;input', 'com.android.systemui', 'com.example.unknown', 'com.example.red', 'com.example.home',
    'com.example.bad', 'com.example.mismatch', 'com.example.good'];
  const result = await engine.disable(serial, pkgs, item => progress.push(item));
  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 2);
  assert.equal(result.skipped, 5);
  assert.deepEqual(result.results.map(item => item.reason), ['INVALID_INPUT', 'PACKAGE_PROTECTED', 'PACKAGE_NOT_IN_REGISTRY',
    'PACKAGE_PROTECTED', 'PACKAGE_IS_LAUNCHER', 'COMMAND_FAILED', 'COMMAND_FAILED', undefined]);
  assert.deepEqual(progress, result.results.map((item, i) => ({ done: i + 1, total: pkgs.length, ...item })));
  assert.equal(result.results.at(-1).result, 'disabled');
  assert.deepEqual(commands.filter(command => command.startsWith('disable:')), ['disable:com.example.bad', 'disable:com.example.mismatch', 'disable:com.example.good']);
  const records = await journal.read('TV123');
  assert.deepEqual(records.map(entry => entry.status), ['pending', 'failed', 'pending', 'failed', 'pending', 'ok']);
  assert.deepEqual(await journal.disabledByUs('TV123'), ['com.example.good']);
  assert.equal(records[1].error, 'COMMAND_FAILED');
  assert.ok(records.every(entry => !Number.isNaN(Date.parse(entry.at))));
  assert.deepEqual(commands.slice(-3), ['disable:com.example.good', 'list', 'list-disabled']);
});

test('restore all is journal union registry-disabled, deduplicated and permits red or unknown journal packages', async t => {
  const { engine, journal, commands } = await setup(t, { disabled: ['com.example.good', 'com.example.red', 'com.example.outside', 'com.example.untracked'],
    installed: [...entries.map(e => e.package), 'com.example.outside', 'com.example.untracked'] });
  for (const pkg of ['com.example.good', 'com.example.outside']) {
    await journal.append('TV123', { at: new Date().toISOString(), action: 'disable', package: pkg, status: 'ok' });
  }
  const progress = [];
  const result = await engine.restore(serial, 'all', item => progress.push(item));
  assert.deepEqual(result.results.map(item => item.package).sort(), ['com.example.good', 'com.example.red', 'com.example.outside'].sort());
  assert.equal(result.succeeded, 3);
  assert.equal(result.failed, 0);
  assert.equal(result.skipped, 0);
  assert.ok(result.results.every(item => item.result === 'enabled'));
  assert.equal(progress.at(-1).done, 3);
  assert.deepEqual(await journal.disabledByUs('TV123'), []);
  assert.ok(!commands.includes('enable:com.example.untracked'));
});

test('restore all works with an empty journal', async t => {
  const { engine } = await setup(t, { disabled: ['com.example.good'] });
  const result = await engine.restore(serial, 'all');
  assert.equal(result.succeeded, 1);
  assert.equal(result.results[0].package, 'com.example.good');
});

test('restore all falls back on corrupt history without overwriting it or weakening other actions', async t => {
  for (const contents of ['', '[{', '{}', 'null', '"history"']) {
    const { client, journal, dir, commands, disabledSet } = await setup(t, {
      disabled: ['com.example.good', 'com.example.untracked'],
      installed: [...entries.map(e => e.package), 'com.example.untracked'],
    });
    const file = join(dir, 'TV123.json');
    await writeFile(file, contents);
    await assert.rejects(journal.append('TV123', { action: 'enable', package: 'com.example.good', status: 'pending' }));
    client.enableUser = async (s, pkg) => {
      assert.equal(s, serial);
      commands.push(`enable:${pkg}`);
      disabledSet.delete(pkg);
      return true;
    };
    const engine = createEngine({ client, journal, presets });
    const result = await engine.restore(serial, 'all');
    assert.deepEqual(result.results, [{ package: 'com.example.good', result: 'enabled' }]);
    assert.equal(result.succeeded, 1);
    assert.deepEqual(commands.filter(command => command.startsWith('enable:')), ['enable:com.example.good']);
    await assert.rejects(engine.restore(serial, ['com.example.good']));
    await assert.rejects(engine.disable(serial, ['com.example.good']));
    assert.equal(await readFile(file, 'utf8'), contents);
  }
});

test('restore validates only L2 and verifies command markers and actual state', async t => {
  const { engine } = await setup(t, { disabled: ['com.example.bad', 'com.example.mismatch', 'com.android.systemui'],
    failure: 'com.example.bad', mismatch: 'com.example.mismatch' });
  const result = await engine.restore(serial, ['bad;input', 'com.example.bad', 'com.example.mismatch', 'com.android.systemui']);
  assert.deepEqual(result.results.map(item => item.result), ['skipped', 'failed', 'failed', 'enabled']);
  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 2);
  assert.equal(result.skipped, 1);
});

test('a missing package cannot pass enable verification merely because it is not disabled', async t => {
  const { engine } = await setup(t);
  const result = await engine.restore(serial, ['com.example.absent']);
  assert.equal(result.failed, 1);
  assert.equal(result.results[0].reason, 'COMMAND_FAILED');
});

test('journal pending failure prevents the action from reaching the device', async t => {
  const { client, commands } = await setup(t);
  const engine = createEngine({ client, presets, journal: { append: async () => { throw new Error('disk full'); } } });
  await assert.rejects(engine.disable(serial, ['com.example.good']), /disk full/);
  assert.ok(!commands.some(command => command.startsWith('disable:')));
});

test('disable fails closed if HOME is unknown, while inspection and restore remain available', async t => {
  const { client, journal, commands } = await setup(t);
  client.resolveHomeActivity = async () => null;
  const engine = createEngine({ client, journal, presets });
  await assert.rejects(engine.disable(serial, ['com.example.home']), { code: 'COMMAND_FAILED' });
  assert.deepEqual(await journal.read('TV123'), []);
  assert.ok(!commands.some(command => command.startsWith('disable:')));
  const inspection = await engine.inspect(serial);
  assert.equal(inspection.info.homePackage, null);
  assert.ok(inspection.packages.every(entry => !entry.canDisable));
  assert.equal(inspection.packages[0].blockedReason, 'COMMAND_FAILED');
  assert.equal((await engine.restore(serial, ['com.example.good'])).succeeded, 1);
});

test('invalid serial and package collection are rejected', async t => {
  const { engine } = await setup(t);
  await assert.rejects(engine.inspect('host:5555'), { code: 'INVALID_INPUT' });
  assert.throws(() => engine.disable(serial, 'all'), { code: 'INVALID_INPUT' });
  await assert.rejects(engine.restore(serial, null), { code: 'INVALID_INPUT' });
});
