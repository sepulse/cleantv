import { readFile, realpath } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};

/** @param {import('node:http').IncomingMessage} request @param {import('node:http').ServerResponse} response
 * @param {string} publicDir @param {string} token @returns {Promise<boolean>} */
export async function serveStatic(request, response, publicDir, token) {
  const raw = request.url.split('?')[0];
  let path = raw;
  try {
    for (let i = 0; i < 5; i++) {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    }
  } catch { return false; }
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('\0')
    || path.split('/').some(part => part === '..' || part === '.') || path.includes(':')) return false;
  const name = path === '/' ? 'index.html' : path.slice(1);
  if (!name || isAbsolute(name)) return false;
  const root = await realpath(publicDir);
  const candidate = resolve(root, name);
  try {
    const file = await realpath(candidate);
    const rel = relative(root, file);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return false;
    const contents = await readFile(file);
    const body = relative(root, file).toLowerCase() === 'index.html'
      ? Buffer.from(contents.toString('utf8').replaceAll('{{CLEANTV_TOKEN}}', token)) : contents;
    response.writeHead(200, { 'Content-Type': types[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    response.end(body);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR' || error.code === 'EACCES') return false;
    throw error;
  }
}
