import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createDemoClient, scanDemo } from '../src/server/demo-client.js';
import { createEngine } from '../src/core/engine.js';
import { createJournal } from '../src/core/journal.js';
import { loadPresets } from '../src/core/registry.js';
import { NEVER_TOUCH } from '../src/core/safety.js';
import { createAppServer } from '../src/server/index.js';
import { REPLACEMENT_LAUNCHERS } from '../src/core/launchers.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const read = path => readFile(join(publicDir, path), 'utf8');
async function files(dir) {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
}
const keys = value => Object.entries(value).flatMap(([key, item]) => typeof item === 'object'
  ? keys(item).map(child => `${key}.${child}`) : [key]);

test('language catalogs have identical keys and placeholder sets', async () => {
  const en = JSON.parse(await read('i18n/en.json'));
  const ms = JSON.parse(await read('i18n/ms.json'));
  assert.deepEqual(keys(en).sort(), keys(ms).sort());
  const placeholders = value => [...new Set([...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]))].sort();
  for (const key of keys(en)) assert.deepEqual(placeholders(en[key]), placeholders(ms[key]), key);
  assert.ok(Object.values(en).every(value => typeof value === 'string' && value.trim()));
  const pendingMalay = new Set(['choose.reenabledTitle', 'choose.disableAgain',
    ...keys(en).filter(key => key.startsWith('dns.') || key.startsWith('closeAdb.')), 'result.configured', 'result.restored']);
  assert.ok(Object.entries(ms).every(([key, value]) => typeof value === 'string' && (value.trim() || pendingMalay.has(key))));
});

