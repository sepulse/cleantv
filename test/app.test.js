import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDocument } from './helpers/dom.js';
import { REPLACEMENT_LAUNCHERS } from '../src/core/launchers.js';
import { DNS_PROVIDERS } from '../src/core/dns.js';

let generation = 0;
const serial = '192.168.1.50:5555';
const replacement = 'com.spocky.projengmenu';
const stock = 'com.google.android.apps.tv.launcherx';
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

async function application(t, { missingCatalog = false, recovered = false, manualHomePackage, needsRecovery = false, recoveryResult, failRecoveryRefresh = false, recoveryBusy = false, launcherFailures = 0, reenabled = [], packages } = {}) {
  const previous = Object.fromEntries(['document', 'Node', 'window', 'localStorage', 'fetch', 'EventSource', 'setTimeout', 'clearTimeout', 'ResizeObserver']
    .map(key => [key, globalThis[key]]));
  const { document, Node } = createDocument();
  const catalog = JSON.parse(await readFile(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
  const polls = [];
  const sources = [];
  const observers = [];
  const requests = [];
  let connects = 0;
  const ready = new Set();
  let recoveryStarted = false;
  let jobPost;
  let pagehide;
  const response = data => ({ ok: true, json: async () => data });
  Object.assign(globalThis, {
    document, Node,
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target) { this.target = target; }
      disconnect() { this.disconnected = true; }
    },
    window: { scrollTo() {}, addEventListener: (name, callback) => { if (name === 'pagehide') pagehide = callback; } },
    localStorage: { getItem: () => 'en', setItem() {} },
    setTimeout: callback => { polls.push(callback); return polls.length; }, clearTimeout() {},
    EventSource: class {
      handlers = {};
      constructor() {
        sources.push(this);
        if (recoveryResult) queueMicrotask(() => this.handlers.complete({ data: JSON.stringify(recoveryResult) }));
      }
      addEventListener(name, callback) { this.handlers[name] = callback; }
      close() { this.closed = true; }
    },
    fetch: async (path, options) => {
      requests.push({ path, options });
      if (path.startsWith('/i18n/')) return missingCatalog ? { ok: false } : response(catalog);
      if (path === '/api/health') return response({ demo: true, adb: { found: true } });
      if (path === '/api/discover') return response({ candidates: [{ ip: '192.168.1.50' }] });
      if (path === '/api/devices/connect') return response({ serial, state: ++connects <= 2 ? 'unauthorized' : 'device' });
      if (path.endsWith('/open-store')) { ready.add(JSON.parse(options.body).package); return response({ ok: true }); }
      if (path.endsWith('/launcher/recover')) {
        if (recoveryBusy) { recoveryBusy = false; return { ok: false, status: 409, json: async () => ({ error: { code: 'DEVICE_BUSY' } }) }; }
        recoveryStarted = true; needsRecovery = false; return response({ jobId: 'recovery' });
      }
      if (failRecoveryRefresh && recoveryStarted && options.method === 'GET') throw new Error('Connection dropped after recovery');
      if (path.split('?')[0].endsWith('/launcher') && launcherFailures-- > 0) {
        return { ok: false, json: async () => ({ error: { code: 'COMMAND_FAILED' } }) };
      }
      if (path.split('?')[0].endsWith('/launcher') && !options.body) return response({ home: stock,
        needsRecovery,
        replacements: REPLACEMENT_LAUNCHERS.map(entry => ({ ...entry,
          installed: ready.has(entry.package), enabled: ready.has(entry.package), isHomeCandidate: ready.has(entry.package) })),
        stock: [{ package: stock, installed: true, enabled: true }] });
      if (path.endsWith('/packages')) return response({ recovered, needsRecovery, ...(reenabled.length ? { reenabled } : {}), ...(manualHomePackage ? { manualHomePackage } : {}), packages: packages ?? [{ package: 'com.example.app', label: { en: 'Example app' },
        risk: 'green', category: 'bloat', installed: true, enabled: true, canDisable: true }] });
      if (options.body) return jobPost ? jobPost(path, options) : response({ jobId: 'test' });
      return response({ serial, brand: 'google', model: 'Chromecast', androidVersion: '14', dnsProviders: DNS_PROVIDERS });
    },
  });
  t.after(() => { pagehide?.(); Object.assign(globalThis, previous); });
  await import(`../public/js/app.js?test=${generation++}`);
  const byId = id => { const node = document.getElementById(id); assert.ok(node, id); return node; };
  const click = async id => { const node = byId(id); assert.ok(!node.disabled, `${id} disabled`); await node.listeners.click?.({ target: node }); await settle(); };
  const emit = async (name, data) => { sources.at(-1).handlers[name](data === undefined ? {} : { data: JSON.stringify(data) }); await settle(); };
  return { document, polls, sources, requests, observers, byId, click, emit,
    setReenabled: value => { reenabled = value; },
    failLauncher: () => { launcherFailures = 1; }, post: handler => { jobPost = handler; } };
}

