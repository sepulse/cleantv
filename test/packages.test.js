import test from 'node:test';
import assert from 'node:assert/strict';
import { getPackageStates } from '../src/core/packages.js';

test('package states include absent entries and safety decisions with two list calls', async () => {
  const calls = [];
  const entries = [
    { package: 'com.example.enabled', risk: 'green', label: { en: 'Enabled' } },
    { package: 'com.example.disabled', risk: 'yellow' },
    { package: 'com.example.absent', risk: 'green' },
    { package: 'com.android.systemui', risk: 'green' },
    { package: 'com.example.home', risk: 'green' },
    { package: 'com.example.red', risk: 'red' },
  ];
  const client = { listPackages: async (serial, options) => {
    calls.push({ serial, options });
    return options?.disabledOnly ? ['com.example.disabled'] : entries.filter(entry => !entry.package.endsWith('absent')).map(entry => entry.package);
  } };
  const states = await getPackageStates(client, '10.0.0.1:5555', new Map(entries.map(entry => [entry.package, entry])), 'com.example.home');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.options), [undefined, { disabledOnly: true }]);
  assert.deepEqual(states[0], { ...entries[0], installed: true, enabled: true, canDisable: true });
  assert.deepEqual(states[1], { ...entries[1], installed: true, enabled: false, canDisable: true });
  assert.deepEqual(states[2], { ...entries[2], installed: false, enabled: false, canDisable: false });
  assert.equal(states[3].blockedReason, 'PACKAGE_PROTECTED');
  assert.equal(states[4].blockedReason, 'PACKAGE_IS_LAUNCHER');
  assert.equal(states[5].blockedReason, 'PACKAGE_PROTECTED');
});

test('unknown HOME disables action availability without masking stronger safety reasons', async () => {
  const entries = [{ package: 'com.example.app', risk: 'green' }, { package: 'com.android.systemui', risk: 'red' }];
  const client = { listPackages: async (_, options) => options?.disabledOnly ? [] : entries.map(entry => entry.package) };
  const states = await getPackageStates(client, '10.0.0.1:5555', new Map(entries.map(entry => [entry.package, entry])), null);
  assert.ok(states.every(entry => !entry.canDisable));
  assert.equal(states[0].blockedReason, 'COMMAND_FAILED');
  assert.equal(states[1].blockedReason, 'PACKAGE_PROTECTED');
});
