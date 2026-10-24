import test from 'node:test';
import assert from 'node:assert/strict';
import { scanForAdb } from '../src/core/discovery.js';

const address = (ip, extra = {}) => ({ address: ip, family: 'IPv4', internal: false, ...extra });

test('discovery scans private /24s, excludes all own IPs and deduplicates', async () => {
  const calls = [];
  const interfaces = { lan: [address('192.168.5.10'), address('192.168.5.11')],
    vpn: [address('10.2.3.1')], corp: [address('172.16.8.4'), address('172.31.9.5')],
    ignored: [address('127.0.0.1', { internal: true }), address('8.8.8.8'), address('172.15.1.1'),
      address('172.32.1.1'), address('169.254.0.3'), address('::1', { family: 'IPv6' })] };
  const found = await scanForAdb({ interfaces, probe: async (ip, port, timeout) => {
    calls.push(ip);
    assert.equal(port, 5555);
    assert.equal(timeout, 500);
    return ip === '192.168.5.20' || ip === '10.2.3.254';
  } });
  assert.deepEqual(found, [{ ip: '192.168.5.20', port: 5555 }, { ip: '10.2.3.254', port: 5555 }]);
  assert.equal(calls.length, 252 + 253 * 3);
  assert.equal(new Set(calls).size, calls.length);
  for (const ip of ['192.168.5.10', '192.168.5.11', '10.2.3.1', '172.16.8.4', '172.31.9.5',
    '192.168.5.0', '192.168.5.255', '8.8.8.1', '172.15.1.2', '172.32.1.2']) assert.ok(!calls.includes(ip), ip);
});

test('discovery respects concurrency and custom port/timeout', async () => {
  let active = 0; let maximum = 0;
  const found = await scanForAdb({ interfaces: { lan: [address('10.0.0.1')] }, concurrency: 3, port: 1234, timeoutMs: 25,
    probe: async (ip, port, timeoutMs) => {
      active++; maximum = Math.max(maximum, active);
      assert.equal(port, 1234); assert.equal(timeoutMs, 25);
      await new Promise(resolve => setImmediate(resolve));
      active--;
      return ip === '10.0.0.2';
    } });
  assert.equal(maximum, 3);
  assert.deepEqual(found, [{ ip: '10.0.0.2', port: 1234 }]);
});

test('discovery rejects a pre-aborted signal without probing', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(scanForAdb({ signal: controller.signal, probe: async () => assert.fail('must not probe') }), { name: 'AbortError' });
});

test('abort stops scheduling targets even when a probe is still pending', async () => {
  const controller = new AbortController();
  let release; let started;
  const pending = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  let calls = 0;
  const scan = scanForAdb({ interfaces: { lan: [address('192.168.1.2')] }, concurrency: 1, signal: controller.signal,
    probe: async () => { calls++; started(); return pending; } });
  await entered;
  controller.abort();
  try { await assert.rejects(scan, { name: 'AbortError' }); }
  finally { release(false); }
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
});

test('no private interface yields no probes, invalid options are rejected', async () => {
  assert.deepEqual(await scanForAdb({ interfaces: {}, probe: async () => assert.fail('no target') }), []);
  for (const options of [{ concurrency: 0 }, { port: 65536 }, { timeoutMs: 0 }]) {
    await assert.rejects(scanForAdb({ interfaces: {}, ...options }), { code: 'INVALID_INPUT' });
  }
});