async function connect(app) {
  await app.click('begin');
  const prepared = app.byId('prepared');
  prepared.listeners.change({ target: { checked: true } });
  await app.click('setup-next');
  await app.click('find-tv');
  await app.click('pick-0');
  const permission = app.document.root;
  const before = permission.replacements;
  await app.polls.shift()();
  assert.equal(permission.replacements, before, 'unchanged unauthorized state preserves the DOM');
  await app.polls.shift()();
  await settle();
  assert.match(app.document.root.textContent, /Google Chromecast/);
}

test('language-file failure renders a plain bilingual fallback', async t => {
  const app = await application(t, { missingCatalog: true });
  assert.match(app.document.root.textContent, /could not load its language files/);
  assert.match(app.document.root.textContent, /Muat semula/);
});

test('privacy audit is collapsed, lists localized active apps with risk pills, and never changes selection or sends requests', async t => {
  const packages = [
    { package: 'com.example.ads', category: 'ads', risk: 'green', label: { en: 'Ad service', ms: 'Iklan ujian' } },
    { package: 'com.example.telemetry', category: 'telemetry', risk: 'yellow', label: { en: 'Usage reporter' } },
    { package: 'com.example.protected', category: 'telemetry', risk: 'red', label: { en: 'Protected reporter' }, canDisable: false },
    { package: 'com.example.disabled', category: 'ads', risk: 'green', label: { en: 'Disabled ads' }, enabled: false },
    { package: 'com.example.absent', category: 'telemetry', risk: 'green', label: { en: 'Absent reporter' }, installed: false, canDisable: false },
    { package: 'com.example.other', category: 'bloat', risk: 'yellow', label: { en: 'Other app' } },
  ].map(entry => ({ installed: true, enabled: true, canDisable: true, ...entry }));
  const app = await application(t, { packages });
  await connect(app);
  const before = app.requests.length;
  const card = app.byId('privacy-audit');
  assert.equal(card.tagName, 'details');
  assert.equal(card.open, false);
  assert.match(card.querySelector('summary').textContent, /Privacy audit.*3 ad or telemetry apps/);
  const rows = card.querySelector('ul').children;
  assert.equal(rows.length, 3);
  for (const [index, risk] of ['safe', 'optional', 'protected'].entries()) {
    assert.ok(rows[index].textContent.includes(packages[index].label.en));
    assert.ok(rows[index].find(node => node.className === `pill ${risk}`));
  }
  assert.match(card.textContent, /review their effects and select available apps in the list below/);
  assert.equal(card.find(node => ['button', 'input'].includes(node.tagName)), null);
  assert.doesNotMatch(card.textContent, /Disabled ads|Absent reporter|Other app/);
  const checks = () => packages.map((_, index) => app.document.getElementById(`app-${index}`)?.checked);
  const selected = checks();
  card.open = true;
  card.listeners.toggle({ target: card });
  await app.click('language-ms');
  assert.equal(app.byId('privacy-audit').open, true, 'disclosure survives a rerender');
  assert.match(app.byId('privacy-audit').textContent, /Iklan ujian/);
  assert.doesNotMatch(app.byId('privacy-audit').textContent, /Ad service/);
  assert.deepEqual(checks(), selected);
  const showAbsent = app.byId('show-absent');
  showAbsent.listeners.change({ target: { checked: true } });
  assert.doesNotMatch(app.byId('privacy-audit').textContent, /Absent reporter/);
  assert.equal(app.requests.length, before);
});

