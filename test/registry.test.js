import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildEntryIndex, loadPresets, matchPresets, validatePreset } from '../src/core/registry.js';
import { NEVER_TOUCH } from '../src/core/safety.js';

function preset() {
  return { id: 'test', match: { any: true }, packages: [{ package: 'com.example.app', risk: 'green', category: 'bloat',
    label: { en: 'App', ms: '' }, description: { en: 'Description', ms: '' }, effect: { en: 'Effect', ms: '' },
    sources: ['https://developer.android.com/'], verified: false }] };
}

test('valid preset passes and malformed top-level values return validation errors', () => {
  assert.deepEqual(validatePreset(preset()), { ok: true, errors: [] });
  for (const obj of [null, [], '', {}, { ...preset(), packages: null }, { ...preset(), packages: [null] }]) {
    const result = validatePreset(obj);
    assert.equal(result.ok, false);
    assert.ok(result.errors.length);
  }
});

test('registry rejects every required invalid entry case', () => {
  const cases = [
    [p => { p.packages[0].risk = 'blue'; }, /unknown risk/],
    [p => { p.packages[0].category = 'unknown'; }, /unknown category/],
    [p => { p.packages[0].package = 'bad;name'; }, /invalid package/],
    [p => { p.packages.push({ ...p.packages[0] }); }, /duplicate package/],
    [p => { p.packages[0].package = 'com.android.systemui'; }, /protected package must be red/],
    [p => { p.packages[0].package = 'com.android.providers.future'; }, /protected package must be red/],
    [p => { p.packages[0].package = 'android'; }, /protected package must be red/],
    [p => { delete p.packages[0].label.en; }, /missing label.en/],
    [p => { p.packages[0].description.en = '  '; }, /missing description.en/],
    [p => { p.packages[0].effect.en = ''; }, /missing effect.en/],
    [p => { delete p.packages[0].effect.ms; }, /missing effect.ms/],
    [p => { p.packages[0].verified = 'false'; }, /verified/],
    [p => { p.packages[0].sources = ['file:///tmp/source']; }, /sources/],
    [p => { p.match = {}; }, /Empty match/],
    [p => { p.match = { brand: [] }; }, /match.brand/],
    [p => { p.match = { manufacturer: 'maker' }; }, /match.manufacturer/],
    [p => { p.match = { feature: 'other' }; }, /match.feature/],
  ];
  for (const [mutate, expected] of cases) {
    const obj = preset(); mutate(obj);
    const result = validatePreset(obj);
    assert.equal(result.ok, false);
    assert.match(result.errors.join(';'), expected);
  }
  const protectedPreset = preset();
  Object.assign(protectedPreset.packages[0], { package: 'com.android.systemui', risk: 'red' });
  assert.equal(validatePreset(protectedPreset).ok, true);
});

test('preset matching is case-insensitive, OR within arrays and AND across fields', () => {
  const matches = [
    { id: 'all', match: { any: true } },
    { id: 'brand', match: { brand: ['other', 'BRAND'] } },
    { id: 'maker', match: { manufacturer: ['MAKER'] } },
    { id: 'google', match: { feature: 'google-tv' } },
    { id: 'both', match: { brand: ['brand'], manufacturer: ['maker'], feature: 'google-tv' } },
    { id: 'wrong', match: { brand: ['brand'], manufacturer: ['other'] } },
  ];
  const info = { brand: 'Brand', manufacturer: 'Maker', isGoogleTv: true };
  assert.deepEqual(matchPresets(matches, info).map(p => p.id), ['all', 'brand', 'maker', 'google', 'both']);
  assert.deepEqual(matchPresets(matches, { ...info, isGoogleTv: false }).map(p => p.id), ['all', 'brand', 'maker']);
});

