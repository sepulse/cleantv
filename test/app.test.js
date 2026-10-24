import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDocument } from './helpers/dom.js';

let generation = 0;
const serial = '192.168.1.50:5555';
const replacement = 'com.spocky.projengmenu';
const stock = 'com.google.android.apps.tv.launcherx';
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

async function application(t, { missingCatalog = false, recovered = false, manualHomePackage, needsRecovery = false, recoveryResult, failRecoveryRefresh = false, recoveryBusy = false } = {}) {
  const previous = Object.fromEntries(['document', 'Node', 'window', 'localStorage', 'fetch', 'EventSource', 'setTimeout', 'clearTimeout', 'ResizeObserver']
    .map(key => [key, globalThis[key]]));
  const { document, Node } = createDocument();
  const catalog = JSON.parse(await readFile(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
  const polls = [];
  const sources = [];
  const observers = [];
  const requests = [];
  let connects = 0;
  let ready = false;
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
      if (path.endsWith('/open-store')) { ready = true; return response({ ok: true }); }
      if (path.endsWith('/launcher/recover')) {
        if (recoveryBusy) { recoveryBusy = false; return { ok: false, status: 409, json: async () => ({ error: { code: 'DEVICE_BUSY' } }) }; }
        recoveryStarted = true; needsRecovery = false; return response({ jobId: 'recovery' });
      }
      if (failRecoveryRefresh && recoveryStarted && options.method === 'GET') throw new Error('Connection dropped after recovery');
      if (path.endsWith('/launcher') && !options.body) return response({ home: stock,
        needsRecovery,
        replacement: { package: replacement, installed: ready, enabled: ready, isHomeCandidate: ready },
        stock: [{ package: stock, installed: true, enabled: true }] });
      if (path.endsWith('/packages')) return response({ recovered, needsRecovery, ...(manualHomePackage ? { manualHomePackage } : {}), packages: [{ package: 'com.example.app', label: { en: 'Example app' },
        risk: 'green', category: 'bloat', installed: true, enabled: true, canDisable: true }] });
      if (options.body) return jobPost ? jobPost(path, options) : response({ jobId: 'test' });
      return response({ serial, brand: 'google', model: 'Chromecast', androidVersion: '14' });
    },
  });
  t.after(() => { pagehide?.(); Object.assign(globalThis, previous); });
  await import(`../public/js/app.js?test=${generation++}`);
  const byId = id => { const node = document.getElementById(id); assert.ok(node, id); return node; };
  const click = async id => { const node = byId(id); assert.ok(!node.disabled, `${id} disabled`); await node.listeners.click?.({ target: node }); await settle(); };
  const emit = async (name, data) => { sources.at(-1).handlers[name](data === undefined ? {} : { data: JSON.stringify(data) }); await settle(); };
  return { document, polls, sources, requests, observers, byId, click, emit, post: handler => { jobPost = handler; } };
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

test('launcher UI checks readiness, waits for POST, bounds rollback progress, and preserves previous result on POST failure', async t => {
  const app = await application(t);
  await connect(app);
  assert.equal(app.byId('clean').textContent, 'Clean 1 app');
  await app.click('launcher-disclosure');
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