for (const result of ['disabled', 'failed', 'skipped']) test(`Done privacy summary reflects ${result} results and restoration without extra requests`, async t => {
  const app = await application(t, { packages: [{ package: 'com.example.ads', label: { en: 'Ad service' },
    category: 'ads', risk: 'green', installed: true, enabled: true, canDisable: true }] });
  await connect(app);
  assert.match(app.byId('privacy-audit').textContent, /1 ad or telemetry app is still active/);
  await app.click('clean');
  await app.click('modal-confirm');
  const before = app.requests.length;
  await app.emit('complete', { succeeded: result === 'disabled' ? 1 : 0, failed: result === 'failed' ? 1 : 0,
    results: [{ package: 'com.example.ads', result }] });
  const card = app.byId('privacy-audit');
  assert.equal(card.tagName, 'section');
  assert.match(card.textContent, result === 'disabled' ? /No ad or telemetry apps in the supported list are active/
    : /1 ad or telemetry app is still active/);
  assert.equal(card.find(node => ['button', 'input'].includes(node.tagName)), null);
  assert.equal(app.requests.length, before);
  if (result === 'disabled') {
    await app.click('restore-done');
    await app.click('modal-confirm');
    const beforeRestore = app.requests.length;
    await app.emit('complete', { succeeded: 1, failed: 0, results: [{ package: 'com.example.ads', result: 'enabled' }] });
    assert.match(app.byId('privacy-audit').textContent, /1 ad or telemetry app is still active/);
    assert.equal(app.requests.length, beforeRestore);
  }
});

test('privacy audit shows a short positive message when no supported ad or telemetry apps are active', async t => {
  const app = await application(t);
  await connect(app);
  const card = app.byId('privacy-audit');
  assert.match(card.textContent, /No ad or telemetry apps in the supported list are active/);
  assert.equal(card.querySelector('ul'), null);
  assert.equal(card.find(node => ['button', 'input'].includes(node.tagName)), null);
});

test('DNS defaults off, selection and cancellation never write, and applying uses the confirmation and job flow', async t => {
  const app = await application(t);
  await connect(app);
  assert.equal(app.byId('dns-off').checked, true);
  assert.match(app.byId('dns-warning').textContent, /Some apps or captive Wi-Fi portals may stop working/);
  assert.match(app.byId('dns-warning').textContent, /Restore all/);
  const posts = () => app.requests.filter(request => request.path.endsWith('/dns'));
  assert.equal(posts().length, 0);
  app.byId('dns-adguard').listeners.change();
  assert.equal(app.byId('dns-adguard').checked, true);
  assert.equal(posts().length, 0);
  await app.click('dns-apply');
  assert.equal(app.byId('confirm-dialog').open, true);
  assert.match(app.byId('dialog-body').textContent, /captive Wi-Fi portals.*Restore all/);
  await app.click('modal-cancel');
  assert.equal(posts().length, 0);
  await app.click('dns-apply');
  await app.click('modal-confirm');
  assert.deepEqual(JSON.parse(posts()[0].options.body), { provider: 'adguard' });
  assert.equal(posts()[0].options.method, 'POST');
  assert.match(app.document.root.textContent, /Updating Private DNS/);
  assert.equal(app.byId('restore-header').disabled, true);
  await app.emit('progress', { done: 1, total: 1, action: 'dns', provider: 'adguard', result: 'configured' });
  assert.match(app.byId('current-app').textContent, /Ad-block Private DNS/);
  await app.emit('complete', { succeeded: 1, failed: 0, results: [{ action: 'dns', provider: 'adguard', result: 'configured' }] });
  assert.match(app.document.root.textContent, /Your DNS choice was applied/);
  assert.match(app.document.root.textContent, /DNS settings applied/);
  await app.click('back-list');
  app.byId('dns-off').listeners.change();
  await app.click('dns-apply');
  await app.click('modal-confirm');
  assert.deepEqual(JSON.parse(posts().at(-1).options.body), { provider: 'off' });
  await app.emit('complete', { succeeded: 0, failed: 1, results: [{ action: 'dns', result: 'failed', reason: 'COMMAND_FAILED' }] });
  assert.match(app.document.root.textContent, /The DNS change could not be completed/);
  assert.equal(app.byId('restore-done').disabled, false);
  await app.click('restore-done');
  await app.click('modal-confirm');
  await app.emit('complete', { succeeded: 1, failed: 0, results: [{ action: 'dns', result: 'restored' }] });
  assert.match(app.document.root.textContent, /Original DNS settings restored/);
});

