import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createDemoClient, scanDemo } from './demo-client.js';
import { locateAdb } from '../core/adb/locate.js';
import { createRunner } from '../core/adb/runner.js';
import { createAdbClient } from '../core/adb/client.js';
import { createJournal } from '../core/journal.js';
import { loadPresets } from '../core/registry.js';
import { createEngine } from '../core/engine.js';
import { scanForAdb } from '../core/discovery.js';
import { CleanTvError, ErrorCode } from '../core/errors.js';
import { checkHost, checkMutation, readJson, securityHeaders } from './security.js';
import { sendError } from './http-errors.js';
import { createJobs } from './jobs.js';
import { createRoutes } from './routes.js';
import { serveStatic } from './static.js';

/**
 * @param {{ engine: ReturnType<typeof createEngine> | null, client: ReturnType<typeof createAdbClient> | null,
 *   journal: ReturnType<typeof createJournal>, scan: typeof scanForAdb, publicDir: string, token: string }} dependencies
 * @returns {import('node:http').Server}
 */
export function createAppServer({ engine, client, journal, scan, publicDir, token, demo = false }) {
  const jobs = createJobs();
  const routes = createRoutes({ engine, client, journal, scan, jobs, demo });
  return createServer(async (request, response) => {
    const pathname = request.url?.split('?')[0] ?? '';
    securityHeaders(response, pathname);
    try {
      checkHost(request);
      let body;
      if (request.method !== 'GET') {
        checkMutation(request, token);
        body = await readJson(request);
      }
      if (pathname.startsWith('/api/')) {
        if (await routes(request, response, pathname, body)) return;
      } else if (request.method === 'GET' && await serveStatic(request, response, publicDir, token)) return;
      response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: { code: ErrorCode.NOT_FOUND, message: 'Not found' } }));
    } catch (error) {
      if (!response.headersSent) sendError(response, error);
      else response.end();
    }
  });
}

/** @returns {Promise<import('node:http').Server>} */
export async function main() {
  const demo = process.argv.includes('--demo');
  const presets = await loadPresets(fileURLToPath(new URL('../../presets/', import.meta.url)));
  let client = null;
  if (demo) {
    console.log('DEMO MODE — no real TV');
    client = createDemoClient(presets);
  } else try {
    const adbPath = await locateAdb();
    const run = createRunner(adbPath);
    client = createAdbClient(run);
    client.adbPath = adbPath;
    const version = await run(['version']);
    client.adbVersion = version.stdout.split(/\r?\n/).find(line => line.trim())?.trim() ?? null;
  } catch (error) {
    if (error.code !== ErrorCode.ADB_NOT_FOUND) throw error;
  }
  const journal = createJournal(demo ? await mkdtemp(resolve(tmpdir(), 'cleantv-demo-')) : undefined);
  const engine = client ? createEngine({ client, journal, presets }) : null;
  const token = randomBytes(32).toString('base64url');
  const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));
  const server = createAppServer({ engine, client, journal, scan: demo ? scanDemo : scanForAdb, publicDir, token, demo });
  const configured = process.env.CLEANTV_PORT;
  const ports = configured === undefined ? Array.from({ length: 11 }, (_, i) => 8765 + i) : [Number(configured)];
  if (ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new CleanTvError(ErrorCode.INVALID_INPUT, 'Invalid CLEANTV_PORT');
  }
  let port;
  for (const candidate of ports) {
    try {
      await new Promise((resolveListen, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(candidate, '127.0.0.1', () => { server.off('error', rejectListen); resolveListen(); });
      });
      port = candidate;
      break;
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || candidate === ports.at(-1)) throw error;
    }
  }
  const url = `http://127.0.0.1:${port}/`;
  console.log(url);
  if (process.argv.includes('--open')) {
    const osName = process['platform'];
    const program = osName === 'win32' ? 'explorer.exe' : osName === 'darwin' ? 'open' : 'xdg-open';
    execFile(program, [url], { windowsHide: true }, error => { if (error) console.error(error); });
  }
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