test('strictest risk wins irrespective of preset order, equal risk keeps first', () => {
  for (const risks of [['green', 'yellow', 'red'], ['red', 'yellow', 'green'], ['yellow', 'green']]) {
    const presets = risks.map(risk => { const p = preset(); p.packages[0].risk = risk; return p; });
    assert.equal(buildEntryIndex(presets).get('com.example.app').risk, risks.includes('red') ? 'red' : 'yellow');
  }
  const first = preset(); const second = preset(); second.packages[0].label.en = 'Second';
  assert.equal(buildEntryIndex([first, second]).get('com.example.app'), first.packages[0]);
});

test('loader reports file name and validation or JSON errors', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cleantv-presets-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const invalid = preset(); invalid.packages[0].risk = 'bad';
  await writeFile(join(dir, 'bad.json'), JSON.stringify(invalid));
  await assert.rejects(loadPresets(dir), /bad.json:.*unknown risk/);
  await writeFile(join(dir, 'bad.json'), '{');
  await assert.rejects(loadPresets(dir), /bad.json:/);
  await writeFile(join(dir, 'bad.json'), JSON.stringify(preset()));
  await writeFile(join(dir, 'notes.md'), 'ignored');
  assert.equal((await loadPresets(dir)).length, 1);
});

test('real common preset validates, contains 5–10 unverified entries with Malay text', async () => {
  const presets = await loadPresets(resolve(import.meta.dirname, '../presets'));
  const common = presets.find(preset => preset.id === 'common-android-tv');
  assert.ok(common);
  assert.deepEqual(common.match, { any: true });
  assert.ok(common.packages.length >= 5 && common.packages.length <= 10);
  for (const entry of common.packages) {
    assert.equal(entry.verified, false);
    for (const field of ['label', 'description', 'effect']) assert.ok(entry[field].ms);
    assert.ok(entry.sources.length);
  }
});

test('community imports stay unverified and introduce no protected or cross-brand duplicate packages', async () => {
  const presets = await loadPresets(resolve(import.meta.dirname, '../presets'));
  const protectedPrefixes = ['com.android.providers.', 'com.google.android.overlay.modules',
    'com.mediatek.', 'com.at.factory.', 'com.jamdeo.tv.'];
  // These display-only entries predate the import; the brief requires preserving them.
  const existingProtected = new Set([
    'google-tv:com.google.android.apps.tv.launcherx',
    'google-tv:com.google.android.tungsten.setupwraith',
    'google-tv:com.google.android.tv.remote.service',
  ]);
  const brandPackages = new Map();
  for (const preset of presets) {
    for (const entry of preset.packages) {
      const context = `${preset.id}:${entry.package}`;
      if (entry.sources.some(source => source.includes('Gathin23/cleanyourtv'))) {
        assert.equal(entry.verified, false, context);
        if (existingProtected.has(context)) assert.equal(entry.risk, 'red', context);
        else {
          assert.equal(NEVER_TOUCH.has(entry.package), false, context);
          assert.equal(protectedPrefixes.some(prefix => entry.package.startsWith(prefix)), false, context);
        }
      }
      if (preset.match.brand || preset.match.manufacturer) {
        assert.ok(!brandPackages.has(entry.package), `${context} also occurs in ${brandPackages.get(entry.package)}`);
        brandPackages.set(entry.package, preset.id);
      }
    }
  }
});

test('all real presets validate and keep protected, launcher and setup packages red with HTTPS sources', async () => {
  const presets = await loadPresets(resolve(import.meta.dirname, '../presets'));
  assert.deepEqual(presets.map(preset => preset.id).sort(), [
    'android-tv', 'common-android-tv', 'google-tv', 'hisense', 'sony', 'tcl', 'xiaomi',
  ]);
  for (const preset of presets) {
    assert.deepEqual(validatePreset(preset), { ok: true, errors: [] }, preset.id);
    for (const entry of preset.packages) {
      const context = `${preset.id}: ${entry.package}`;
      if (NEVER_TOUCH.has(entry.package) || entry.package.startsWith('com.android.providers.')
        || /launcher|setup/i.test(entry.package)) {
        assert.equal(entry.risk, 'red', context);
      }
      assert.ok(entry.sources.some(source => source.startsWith('https://')), context);
    }
  }
});
