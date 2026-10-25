import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, open, readFile, readdir, writeFile, watch, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJournal, defaultDataDir } from '../src/core/journal.js';

function record(action = 'disable', status = 'ok', pkg = 'com.example.app') {
  return { at: new Date().toISOString(), action, package: pkg, status };
}

test('journal persists via replacement with no leftover temporary files', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cleantv-journal-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const data = join(dir, 'nested');
  const journal = createJournal(data);
  assert.deepEqual(await journal.read('TV123'), []);
  const pending = record('disable', 'pending');
  await journal.append('TV123', pending);
  const original = await readFile(join(data, 'TV123.json'), 'utf8');
  const successful = record();
  const events = [];
  const controller = new AbortController();
  const observe = (async () => {
    try {
      for await (const event of watch(data, { signal: controller.signal })) events.push(event);
    } catch (error) { if (error.name !== 'AbortError') throw error; }
  })();
  try { await journal.append('TV123', successful); }
  finally { controller.abort(); await observe; }
  const temporaryEvent = events.findIndex(event => event.filename?.endsWith('.tmp'));
  const replacementEvent = events.findIndex(event => event.filename === 'TV123.json');
  assert.ok(temporaryEvent >= 0, 'writes a temporary sibling first');
  assert.ok(replacementEvent > temporaryEvent, 'replaces destination after creating the temporary file');
  assert.equal(JSON.parse(original).length, 1);
  assert.deepEqual(await createJournal(data).read('TV123'), [pending, successful]);
  assert.deepEqual(await readdir(data), ['TV123.json']);
  assert.deepEqual(await journal.read('OTHER'), []);
});

test('disabledByUs uses latest ok action, ignoring failed and pending outcomes', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cleantv-history-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const journal = createJournal(dir);
  for (const entry of [record(), record('enable', 'failed'), record('enable', 'pending'),
    record('disable', 'ok', 'com.example.other'), record('enable', 'ok', 'com.example.other'),
    record('disable', 'failed', 'com.example.failed')]) await journal.append('TV', entry);
  assert.deepEqual(await journal.disabledByUs('TV'), ['com.example.app']);
  await journal.append('TV', record('enable'));
  assert.deepEqual(await journal.disabledByUs('TV'), []);
});

test('baseline persists separately and the first record survives retries and concurrent writers', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cleantv-baseline-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const journal = createJournal(join(dir, 'data'));
  const baseline = { at: new Date().toISOString(), disabledBefore: ['com.example.original'],
    props: { 'ro.product.model': 'TV' }, settings: { 'global/private_dns_mode': null }, homeComponent: 'com.example.home/.Main' };
  assert.equal(await journal.readBaseline('TV'), null);
  await journal.saveBaseline('TV', baseline);
  const entry = record();
  await journal.append('TV', entry);
  const later = { ...baseline, disabledBefore: ['com.example.changed'] };
  await Promise.all([journal.saveBaseline('TV', later), createJournal(join(dir, 'data')).saveBaseline('TV', later)]);
  assert.deepEqual(await createJournal(join(dir, 'data')).readBaseline('TV'), baseline);
  assert.deepEqual(await journal.read('TV'), [entry]);
  assert.deepEqual((await readdir(join(dir, 'data'))).sort(), ['TV.baseline.json', 'TV.json']);
  await Promise.all([journal.saveBaseline('OTHER', baseline), createJournal(join(dir, 'data')).saveBaseline('OTHER', later)]);
  const awaitedBaseline = await journal.readBaseline('OTHER');
  assert.ok([baseline, later].some(value => JSON.stringify(value) === JSON.stringify(awaitedBaseline)));
});

test('atomic replacement tolerates a briefly open Windows reader', { skip: process.platform !== 'win32' }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cleantv-sharing-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const journal = createJournal(dir);
  await journal.append('TV', record('disable', 'pending'));
  const reader = await open(join(dir, 'TV.json'), 'r');
  const release = new Promise((resolve, reject) => {
    setTimeout(() => reader.close().then(resolve, reject), 40);
  });
  try { await journal.append('TV', record()); }
  finally { await release; }
  assert.deepEqual((await journal.read('TV')).map(entry => entry.status), ['pending', 'ok']);
  assert.deepEqual(await readdir(dir), ['TV.json']);
});

test('concurrent appends on the same journal retain all records', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cleantv-concurrent-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const journal = createJournal(dir);
  await Promise.all(Array.from({ length: 12 }, (_, i) => journal.append('TV', record('disable', 'ok', `com.example.app${i}`))));
  assert.equal((await journal.read('TV')).length, 12);
  assert.deepEqual(await readdir(dir), ['TV.json']);
});

test('unsafe IDs are rejected and corrupted history is never silently overwritten', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cleantv-invalid-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const journal = createJournal(dir);
  for (const id of ['', '../escape', 'a/b', 'a\\b', 'a:device']) {
    await assert.rejects(journal.read(id), { code: 'INVALID_INPUT' });
    await assert.rejects(journal.append(id, record()), { code: 'INVALID_INPUT' });
    await assert.rejects(journal.readBaseline(id), { code: 'INVALID_INPUT' });
    await assert.rejects(journal.saveBaseline(id, {}), { code: 'INVALID_INPUT' });
  }
  await writeFile(join(dir, 'TV.json'), 'invalid JSON');
  await assert.rejects(journal.append('TV', record()), SyntaxError);
  assert.equal(await readFile(join(dir, 'TV.json'), 'utf8'), 'invalid JSON');
  await writeFile(join(dir, 'TV.baseline.json'), 'invalid JSON');
  await assert.rejects(journal.readBaseline('TV'), SyntaxError);
  await journal.saveBaseline('TV', {});
  assert.equal(await readFile(join(dir, 'TV.baseline.json'), 'utf8'), 'invalid JSON');
});

test('default directory follows the host OS convention', () => {
  assert.equal(defaultDataDir(), process.platform === 'win32'
    ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'CleanTV')
    : join(homedir(), '.cleantv'));
});