for (const portClosed of [true, false, null]) test(`closing ADB requires confirmation and returns to start with portClosed=${portClosed}`, async t => {
  const app = await application(t);
  await connect(app);
  await app.click('clean');
  await app.click('modal-confirm');
  await app.emit('complete', { succeeded: 1, failed: 0, results: [{ package: 'com.example.app', result: 'disabled' }] });
  const posts = () => app.requests.filter(request => request.path.endsWith('/close-adb'));
  assert.equal(posts().length, 0);
  assert.equal(app.byId('close-adb').className, 'button');
  await app.click('close-adb');
  assert.equal(app.byId('confirm-dialog').open, true);
  assert.match(app.byId('dialog-body').textContent, /repeat the TV setup steps.*Network debugging/);
  assert.match(app.byId('dialog-body').textContent, /port stays open.*Developer options/);
  await app.click('modal-cancel');
  assert.equal(posts().length, 0);
  let finish;
  app.post(() => new Promise(resolve => { finish = resolve; }));
  await app.click('close-adb');
  const pending = app.byId('modal-confirm').listeners.click();
  await settle();
  assert.equal(app.byId('close-adb').disabled, true);
  assert.equal(app.byId('restore-header').disabled, true);
  assert.equal(app.document.getElementById('begin'), null);
  assert.equal(posts().length, 1);
  assert.equal(posts()[0].path, `/api/devices/${encodeURIComponent(serial)}/close-adb`);
  assert.equal(posts()[0].options.method, 'POST');
  assert.equal(posts()[0].options.body, '{}');
  finish({ ok: true, json: async () => ({ ok: true, portClosed }) });
  await pending;
  assert.ok(app.byId('begin'));
  assert.equal(app.document.getElementById('restore-header'), null);
  assert.equal(app.byId('close-adb-result').attributes.role, 'status');
  assert.match(app.byId('close-adb-result').textContent, portClosed === true ? /no longer reachable/
    : portClosed === false ? /still open/ : /could not confirm/);
  if (portClosed !== true) assert.match(app.byId('close-adb-result').textContent, /Turn off Network debugging in Developer options/);
  assert.ok(app.sources.at(-1).closed);
  await app.click('language-ms');
  await app.click('language-en');
  assert.ok(app.byId('close-adb-result'));
  await app.click('begin');
  assert.equal(app.byId('setup-next').disabled, true, 'TV preparation must be repeated');
});

test('a failed close-adb request keeps Done available and allows another confirmed attempt', async t => {
  const app = await application(t);
  await connect(app);
  await app.click('clean');
  await app.click('modal-confirm');
  await app.emit('complete', { succeeded: 1, failed: 0, results: [{ package: 'com.example.app', result: 'disabled' }] });
  app.post(async () => ({ ok: false, json: async () => ({ error: { code: 'DEVICE_BUSY' } }) }));
  await app.click('close-adb');
  await app.click('modal-confirm');
  assert.match(app.document.root.textContent, /still working on another action/);
  assert.equal(app.byId('close-adb').disabled, false);
  assert.ok(app.byId('restore-header'));
  assert.equal(app.document.getElementById('begin'), null);
  await app.click('close-adb');
  assert.equal(app.byId('confirm-dialog').open, true);
});

