import test from 'node:test';
import assert from 'node:assert/strict';
import { getDeviceInfo } from '../src/core/device.js';

const serial = '192.168.1.2:5555';
function clientFor(props, packages = []) {
  return {
    getprops: async value => { assert.equal(value, serial); return props; },
    listPackages: async value => { assert.equal(value, serial); return packages; },
    resolveHomeActivity: async () => 'com.example.home',
  };
}

test('placeholder serials fall back through boot serial to device details', async () => {
  for (const value of ['', '  ', 'unknown', 'UnKnOwN', '0123456789ABCDEF', '0123456789abcdef', 'null', 'NULL', '0', '00000000']) {
    const props = { 'ro.serialno': value, 'ro.boot.serialno': 'boot123',
      'ro.product.manufacturer': 'Maker', 'ro.product.model': 'TV' };
    assert.equal((await getDeviceInfo(clientFor(props), serial)).deviceId, 'boot123');
    props['ro.boot.serialno'] = value;
    assert.equal((await getDeviceInfo(clientFor(props), serial)).deviceId, 'Maker-TV-192.168.1.2_5555');
  }
});

test('device info uses hardware ID, numeric SDK and installed Google TV launcher', async () => {
  const client = clientFor({ 'ro.serialno': 'TV/123:abc', 'ro.boot.serialno': 'backup',
    'ro.product.brand': 'Brand', 'ro.product.manufacturer': 'Maker', 'ro.product.model': 'Model A',
    'ro.build.version.release': '12', 'ro.build.version.sdk': '31' }, ['com.google.android.apps.tv.launcherx']);
  assert.deepEqual(await getDeviceInfo(client, serial), { serial, deviceId: 'TV_123_abc', brand: 'Brand',
    manufacturer: 'Maker', model: 'Model A', androidVersion: '12', sdk: 31, isGoogleTv: true, homePackage: 'com.example.home' });
});

test('device ID falls back to boot serial then manufacturer-model-serial', async () => {
  assert.equal((await getDeviceInfo(clientFor({ 'ro.serialno': '  ', 'ro.boot.serialno': 'boot123' }), serial)).deviceId, 'boot123');
  const info = await getDeviceInfo(clientFor({ 'ro.product.manufacturer': 'A/B', 'ro.product.model': 'Room TV' }), serial);
  assert.equal(info.deviceId, 'A_B-Room_TV-192.168.1.2_5555');
  assert.equal(info.isGoogleTv, false);
  assert.equal(info.sdk, 0);
  assert.equal(info.brand, '');
});

test('supplied package list prevents another list command, including an empty list', async () => {
  const client = clientFor({});
  client.listPackages = async () => { assert.fail('package list must be reused'); };
  assert.equal((await getDeviceInfo(client, serial, ['com.google.android.apps.tv.launcherx'])).isGoogleTv, true);
  assert.equal((await getDeviceInfo(client, serial, [])).isGoogleTv, false);
});
