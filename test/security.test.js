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

test('request size and JSON syntax are enforced', async t => {
  const port = await setup(t);
  const headers = { 'Content-Type': 'application/json', 'X-CleanTV-Token': 'secret' };
  assert.equal((await send(port, '/api/discover', { method: 'POST', headers, body: '{' })).status, 400);
  const large = await send(port, '/api/discover', { method: 'POST', headers, body: JSON.stringify({ filler: 'x'.repeat(65536) }) });
  assert.equal(large.status, 413);
  assert.equal(JSON.parse(large.body).error.code, 'INVALID_INPUT');
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
