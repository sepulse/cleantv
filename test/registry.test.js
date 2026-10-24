import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildEntryIndex, loadPresets, matchPresets, validatePreset } from '../src/core/registry.js';

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

test('real common preset validates, contains 5–10 unverified entries with empty Malay strings', async () => {
  const presets = await loadPresets(resolve(import.meta.dirname, '../presets'));
  assert.equal(presets.length, 1);
  assert.equal(presets[0].id, 'common-android-tv');
  assert.deepEqual(presets[0].match, { any: true });
  assert.ok(presets[0].packages.length >= 5 && presets[0].packages.length <= 10);
  for (const entry of presets[0].packages) {
    assert.equal(entry.verified, false);
    for (const field of ['label', 'description', 'effect']) assert.equal(entry[field].ms, '');
    assert.ok(entry.sources.length);
  }
});
