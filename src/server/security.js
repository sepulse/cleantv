import { timingSafeEqual } from 'node:crypto';
import { CleanTvError, ErrorCode } from '../core/errors.js';

/** @param {import('node:http').ServerResponse} response @param {string} pathname */
export function securityHeaders(response, pathname) {
  response.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'");
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  if (pathname === '/api' || pathname.startsWith('/api/')) response.setHeader('Cache-Control', 'no-store');
}

/** @param {import('node:http').IncomingMessage} request */
export function checkHost(request) {
  const port = request.socket.localPort;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host)) {
    throw new CleanTvError(ErrorCode.FORBIDDEN);
  }
}

/** @param {import('node:http').IncomingMessage} request @param {string} token */
export function checkMutation(request, token) {
  const port = request.socket.localPort;
  const origin = request.headers.origin;
  const candidate = request.headers['x-cleantv-token'];
  const actual = typeof candidate === 'string' ? Buffer.from(candidate) : Buffer.alloc(0);
  const expected = Buffer.from(token);
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json'
    || actual.length !== expected.length || !timingSafeEqual(actual, expected)
    || (origin !== undefined && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin))) {
    throw new CleanTvError(ErrorCode.FORBIDDEN);
  }
}

/** @param {import('node:http').IncomingMessage} request @returns {Promise<unknown>} */
export async function readJson(request) {
  let size = 0;
  const parts = [];
  for await (const part of request) {
    size += part.length;
    if (size > 64 * 1024) throw new CleanTvError(ErrorCode.INVALID_INPUT, 'Request body exceeds 64 KiB', { tooLarge: true });
    parts.push(part);
  }
  try { return size === 0 ? {} : JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw new CleanTvError(ErrorCode.INVALID_INPUT, 'Invalid JSON'); }
}