test('reenabled status lists affected apps and confirms only allowed enabled apps before a normal disable POST', async t => {
  const packages = [
    ['com.example.other', 'Other app', true, true, 'green'],
    ['com.example.again', 'Returned app', true, true, 'yellow'],
    ['com.example.blocked', 'Protected app', false, true, 'red'],
    ['com.example.disabled', 'Disabled app', true, false, 'green'],
  ].map(([pkg, label, canDisable, enabled, risk]) => ({ package: pkg, label: { en: label }, canDisable, enabled, risk, installed: true, category: 'bloat' }));
  const app = await application(t, { packages, reenabled: [...packages.slice(1).map(entry => entry.package), 'com.example.outside'] });
  await connect(app);
  const card = app.byId('reenabled-card');
  assert.equal(card.attributes.role, 'status');
  for (const entry of packages.slice(1)) assert.ok(card.textContent.includes(entry.label.en));
  assert.ok(card.textContent.includes('com.example.outside'), 'apps missing from the registry remain identifiable and unselected');
  assert.ok(!card.textContent.includes('Other app'));
  const screen = card.parentElement;
  assert.ok(screen.children.indexOf(card) < screen.children.indexOf(app.byId('category-bloat').parentElement));
  assert.equal(app.document.getElementById('confirm-dialog'), null);
  assert.equal(app.requests.filter(request => request.path.endsWith('/disable')).length, 0);
  await app.click('disable-again');
  assert.equal(app.byId('confirm-dialog').open, true);
  assert.equal(app.byId('clean').textContent, 'Clean 1 app');
  assert.deepEqual(packages.map((_, index) => app.byId(`app-${index}`).checked), [false, true, undefined, false]);
  assert.match(app.byId('dialog-body').textContent, /turn off 1 app\./);
  assert.equal(app.requests.filter(request => request.path.endsWith('/disable')).length, 0);
  await app.click('modal-cancel');
  assert.equal(app.requests.filter(request => request.path.endsWith('/disable')).length, 0);
  await app.click('disable-again');
  await app.click('modal-confirm');
  const posts = app.requests.filter(request => request.path.endsWith('/disable'));
  assert.equal(posts.length, 1);
  assert.equal(posts[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(posts[0].options.body), { packages: ['com.example.again'] });
  await app.emit('complete', { succeeded: 1, failed: 0, results: [{ package: 'com.example.again', result: 'disabled' }] });
  app.setReenabled([]);
  await app.click('back-list');
  assert.equal(app.document.getElementById('reenabled-card'), null);
});

test('reenabled status remains visible with a disabled action when no affected app is allowed', async t => {
  const app = await application(t, { reenabled: ['com.example.app'], packages: [{ package: 'com.example.app', label: { en: 'Protected app' },
    risk: 'red', category: 'bloat', installed: true, enabled: true, canDisable: false }] });
  await connect(app);
  assert.match(app.byId('reenabled-card').textContent, /Protected app/);
  assert.equal(app.byId('disable-again').disabled, true);
  assert.equal(app.requests.filter(request => request.path.endsWith('/disable')).length, 0);
});

test('launcher UI checks readiness, waits for POST, bounds rollback progress, and preserves previous result on POST failure', async t => {
  const app = await application(t);
  await connect(app);
  assert.equal(app.byId('clean').textContent, 'Clean 1 app');
  await app.click('launcher-disclosure');
  app.byId(`launcher-${replacement}`).listeners.change();
  assert.equal(app.byId('launcher-switch').disabled, true);
  await app.click('launcher-store');
  assert.equal(app.byId('launcher-switch').disabled, true, 'installation requires Check again');
  await app.click('launcher-check');
  assert.equal(app.byId('launcher-switch').disabled, false);
  await app.click('launcher-switch');
  assert.match(app.byId('dialog-body').textContent, /Restore all/);
  let finish;
  app.post(() => new Promise(resolve => { finish = resolve; }));
  const pending = app.byId('modal-confirm').listeners.click();
  await settle();
  assert.ok(app.document.getElementById('launcher-title'), 'choose remains visible until POST succeeds');
  finish({ ok: true, json: async () => ({ jobId: 'swap' }) });
  await pending;
  assert.ok(app.document.getElementById('job-progress'));
  await app.emit('progress', { done: 1, total: 1, package: stock, result: 'disabled' });
  await app.emit('progress', { done: 1, total: 1, package: replacement, result: 'failed', reason: 'LAUNCHER_SWAP_ROLLED_BACK' });
  assert.equal(app.byId('percentage').textContent, '100%');
  assert.equal(app.byId('progress-count').textContent, '1 of 1 app');
  await app.emit('complete', { succeeded: 1, failed: 0, results: [{ package: replacement, result: 'switched' }] });
  assert.match(app.document.root.textContent, /Your home screen is now Projectivy/);
  app.post(async () => ({ ok: false, json: async () => ({ error: { code: 'DEVICE_BUSY' } }) }));
  await app.click('launcher-restore-done');
  await app.click('modal-confirm');
  assert.match(app.document.root.textContent, /Your home screen is now Projectivy/);
  assert.doesNotMatch(app.document.root.textContent, /Your original home screen is back/);
  assert.match(app.document.root.textContent, /still working on another action/);
});

test('advanced launcher steps are collapsed below package groups, report recovery and reserve the bar height', async t => {
  const app = await application(t, { recovered: true });
  await connect(app);
  const disclosure = app.byId('launcher-disclosure');
  assert.equal(disclosure.textContent, 'Show steps');
  assert.equal(disclosure.attributes['aria-expanded'], 'false');
  assert.equal(app.document.getElementById('launcher-store'), null);
  const screen = app.byId('bottom-bar').parentElement;
  const group = app.byId('category-bloat').parentElement;
  const card = app.byId('launcher-title').parentElement;
  assert.ok(screen.children.indexOf(card) > screen.children.indexOf(group));
  assert.match(screen.textContent, /restored the original home apps/);
  const properties = {};
  screen.style = { setProperty: (key, value) => { properties[key] = value; } };
  const observer = app.observers.at(-1);
  observer.target.getBoundingClientRect = () => ({ height: 142 });
  observer.callback();
  assert.equal(properties['--bottom-bar-height'], '142px');
  await app.click('launcher-disclosure');
  assert.equal(app.byId('launcher-disclosure').attributes['aria-expanded'], 'true');
  assert.equal(app.byId('launcher-original').checked, true);
  assert.equal(app.document.getElementById('launcher-store'), null);
  app.byId(`launcher-${replacement}`).listeners.change();
  assert.ok(app.byId('launcher-store'));
  await app.click('launcher-disclosure');
  assert.equal(app.document.getElementById('launcher-store'), null);
});

test('failed HOME restoration shows remote guidance and Check again retries verification', async t => {
  const app = await application(t);
  await connect(app);
  await app.click('launcher-disclosure');
  await app.click('launcher-restore');
  await app.click('modal-confirm');
  await app.emit('complete', { succeeded: 1, failed: 1, journalWarning: true, manualHomePackage: stock,
    results: [{ package: stock, result: 'enabled' }, { package: replacement, result: 'failed', reason: 'LAUNCHER_RESTORE_FAILED' }] });
  assert.match(app.document.root.textContent, /Press Home on your remote, choose Original home screen, select Always, then choose Check again/);
  assert.match(app.document.root.textContent, /could not save some recovery history/);
  await app.click('launcher-check-restore');
  assert.ok(app.requests.at(-1).path.endsWith('/launcher/restore'));
  await app.emit('complete', { succeeded: 1, failed: 0, results: [{ package: stock, result: 'enabled' }] });
  assert.match(app.document.root.textContent, /Your original home screen is back/);
});

test('failed clean POST stays on choose; lost SSE offers package refresh without claiming the TV is unreachable', async t => {
  const app = await application(t);
  await connect(app);
  app.post(async () => ({ ok: false, json: async () => ({ error: { code: 'DEVICE_BUSY' } }) }));
  await app.click('clean');
  await app.click('modal-confirm');
  assert.ok(app.document.getElementById('clean'));
  assert.equal(app.document.getElementById('job-progress'), null);
  app.post(async () => ({ ok: true, json: async () => ({ jobId: 'clean' }) }));
  await app.click('clean');
  await app.click('modal-confirm');
  await app.emit('error');
  assert.match(app.document.root.textContent, /TV may still be working/);
  assert.doesNotMatch(app.document.root.textContent, /could not reach your TV/);
  assert.equal(app.byId('error-retry').textContent, 'Check apps again');
  await app.click('error-retry');
  assert.ok(app.document.getElementById('clean'));
  assert.ok(app.sources.at(-1).closed);
});

test('manual HOME guidance from a failed health recovery shows on the choose screen', async t => {
  const app = await application(t, { manualHomePackage: stock });
  await connect(app);
  assert.match(app.byId('bottom-bar').parentElement.textContent, /Press Home on your remote, choose Original home screen, select Always/);
});

test('automatic recovery locks connection controls, waits through DEVICE_BUSY and reaches choose once', async t => {
  const app = await application(t, { needsRecovery: true, recoveryBusy: true });
  await app.click('begin');
  app.byId('prepared').listeners.change({ target: { checked: true } });
  await app.click('setup-next');
  await app.click('find-tv');
  await app.click('pick-0');
  const staleRetry = app.byId('retry-connect');
  await app.polls.shift()();
  const authorization = app.polls.shift();
  const connecting = authorization();
  await settle();
  const controls = [];
  const visit = node => {
    if (['button', 'input'].includes(node.tagName)) controls.push(node);
    node.children.forEach(visit);
  };
  visit(app.document.root);
  assert.ok(controls.every(node => node.disabled), 'connection controls stay locked during recovery');
  assert.doesNotMatch(app.document.root.textContent, /still working on another action/);
  await staleRetry.listeners.click();
  await settle();
  assert.equal(app.requests.filter(request => request.path === '/api/devices/connect').length, 3);
  assert.equal(app.requests.filter(request => request.path.endsWith('/launcher/recover')).length, 1);
  assert.equal(app.polls.length, 1, 'busy recovery waits before retrying');
  await app.polls.shift()();
  await settle();
  assert.equal(app.sources.length, 1);
  await staleRetry.listeners.click();
  await settle();
  assert.equal(app.requests.filter(request => request.path.endsWith('/launcher/recover')).length, 2);
  await app.emit('complete', { succeeded: 1, failed: 0, results: [], recovered: true });
  await connecting;
  assert.equal(app.byId('clean').disabled, false);
  assert.match(app.document.root.textContent, /restored the original home apps/);
  assert.equal(app.document.getElementById('error-retry'), null);
  assert.ok(app.sources[0].closed);
});

test('connection automatically posts recovery and shows its notice or manual HOME guidance; GETs carry the token', async t => {
  for (const recovered of [true, false]) for (const failRecoveryRefresh of [false, true]) await t.test(`${recovered}, refresh fails: ${failRecoveryRefresh}`, async t => {
    const app = await application(t, { needsRecovery: true, failRecoveryRefresh, recoveryResult: {
      succeeded: recovered ? 1 : 0, failed: recovered ? 0 : 1, results: [],
      ...(recovered ? { recovered: true } : { manualHomePackage: stock }),
    } });
    await connect(app);
    const recovery = app.requests.filter(request => request.path.endsWith('/launcher/recover'));
    assert.equal(recovery.length, 1);
    assert.equal(recovery[0].options.method, 'POST');
    assert.equal(recovery[0].options.body, '{}');
    assert.ok(app.sources[0].closed);
    for (const request of app.requests.filter(request => request.path.startsWith('/api/'))) {
      assert.equal(request.options.headers['X-CleanTV-Token'], 'test');
    }
    assert.match(app.document.root.textContent, recovered ? /restored the original home apps/ : /Press Home on your remote, choose Original home screen, select Always/);
  });
});

test('launcher picker defaults to keeping the original and makes no request on selection', async t => {
  const app = await application(t);
  await connect(app);
  await app.click('launcher-disclosure');
  assert.equal(app.byId('launcher-original').checked, true);
  assert.match(app.document.root.textContent, /Keep original launcher/);
  assert.equal(app.document.getElementById('launcher-store'), null);
  const count = app.requests.length;
  for (const entry of REPLACEMENT_LAUNCHERS) {
    const option = app.byId('launcher-' + entry.package);
    assert.match(option.parentElement.textContent, new RegExp(entry.name));
    assert.match(option.parentElement.textContent, /Not installed/);
    option.listeners.change();
    assert.equal(app.byId('launcher-switch').disabled, true);
  }
  app.byId('launcher-original').listeners.change();
  assert.equal(app.byId('launcher-original').checked, true);
  assert.equal(app.requests.length, count);
  assert.equal(app.document.getElementById('launcher-switch'), null);
});

for (const entry of REPLACEMENT_LAUNCHERS) {
  test(entry.name + ': store, check, confirmation, progress and result use the selection', async t => {
    const app = await application(t);
    await connect(app);
    await app.click('launcher-disclosure');
    app.byId('launcher-' + entry.package).listeners.change();
    await app.click('launcher-store');
    assert.deepEqual(JSON.parse(app.requests.at(-1).options.body), { package: entry.package });
    assert.match(app.document.root.textContent, new RegExp('open ' + entry.name + ' once'));
    app.failLauncher();
    await app.click('launcher-check');
    assert.equal(app.byId('launcher-switch').disabled, true);
    assert.doesNotMatch(app.document.root.textContent, /\{name\}/);
    await app.click('launcher-check');
    assert.ok(app.requests.at(-1).path.endsWith('/launcher?package=' + encodeURIComponent(entry.package)));
    assert.match(app.byId('launcher-' + entry.package).parentElement.textContent, /Installed · ready/);
    assert.equal(app.byId('launcher-switch').disabled, false);
    await app.click('launcher-switch');
    assert.equal(app.byId('dialog-title').textContent, 'Switch to ' + entry.name + '?');
    assert.match(app.byId('dialog-body').textContent, new RegExp('opens ' + entry.name));
    await app.click('modal-confirm');
    assert.deepEqual(JSON.parse(app.requests.at(-1).options.body), { package: entry.package });
    await app.emit('progress', { done: 1, total: 1, package: entry.package, result: 'switched' });
    assert.match(app.byId('current-app').textContent, new RegExp(entry.name));
    await app.emit('complete', { succeeded: 1, failed: 0, results: [{ package: entry.package, result: 'switched' }] });
    assert.match(app.document.root.textContent, new RegExp('Your home screen is now ' + entry.name));
    await app.click('back-list');
    app.byId('launcher-original').listeners.change();
    assert.equal(app.document.getElementById('launcher-store'), null);
    assert.doesNotMatch(app.document.root.textContent, /The store request was sent/);
    app.byId('launcher-' + REPLACEMENT_LAUNCHERS.find(other => other !== entry).package).listeners.change();
    assert.equal(app.byId('launcher-switch').disabled, true, 'readiness belongs to the selected launcher');
  });
}

test('a failed initial launcher status keeps a read-only retry available with the original selected', async t => {
  const app = await application(t, { launcherFailures: 1 });
  await connect(app);
  await app.click('launcher-disclosure');
  assert.equal(app.byId('launcher-original').checked, true);
  assert.equal(app.document.getElementById('launcher-' + replacement), null);
  const before = app.requests.length;
  await app.click('launcher-check');
  assert.equal(app.requests.length, before + 1);
  assert.ok(app.requests.at(-1).path.endsWith('/launcher'));
  assert.equal(app.requests.at(-1).options.method, 'GET');
  assert.equal(app.byId('launcher-original').checked, true);
  for (const entry of REPLACEMENT_LAUNCHERS) assert.ok(app.byId('launcher-' + entry.package));
  assert.equal(app.document.getElementById('launcher-store'), null);
});
