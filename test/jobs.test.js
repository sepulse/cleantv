import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createJobs } from '../src/server/jobs.js';

test('one job per serial, ordered live events, and late replay', async t => {
  const jobs = createJobs();
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const id = jobs.start('192.168.1.5:5555', async progress => {
    progress({ done: 1, total: 1, package: 'com.example.foo', result: 'disabled' });
    await gate;
    return { succeeded: 1, failed: 0, results: [{ package: 'com.example.foo', result: 'disabled' }] };
  });
  assert.throws(() => jobs.start('192.168.1.5:5555', async () => ({})), { code: 'DEVICE_BUSY' });
  const server = createServer((req, res) => {
    if (!jobs.stream(id, req, res)) res.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const live = fetch(url);
  await new Promise(resolve => setImmediate(resolve));
  finish();
  const body = await (await live).text();
  assert.match(body, /^retry: 2000/m);
  assert.ok(body.indexOf('event: progress') < body.indexOf('event: complete'));
  const replay = await (await fetch(url)).text();
  assert.equal(replay, body);
  assert.ok(jobs.start('192.168.1.5:5555', async () => ({ succeeded: 0, failed: 0, results: [] })));
});

test('job failures become redacted SSE errors', async t => {
  const jobs = createJobs();
  const id = jobs.start('192.168.1.6:5555', async () => { throw new Error('private diagnostic'); });
  const server = createServer((req, res) => jobs.stream(id, req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const body = await (await fetch(`http://127.0.0.1:${server.address().port}/`)).text();
  assert.match(body, /event: error/);
  assert.match(body, /"code":"INTERNAL"/);
  assert.doesNotMatch(body, /private diagnostic/);
});
