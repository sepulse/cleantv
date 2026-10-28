import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JAKIM_STATES, isValidZone, assertZone } from '../src/core/jakim-zones.js';
import { createDemoClient } from '../src/server/demo-client.js';

const zones = JAKIM_STATES.flatMap(entry => entry.zones.map(zone => ({ ...zone, state: entry.state })));

test('zone list has JAKIM-format codes, named areas and states, and no duplicates', () => {
  assert.ok(JAKIM_STATES.length >= 14 && zones.length >= 58);
  for (const zone of zones) {
    assert.match(zone.code, /^[A-Z]{3}[0-9]{2}$/);
    assert.ok(zone.area.trim() === zone.area && zone.area.length > 2, zone.code);
    assert.doesNotMatch(zone.area, /[|<>&"]/, zone.code);
  }
  assert.equal(new Set(zones.map(zone => zone.code)).size, zones.length);
  assert.equal(new Set(JAKIM_STATES.map(entry => entry.state)).size, JAKIM_STATES.length);
  for (const entry of JAKIM_STATES) assert.equal(new Set(entry.zones.map(zone => zone.code.slice(0, 3))).size, 1, entry.state);
  assert.ok(zones.some(zone => zone.code === 'KDH01' && zone.state === 'Kedah'));
});

test('only listed zone codes are valid', () => {
  assert.ok(isValidZone('KDH01') && isValidZone('WLY02'));
  for (const bad of ['', 'kdh01', 'KDH00', 'KDH01 ', 'KDH01;reboot', 'XXX99', null, undefined, 1, {}, ['KDH01']]) {
    assert.equal(isValidZone(bad), false);
    assert.throws(() => assertZone(bad), { code: 'INVALID_INPUT' });
  }
});

test('the launcher patch lists exactly the same zones as CleanTV', async () => {
  const patch = await readFile(new URL('../launcher/patches/0001-waktu-solat.patch', import.meta.url), 'utf8');
  const listed = [...patch.matchAll(/^\+        <item>([A-Z]{3}[0-9]{2})\|(.*)\|(.*)<\/item>$/gm)]
    .map(match => [match[1], match[2].replaceAll('&amp;', '&'), match[3]]);
  assert.deepEqual(listed, zones.map(zone => [zone.code, zone.area, zone.state]));
});

test('the launcher patch asks only for INTERNET and guards its receiver', async () => {
  const patch = await readFile(new URL('../launcher/patches/0001-waktu-solat.patch', import.meta.url), 'utf8');
  const added = patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++'));
  assert.deepEqual(added.filter(line => /uses-permission/.test(line)), ['+    <uses-permission android:name="android.permission.INTERNET" />']);
  assert.match(patch, /\+            android:name="\.PrayerConfig"\n\+            android:exported="true"\n\+            android:permission="android\.permission\.WRITE_SECURE_SETTINGS" \/>/);
  assert.doesNotMatch(added.join('\n'), /ACCESS_(?:FINE|COARSE)_LOCATION|<service|RECEIVE_BOOT_COMPLETED/);
  for (const url of added.join('\n').match(/https?:\/\/[^\s"'<]+/g) ?? []) assert.match(url, /^https:\/\/www\.e-solat\.gov\.my\//);
});

test('demo TV accepts a listed zone only while CleanTV Home is installed', async () => {
  const client = createDemoClient([]);
  const serial = '192.168.1.50:5555';
  await assert.rejects(client.setPrayerZone(serial, 'KDH01'), { code: 'COMMAND_FAILED' });
  await client.installBundledLauncher(serial);
  await client.setPrayerZone(serial, 'KDH01');
  await assert.rejects(client.setPrayerZone(serial, 'nope'), { code: 'INVALID_INPUT' });
});
