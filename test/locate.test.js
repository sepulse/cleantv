import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, win32, posix } from 'node:path';
import { locateAdb } from '../src/core/adb/locate.js';
import { createRunner } from '../src/core/adb/runner.js';
import { fakeRunner } from './helpers/fake-runner.js';

test('explicit ADB path wins without looking elsewhere', async () => {
  const seen = [];
  const path = await locateAdb({ env: { CLEANTV_ADB: 'C:/tools/adb.exe' }, platform: 'win32',
    exists: async value => { seen.push(value); return true; }, run: fakeRunner({}) });
  assert.equal(path, win32.resolve('C:/tools/adb.exe'));
  assert.deepEqual(seen, ['C:/tools/adb.exe']);
});

test('bundled binary is relative to repo, with platform extension', async () => {
  for (const platform of ['win32', 'linux']) {
    const expected = resolve(import.meta.dirname, '../vendor/platform-tools', platform === 'win32' ? 'adb.exe' : 'adb');
    const seen = [];
    assert.equal(await locateAdb({ env: {}, platform,
      exists: async value => { seen.push(value); return value === expected; }, run: fakeRunner({}) }), expected);
    assert.deepEqual(seen, [expected]);
  }
});

test('PATH is probed with adb version after absent files', async () => {
  const run = fakeRunner({ version: { stdout: 'Android Debug Bridge version 1.0.41' } });
  assert.equal(await locateAdb({ env: { PATH: '/tools' }, platform: 'linux',
    exists: async value => value === '/tools/adb', run }), '/tools/adb');
  assert.deepEqual(run.calls, [['version']]);
});

test('missing or unusable PATH binary becomes ADB_NOT_FOUND', async () => {
  for (const response of [{ code: 1 }, new Error('absent')]) {
    await assert.rejects(locateAdb({ env: { PATH: '/tools' }, platform: 'linux',
      exists: async value => value === '/tools/adb', run: fakeRunner({ version: response }) }), { code: 'ADB_NOT_FOUND' });
  }
});

test('PATH resolution returns an absolute hit, honors Windows PATHEXT and never runs a bare name', async () => {
  for (const platform of ['win32', 'linux']) {
    const paths = platform === 'win32' ? win32 : posix;
    const root = platform === 'win32' ? 'C:\\tools' : '/tools';
    const expected = paths.join(root, platform === 'win32' ? 'adb.EXE' : 'adb');
    const seen = [];
    const run = fakeRunner({ version: {} });
    assert.equal(await locateAdb({ platform,
      env: platform === 'win32' ? { Path: `;C:\\missing;"${root}"`, PATHEXT: '.COM;.EXE' } : { PATH: `:/missing:${root}` },
      exists: async value => { seen.push(value); return value === expected; }, run }), expected);
    assert.ok(seen.slice(1).every(value => paths.isAbsolute(value)));
    assert.deepEqual(run.calls, [['version']]);
    if (platform === 'win32') assert.ok(seen.includes(paths.join(root, 'adb.COM')));
    await assert.rejects(locateAdb({ platform, env: {}, exists: async () => false, run: async () => assert.fail('no PATH hit') }),
      { code: 'ADB_NOT_FOUND' });
  }
  await assert.rejects(createRunner('adb')(['version']), { code: 'ADB_NOT_FOUND' });
});

test('a missing explicit ADB path fails without falling through and includes the path', async () => {
  const seen = [];
  await assert.rejects(locateAdb({ env: { CLEANTV_ADB: 'missing-adb' },
    exists: async value => { seen.push(value); return false; }, run: async () => assert.fail('must not probe PATH') }),
  error => error.code === 'ADB_NOT_FOUND' && error.details.adbPath === 'missing-adb');
  assert.deepEqual(seen, ['missing-adb']);
});
