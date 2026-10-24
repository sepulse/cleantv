import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createAppServer } from '../src/server/index.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

async function setup(t) {
  const server = createAppServer({ client: { devices: async () => [] }, engine: {}, journal: {}, scan: async () => [], publicDir, token: 'secret' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return server.address().port;
}

function send(port, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('Host, token, content type, and Origin gate requests', async t => {
  const port = await setup(t);
  const valid = { 'Content-Type': 'application/json', 'X-CleanTV-Token': 'secret' };
  assert.equal((await send(port, '/api/devices', { headers: { Host: `evil.example:${port}` } })).status, 403);
  for (const headers of [
    { 'Content-Type': 'application/json' },
    { ...valid, 'X-CleanTV-Token': 'wrong' },
    { 'X-CleanTV-Token': 'secret' },
    { ...valid, Origin: 'http://evil.example' },
  ]) {
    const result = await send(port, '/api/discover', { method: 'POST', headers, body: '{}' });
    assert.equal(result.status, 403);
    assert.equal(JSON.parse(result.body).error.code, 'FORBIDDEN');
    assert.match(result.headers['content-security-policy'], /frame-ancestors 'none'/);
  }
  assert.equal((await send(port, '/api/discover', { method: 'POST', headers: { ...valid, Origin: `http://localhost:${port}` }, body: '{}' })).status, 200);
});

test('every API request requires the token except GET health and job events', async t => {
  const port = await setup(t);
  for (const path of ['/api/devices', '/api/devices/192.168.1.5%3A5555',
    '/api/devices/192.168.1.5%3A5555/packages', '/api/devices/192.168.1.5%3A5555/launcher',
    '/api/devices/192.168.1.5%3A5555/history', '/api/unknown']) {
    for (const token of [undefined, 'wrong', 'secrex']) {
      assert.equal((await send(port, path, { headers: token ? { 'X-CleanTV-Token': token } : {} })).status, 403, path);
    }
  }
  assert.equal((await send(port, '/api/devices', { headers: { 'X-CleanTV-Token': 'secret' } })).status, 200);
  assert.equal((await send(port, '/api/health')).status, 200);
  assert.equal((await send(port, '/api/jobs/unknown/events')).status, 404);
  for (const path of ['/api/health', '/api/jobs/unknown/events']) {
    assert.equal((await send(port, path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  }
});

test('request size and JSON syntax are enforced', async t => {
  const port = await setup(t);
  const headers = { 'Content-Type': 'application/json', 'X-CleanTV-Token': 'secret' };
  assert.equal((await send(port, '/api/discover', { method: 'POST', headers, body: '{' })).status, 400);
  const large = await send(port, '/api/discover', { method: 'POST', headers, body: JSON.stringify({ filler: 'x'.repeat(65536) }) });
  assert.equal(large.status, 413);
  assert.equal(JSON.parse(large.body).error.code, 'INVALID_INPUT');
});

test('launcher status and mutations enforce Host before reaching the device', async t => {
  const port = await setup(t);
  const path = '/api/devices/192.168.1.5%3A5555/launcher';
  assert.equal((await send(port, path, { headers: { Host: 'evil.example' } })).status, 403);
  for (const suffix of ['open-store', 'swap', 'restore']) {
    assert.equal((await send(port, `${path}/${suffix}`, { method: 'POST', headers: {
      Host: 'evil.example', 'Content-Type': 'application/json', 'X-CleanTV-Token': 'secret',
    }, body: '{}' })).status, 403);
  }
});

test('static files inject the token and reject raw traversal paths', async t => {
  const port = await setup(t);
  const page = await send(port, '/');
  assert.equal(page.status, 200);
  assert.match(page.body, /name="cleantv-token" content="secret"/);
  assert.equal(page.headers['x-content-type-options'], 'nosniff');
  for (const path of ['/../package.json', '/%2e%2e/package.json', '/%252e%252e/package.json', '/..%5cpackage.json', '//package.json']) {
    assert.equal((await send(port, path)).status, 404, path);
  }
});

test('static index aliases inject token and colon paths are rejected', async t => {
  const port = await setup(t);
  for (const path of ['/index.html', '/INDEX.HTML']) {
    const page = await send(port, path);
    // Case aliases exist on the Windows filesystem.
    if (path === '/INDEX.HTML' && process.platform !== 'win32') continue;
    assert.equal(page.status, 200);
    assert.match(page.body, /name="cleantv-token" content="secret"/);
    assert.doesNotMatch(page.body, /\{\{CLEANTV_TOKEN\}\}/);
  }
  for (const path of ['/index.html:stream', '/fonts/a%3Ab']) assert.equal((await send(port, path)).status, 404);
});

test('JSON content type accepts charset parameters', async t => {
  const port = await setup(t);
  assert.equal((await send(port, '/api/discover', { method: 'POST', headers: {
    'Content-Type': 'application/json; charset=utf-8', 'X-CleanTV-Token': 'secret',
  }, body: '{}' })).status, 200);
});

test('empty POST body is an empty JSON object', async t => {
  const port = await setup(t);
  assert.equal((await send(port, '/api/discover', { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-CleanTV-Token': 'secret',
  } })).status, 200);
});
