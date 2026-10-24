import { networkInterfaces } from 'node:os';
import { connect } from 'node:net';
import { isValidSerial } from './safety.js';
import { CleanTvError, ErrorCode } from './errors.js';

function tcpProbe(ip, port, timeoutMs) {
  return new Promise(resolve => {
    const socket = connect({ host: ip, port });
    const finish = open => { socket.destroy(); resolve(open); };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

/**
 * @param {{ port?: number, timeoutMs?: number, concurrency?: number, signal?: AbortSignal, interfaces?: ReturnType<typeof networkInterfaces>, probe?: (ip: string, port: number, timeoutMs: number) => Promise<boolean> }} [options]
 * @returns {Promise<Array<{ ip: string, port: number }>>}
 */
export async function scanForAdb({
  port = 5555, timeoutMs = 500, concurrency = 64, signal,
  interfaces = networkInterfaces(), probe = tcpProbe,
} = {}) {
  signal?.throwIfAborted();
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(concurrency)
    || concurrency < 1 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new CleanTvError(ErrorCode.INVALID_INPUT);
  const addresses = Object.values(interfaces).flat().filter(item => item
    && (item.family === 'IPv4' || item.family === 4) && !item.internal
    && isValidSerial(`${item.address}:${port}`)).map(item => item.address);
  const own = new Set(addresses);
  const targets = new Set();
  for (const ip of addresses) {
    const [a, b] = ip.split('.').map(Number);
    if (!(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))) continue;
    const prefix = ip.slice(0, ip.lastIndexOf('.') + 1);
    for (let host = 1; host < 255; host++) {
      const target = `${prefix}${host}`;
      if (!own.has(target)) targets.add(target);
    }
  }
  const ips = [...targets];
  const found = new Set();
  let cursor = 0;
  let abort;
  const aborted = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    signal?.addEventListener('abort', abort, { once: true });
  });
  async function worker() {
    while (cursor < ips.length) {
      signal?.throwIfAborted();
      const ip = ips[cursor++];
      const open = await probe(ip, port, timeoutMs);
      signal?.throwIfAborted();
      if (open) found.add(ip);
    }
  }
  try {
    await Promise.race([Promise.all(Array.from({ length: Math.min(concurrency, ips.length) }, worker)), aborted]);
    return ips.filter(ip => found.has(ip)).map(ip => ({ ip, port }));
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}