test('all literal translation keys and dynamic key families exist', async () => {
  const en = JSON.parse(await read('i18n/en.json'));
  for (const path of await files(join(publicDir, 'js'))) {
    const source = await readFile(path, 'utf8');
    for (const match of source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) assert.ok(Object.hasOwn(en, match[1]), `${path}: ${match[1]}`);
    for (const match of source.matchAll(/\bt\(`([^`]+)`/g)) {
      const pattern = new RegExp(`^${match[1].replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\\$\{[^}]+\}/g, '.+?')}$`);
      assert.ok(Object.keys(en).some(key => pattern.test(key)), `${path}: ${match[1]}`);
    }
  }
  for (const code of ['ADB_NOT_FOUND', 'INVALID_INPUT', 'NOT_FOUND', 'DEVICE_UNREACHABLE', 'DEVICE_UNAUTHORIZED',
    'DEVICE_OFFLINE', 'DEVICE_BUSY', 'PACKAGE_PROTECTED', 'PACKAGE_NOT_IN_REGISTRY', 'PACKAGE_IS_LAUNCHER',
    'COMMAND_FAILED', 'TIMEOUT', 'FORBIDDEN', 'INTERNAL']) assert.ok(en[`error.${code}`], code);
});

test('translation selects singular centrally for numeric one, including progress totals', async t => {
  const saved = { fetch: globalThis.fetch, document: globalThis.document, localStorage: globalThis.localStorage };
  const catalogs = Object.fromEntries(await Promise.all(['en', 'ms'].map(async lang => [lang, JSON.parse(await read(`i18n/${lang}.json`))])));
  globalThis.fetch = async path => ({ ok: true, json: async () => catalogs[path.includes('/en.') ? 'en' : 'ms'] });
  globalThis.document = { documentElement: {} };
  globalThis.localStorage = { getItem: () => 'en', setItem: () => {} };
  t.after(() => Object.assign(globalThis, saved));
  const { initI18n, t: translate, setLanguage } = await import('../public/js/i18n.js');
  await initI18n();
  setLanguage('ms');
  assert.equal(translate('choose.clean', { n: 1 }), catalogs.ms['choose.clean.one'].replace('{n}', '1'));
  assert.equal(translate('choose.reenabledTitle'), catalogs.ms['choose.reenabledTitle']);
  assert.equal(translate('dns.warning'), catalogs.ms['dns.warning']);
  catalogs.ms['dns.warning'] = '';
  assert.equal(translate('dns.warning'), catalogs.en['dns.warning']);
  for (const lang of ['en']) {
    setLanguage(lang);
    assert.equal(translate('choose.clean', { n: 1 }), 'Clean 1 app');
    assert.equal(translate('choose.clean', { n: 0 }), 'Clean 0 apps');
    assert.equal(translate('choose.clean', { n: 2 }), 'Clean 2 apps');
    assert.equal(translate('choose.clean', { n: '1' }), 'Clean 1 apps');
    assert.match(translate('confirm.body', { n: 1 }), /1 app\./);
    assert.equal(translate('progress.count', { done: 1, total: 1 }), '1 of 1 app');
    assert.equal(translate('progress.count', { done: 1, total: 2 }), '1 of 2 apps');
  }
});

test('frontend has no unsafe HTML sinks, remote URLs, or inline script bodies', async () => {
  for (const path of [...await files(join(publicDir, 'js')), ...await files(join(publicDir, 'css'))]) {
    const source = await readFile(path, 'utf8');
    assert.doesNotMatch(source, /https?:\/\//i, path);
    if (path.endsWith('.js')) {
      // No HTML assignment at all is a stronger guarantee than literal-only assignment.
      assert.doesNotMatch(source, /\binnerHTML\s*=/, path);
      assert.doesNotMatch(source, /insertAdjacentHTML|document\.write\s*\(/, path);
    }
  }
  const html = await read('index.html');
  assert.match(html, /name="cleantv-token" content="\{\{CLEANTV_TOKEN\}\}"/);
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    assert.match(script[1], /\bsrc=/);
    assert.equal(script[2].trim(), '');
  }
  assert.doesNotMatch(html, /\son\w+\s*=/i);
});

test('bundled font is WOFF2 with the official OFL license', async () => {
  const font = await readFile(join(publicDir, 'fonts/PlusJakartaSans.woff2'));
  assert.equal(font.subarray(0, 4).toString(), 'wOF2');
  assert.match(await read('fonts/OFL.txt'), /SIL OPEN FONT LICENSE Version 1.1/);
});

test('SSE helper closes completed, failed, and interrupted streams', async t => {
  const original = globalThis.EventSource;
  const instances = [];
  globalThis.EventSource = class {
    handlers = {};
    closed = false;
    constructor(url) { this.url = url; instances.push(this); }
    addEventListener(type, fn) { this.handlers[type] = fn; }
    close() { this.closed = true; }
  };
  t.after(() => { globalThis.EventSource = original; });
  const { jobEvents } = await import('../public/js/api.js');
  const seen = [];
  const callbacks = { progress: data => seen.push(data), complete: data => seen.push(data), error: data => seen.push(data) };
  jobEvents('test', callbacks);
  instances[0].handlers.progress({ data: '{"done":1}' });
  assert.equal(instances[0].closed, false);
  instances[0].handlers.complete({ data: '{"succeeded":1}' });
  assert.equal(instances[0].closed, true);
  jobEvents('failed', callbacks);
  instances[1].handlers.error({ data: '{"code":"TIMEOUT"}' });
  assert.equal(instances[1].closed, true);
  assert.equal(seen.at(-1).code, 'TIMEOUT');
  jobEvents('interrupted', callbacks);
  instances[2].handlers.error({});
  assert.equal(instances[2].closed, true);
  assert.equal(seen.at(-1).code, 'JOB_CONNECTION_LOST');
});

test('demo supports discovery, authorization, cleaning, history, and restore through HTTP', async t => {
  const presets = await loadPresets(fileURLToPath(new URL('../presets/', import.meta.url)));
  const client = createDemoClient(presets);
  const dir = await mkdtemp(join(tmpdir(), 'cleantv-test-demo-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const journal = createJournal(dir);
  const engine = createEngine({ client, presets, journal });
  const server = createAppServer({ client, engine, journal, scan: scanDemo, publicDir, token: 'demo-test', demo: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body) => {
    const response = await fetch(base + path, body === undefined ? { headers: { 'X-CleanTV-Token': 'demo-test' } } : { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CleanTV-Token': 'demo-test' }, body: JSON.stringify(body) });
    assert.ok(response.ok, path);
    return response;
  };
  assert.equal((await (await request('/api/health')).json()).demo, true);
  const { candidates } = await (await request('/api/discover', {})).json();
  assert.deepEqual(candidates, [{ ip: '192.168.1.50', port: 5555 }]);
  for (const state of ['unauthorized', 'unauthorized', 'device']) {
    assert.equal((await (await request('/api/devices/connect', candidates[0])).json()).state, state);
  }
  const serial = '192.168.1.50:5555';
  const device = `/api/devices/${encodeURIComponent(serial)}`;
  const info = await (await request(device)).json();
  assert.equal(info.model, 'Chromecast');
  assert.equal(info.sdk, 34);
  const installed = new Set(await client.listPackages(serial));
  for (const pkg of [[...NEVER_TOUCH].filter(item => !item.startsWith('com.cvte.')),
    presets.filter(p => ['common-android-tv', 'google-tv'].includes(p.id)).flatMap(p => p.packages.map(e => e.package))].flat()) assert.ok(installed.has(pkg));
  const { packages } = await (await request(`${device}/packages`)).json();
  const pkg = packages.find(entry => entry.canDisable && entry.enabled).package;
  const clean = await (await request(`${device}/disable`, { packages: [pkg] })).json();
  assert.match(await (await request(`/api/jobs/${clean.jobId}/events`)).text(), /"result":"disabled"/);
  const baseline = await journal.readBaseline('CLEANTV_DEMO');
  assert.deepEqual(baseline.disabledBefore, []);
  assert.deepEqual(baseline.settings, await client.getSettings(serial));
  assert.equal(Object.keys(baseline.settings).length, 6);
  assert.equal(baseline.homeComponent, `${info.homePackage}/.HomeActivity`);
  assert.ok((await client.listPackages(serial, { disabledOnly: true })).includes(pkg));
  const { entries } = await (await request(`${device}/history`)).json();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].result, 'disabled');
  await request(`${device}/disconnect`, {});
  for (const state of ['unauthorized', 'unauthorized', 'device']) {
    assert.equal((await (await request('/api/devices/connect', candidates[0])).json()).state, state);
  }
  for (const suffix of ['', '/packages']) {
    assert.deepEqual((await (await request(device + suffix)).json()).reenabled, [pkg]);
  }
  assert.deepEqual(await client.listPackages(serial, { disabledOnly: true }), [], 'inspection never disables the demo app again');
  const disableAgain = await (await request(`${device}/disable`, { packages: [pkg] })).json();
  assert.match(await (await request(`/api/jobs/${disableAgain.jobId}/events`)).text(), /"result":"disabled"/);
  assert.ok(!Object.hasOwn(await (await request(`${device}/packages`)).json(), 'reenabled'));
  const restore = await (await request(`${device}/restore`, { all: true })).json();
  assert.match(await (await request(`/api/jobs/${restore.jobId}/events`)).text(), /"result":"enabled"/);
  assert.deepEqual(await client.listPackages(serial, { disabledOnly: true }), []);
  const launcher = `${device}/launcher`;
  const status = async () => (await request(launcher)).json();
  const replacement = 'com.spocky.projengmenu';
  const initial = await status();
  assert.deepEqual(initial.replacement, { ...REPLACEMENT_LAUNCHERS[0], installed: false, enabled: false, isHomeCandidate: false });
  assert.deepEqual(initial.replacements, REPLACEMENT_LAUNCHERS.map(entry => ({ ...entry, installed: false, enabled: false, isHomeCandidate: false })));
  const eventsFor = async (path, body) => {
    const response = await request(path, body);
    assert.equal(response.status, 202);
    return (await request(`/api/jobs/${(await response.json()).jobId}/events`)).text();
  };
  assert.match(await eventsFor(`${device}/dns`, { provider: 'adguard' }), /"result":"configured"/);
  assert.equal((await client.getSettings(serial))['global/private_dns_specifier'], 'dns.adguard-dns.com');
  assert.match(await eventsFor(`${device}/dns`, { provider: 'off' }), /"failed":0/);
  assert.equal((await client.getSettings(serial))['global/private_dns_mode'], 'off');
  assert.match(await eventsFor(`${device}/restore`, { all: true }), /"result":"restored"/);
  assert.deepEqual(await client.getSettings(serial), baseline.settings);
  assert.ok((await engine.history(serial)).every(entry => entry.package));
  assert.match(await eventsFor(`${launcher}/swap`, { package: replacement }), /LAUNCHER_NOT_READY/);
  for (const route of ['open-store', 'swap', 'restore']) {
    const body = route === 'restore' ? {} : { package: replacement };
    for (const headers of [
      { 'Content-Type': 'application/json' },
      { 'Content-Type': 'application/json', 'X-CleanTV-Token': 'wrong' },
      { 'X-CleanTV-Token': 'demo-test' },
      { 'Content-Type': 'application/json', 'X-CleanTV-Token': 'demo-test', Origin: 'http://evil.example' },
    ]) assert.equal((await fetch(base + `${launcher}/${route}`, { method: 'POST', headers, body: JSON.stringify(body) })).status, 403);
  }
  assert.equal((await fetch(base + '/api/devices/bad/launcher', { headers: { 'X-CleanTV-Token': 'demo-test' } })).status, 400);
  const invalid = async (suffix, body) => fetch(base + launcher + suffix, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CleanTV-Token': 'demo-test' }, body: JSON.stringify(body) });
  for (const suffix of ['/swap', '/open-store']) {
    for (const body of [{}, { package: 'com.example.other' }, { package: 'com.bad;input' }]) assert.equal((await invalid(suffix, body)).status, 400);
  }
  assert.equal((await invalid('/restore', { package: replacement })).status, 400);
  await request(`${launcher}/open-store`, { package: replacement });
  const ready = await status();
  assert.deepEqual(ready.replacement, { ...REPLACEMENT_LAUNCHERS[0], installed: true, enabled: true, isHomeCandidate: true });
  assert.equal(ready.home, initial.home);
  const swap = await request(`${launcher}/swap`, { package: replacement });
  assert.equal(swap.status, 202);
  assert.equal((await invalid('/restore', {})).status, 409);
  assert.equal((await fetch(base + `${device}/restore`, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-CleanTV-Token': 'demo-test' }, body: '{"all":true}' })).status, 409);
  assert.match(await (await request(`/api/jobs/${(await swap.json()).jobId}/events`)).text(), /"result":"switched"/);
  assert.equal((await status()).home, replacement);
  assert.match(await eventsFor(`${device}/restore`, { all: true }), /"failed":0/);
  assert.equal((await status()).home, initial.home);
  await eventsFor(`${launcher}/swap`, { package: replacement });
  assert.match(await eventsFor(`${launcher}/restore`, {}), /"failed":0/);
  assert.equal((await status()).home, initial.home);
  for (const entry of REPLACEMENT_LAUNCHERS) {
    await request(`${launcher}/open-store`, { package: entry.package });
    const selected = await (await request(`${launcher}?package=${encodeURIComponent(entry.package)}`)).json();
    assert.deepEqual(selected.replacement, { ...entry, installed: true, enabled: true, isHomeCandidate: true });
    assert.equal(selected.replacements.length, REPLACEMENT_LAUNCHERS.length);
    assert.match(await eventsFor(`${launcher}/swap`, { package: entry.package }), /"result":"switched"/);
    assert.equal((await status()).home, entry.package);
  }
  assert.match(await eventsFor(`${device}/restore`, { all: true }), /"failed":0/);
  assert.equal((await status()).home, initial.home);
  for (const path of ['/favicon.svg', '/favicon.ico']) {
    const response = await request(path);
    assert.match(response.headers.get('content-type'), /image\/svg\+xml/);
  }
  assert.deepEqual(await (await request(`${device}/close-adb`, {})).json(), { ok: true, portClosed: true });
  assert.deepEqual(await client.devices(), []);
  assert.equal((await (await request('/api/devices/connect', candidates[0])).json()).state, 'unreachable');
});
