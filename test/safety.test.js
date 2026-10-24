import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCanDisable, canDisable, isValidPackageName, isValidSerial, NEVER_TOUCH } from '../src/core/safety.js';
import { CleanTvError } from '../src/core/errors.js';
import { loadPresets } from '../src/core/registry.js';
import { fileURLToPath } from 'node:url';

const addedProtected = [
  'com.google.android.ext.services', 'com.google.android.ext.shared', 'com.android.ext.services',
  'com.android.ext.shared', 'com.google.android.modulemetadata', 'com.android.devicelockcontroller',
  'com.cvte.tv.hkcfac', 'com.cvte.tv.fac.menu', 'mediatek.factorymenu.ui', 'com.tcl.cyberui',
  'com.tcl.providers.config', 'com.tcl.system.server', 'com.tcl.factory.view', 'com.tianci.movieplatform',
  'com.sony.dtv.b2b.hotelmode', 'com.droidlogic.tvinput', 'org.droidtv.eum', 'org.droidtv.aurora',
  'org.droidtv.xtv', 'com.amazon.imp', 'com.amazon.tv.oobe',
];
const addedPrefixes = ['com.google.android.overlay.modules', 'com.mediatek.', 'com.at.factory.', 'com.jamdeo.tv.'];

test('disable rejects every risk except exact green or yellow before the launcher guard', () => {
  for (const risk of [undefined, null, '', 'GREEN', 'Yellow', 'blue', 0, {}, ['green']]) {
    assert.throws(() => assertCanDisable('com.example.app', {
      entry: { risk }, homePackage: 'com.example.app',
    }), { code: 'PACKAGE_PROTECTED' });
  }
});

test('package names use the architecture regex and length limit', () => {
  for (const pkg of ['com.example.app', 'A.b_1', 'a.0', `a.${'b'.repeat(253)}`]) assert.ok(isValidPackageName(pkg), pkg);
  for (const pkg of [null, 4, '', 'android', 'com..app', '.com.app', '1com.app', 'com.app;', 'com.app\n', `a.${'b'.repeat(254)}`]) {
    assert.equal(isValidPackageName(pkg), false, String(pkg));
  }
});

test('serial requires bounded IPv4 octets and port', () => {
  for (const serial of ['0.0.0.0:1', '255.255.255.255:65535', '192.168.0.8:5555']) assert.ok(isValidSerial(serial));
  for (const serial of [undefined, '256.1.1.1:5555', '1.2.3:5555', '1.2.3.4:0', '1.2.3.4:65536',
    '1.2.3.4:-1', '1.2.3.4:5.5', 'host:5555', '1.2.3.4:5555\n', '1.2.3.4:5555;id']) assert.equal(isValidSerial(serial), false);
});

test('NEVER_TOUCH is a frozen Set with core protections and immutable methods', () => {
  assert.ok(NEVER_TOUCH instanceof Set);
  assert.ok(Object.isFrozen(NEVER_TOUCH));
  const expected = ['android', 'com.android.systemui', 'com.android.settings', 'com.android.tv.settings',
    'com.android.vending', 'com.google.android.gms', 'com.google.android.gsf', 'com.android.packageinstaller',
    'com.google.android.packageinstaller', 'com.android.permissioncontroller', 'com.google.android.permissioncontroller',
    'com.android.shell', 'com.android.bluetooth', 'com.android.providers.settings', 'com.android.providers.media',
    'com.android.providers.downloads', 'com.android.providers.contacts', 'com.android.webview', 'com.google.android.webview',
    'com.android.inputmethod.latin', 'com.google.android.inputmethod.latin', 'com.google.android.leanback.ime',
    'com.google.android.tvlauncher', 'com.google.android.apps.tv.launcherx', 'com.google.android.tungsten.setupwraith',
    'com.google.android.tv.remote.service', 'com.android.networkstack', 'com.google.android.networkstack',
    'com.android.wifi.resources', 'com.android.phone', 'com.android.keychain'];
  for (const pkg of expected) assert.ok(NEVER_TOUCH.has(pkg), pkg);
  assert.throws(() => NEVER_TOUCH.add('com.example.app'), TypeError);
  assert.throws(() => NEVER_TOUCH.delete('com.android.systemui'), TypeError);
  assert.throws(() => NEVER_TOUCH.clear(), TypeError);
});

test('disable guards run in the required order and wrapper reports each code', () => {
  const cases = [
    ['android', { entry: { risk: 'red' }, homePackage: 'android' }, 'INVALID_INPUT'],
    ['com.android.systemui', { homePackage: 'com.android.systemui' }, 'PACKAGE_PROTECTED'],
    ['com.android.providers.newprovider', {}, 'PACKAGE_PROTECTED'],
    ['com.example.app', { homePackage: 'com.example.app' }, 'PACKAGE_NOT_IN_REGISTRY'],
    ['com.example.app', { entry: { risk: 'red' }, homePackage: 'com.example.app' }, 'PACKAGE_PROTECTED'],
    ['com.example.app', { entry: { risk: 'yellow' }, homePackage: 'com.example.app' }, 'PACKAGE_IS_LAUNCHER'],
  ];
  for (const [pkg, context, code] of cases) {
    assert.throws(() => assertCanDisable(pkg, context), error => error instanceof CleanTvError && error.code === code);
    assert.deepEqual(canDisable(pkg, context), { ok: false, reason: code });
  }
  for (const risk of ['green', 'yellow']) {
    assert.doesNotThrow(() => assertCanDisable('com.example.app', { entry: { risk } }));
    assert.deepEqual(canDisable('com.example.app', { entry: { risk } }), { ok: true });
  }
});

test('new upstream protected packages and prefixes override a green registry entry', () => {
  for (const pkg of addedProtected) {
    assert.ok(NEVER_TOUCH.has(pkg), pkg);
    assert.deepEqual(canDisable(pkg, { entry: { risk: 'green' } }), { ok: false, reason: 'PACKAGE_PROTECTED' });
  }
  for (const pkg of addedPrefixes.map(prefix => `${prefix}example`)) {
    assert.deepEqual(canDisable(pkg, { entry: { risk: 'green' } }), { ok: false, reason: 'PACKAGE_PROTECTED' });
  }
});

test('new protected names do not collide with any preset entry', async () => {
  const presets = await loadPresets(fileURLToPath(new URL('../presets/', import.meta.url)));
  const entries = presets.flatMap(preset => preset.packages.map(entry => entry.package));
  for (const pkg of entries) {
    assert.ok(!addedProtected.includes(pkg) && !addedPrefixes.some(prefix => pkg.startsWith(prefix)), pkg);
  }
});
