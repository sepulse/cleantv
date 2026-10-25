import { CleanTvError, ErrorCode } from '../core/errors.js';
import { isValidSerial } from '../core/safety.js';
import { assertReplacement } from '../core/launchers.js';

const invalid = () => { throw new CleanTvError(ErrorCode.INVALID_INPUT); };
const json = (response, value, status = 200) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
};
const packages = value => Array.isArray(value) && value.length >= 1 && value.length <= 200
  && value.every(item => typeof item === 'string');

/** @param {{ engine: object | null, client: object | null, scan: Function,
 *   jobs: ReturnType<typeof import('./jobs.js').createJobs> }} dependencies */
export function createRoutes({ engine, client, scan, jobs, demo = false }) {
  const requireAdb = () => { if (!client) throw new CleanTvError(ErrorCode.ADB_NOT_FOUND); };
  const routes = [
    ['GET', /^\/api\/health$/, async (_req, res) => json(res, { ok: true, ...(demo ? { demo: true } : {}), adb: {
      found: Boolean(client), path: client?.adbPath ?? null, version: client?.adbVersion ?? null,
    } })],
    ['POST', /^\/api\/discover$/, async (_req, res) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new CleanTvError(ErrorCode.TIMEOUT)), 10000);
      timeout.unref();
      try { json(res, { candidates: await scan({ signal: controller.signal }) }); }
      finally { clearTimeout(timeout); }
    }],
    ['POST', /^\/api\/devices\/connect$/, async (_req, res, _match, body) => {
      requireAdb();
      const { ip, port = 5555 } = body ?? {};
      if (typeof ip !== 'string' || !Number.isInteger(port) || !isValidSerial(`${ip}:${port}`)) invalid();
      json(res, await client.connect(ip, port));
    }],
    ['GET', /^\/api\/devices$/, async (_req, res) => {
      requireAdb();
      json(res, { devices: (await client.devices()).map(({ serial, state }) => ({ serial, state })) });
    }],
    ['GET', /^\/api\/devices\/([^/]+)$/, async (_req, res, match) => {
      requireAdb();
      const { info, presets, ...inspection } = await engine.inspect(match.serial);
      json(res, { ...info, presets, ...(inspection.recovered ? { recovered: true } : {}),
        ...(inspection.reenabled?.length ? { reenabled: inspection.reenabled } : {}),
        ...(inspection.needsRecovery ? { needsRecovery: true } : {}),
        ...(inspection.manualHomePackage ? { manualHomePackage: inspection.manualHomePackage } : {}),
        ...(inspection.journalWarning ? { journalWarning: true } : {}) });
    }],
    ['GET', /^\/api\/devices\/([^/]+)\/packages$/, async (_req, res, match) => {
      requireAdb();
      const { packages, reenabled, recovered, needsRecovery, manualHomePackage, journalWarning } = await engine.inspect(match.serial);
      json(res, { packages, ...(recovered ? { recovered: true } : {}),
        ...(reenabled?.length ? { reenabled } : {}),
        ...(needsRecovery ? { needsRecovery: true } : {}),
        ...(manualHomePackage ? { manualHomePackage } : {}), ...(journalWarning ? { journalWarning: true } : {}) });
    }],
    ['POST', /^\/api\/devices\/([^/]+)\/disable$/, async (_req, res, match, body) => {
      requireAdb();
      if (!packages(body?.packages)) invalid();
      json(res, { jobId: jobs.start(match.serial,
        onProgress => engine.disable(match.serial, body.packages, onProgress)) }, 202);
    }],
    ['POST', /^\/api\/devices\/([^/]+)\/restore$/, async (_req, res, match, body) => {
      requireAdb();
      const all = body?.all === true && body?.packages === undefined;
      if (!all && (body?.all !== undefined || !packages(body?.packages))) invalid();
      json(res, { jobId: jobs.start(match.serial,
        onProgress => engine.restore(match.serial, all ? 'all' : body.packages, onProgress)) }, 202);
    }],
    ['GET', /^\/api\/devices\/([^/]+)\/launcher$/, async (req, res, match) => {
      requireAdb();
      const packages = new URL(req.url, 'http://127.0.0.1').searchParams.getAll('package');
      if (packages.length > 1) invalid();
      if (packages.length) assertReplacement(packages[0]);
      json(res, await engine.launcherStatus(match.serial, packages[0]));
    }],
    ['POST', /^\/api\/devices\/([^/]+)\/launcher\/open-store$/, async (_req, res, match, body) => {
      requireAdb();
      assertReplacement(body?.package);
      await engine.openLauncherStore(match.serial, body.package);
      json(res, { ok: true });
    }],
    ['POST', /^\/api\/devices\/([^/]+)\/launcher\/swap$/, async (_req, res, match, body) => {
      requireAdb();
      assertReplacement(body?.package);
      json(res, { jobId: jobs.start(match.serial,
        onProgress => engine.swapLauncher(match.serial, body.package, onProgress)) }, 202);
    }],
    ['POST', /^\/api\/devices\/([^/]+)\/launcher\/restore$/, async (_req, res, match, body) => {
      requireAdb();
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) invalid();
      json(res, { jobId: jobs.start(match.serial,
        onProgress => engine.restoreLauncher(match.serial, onProgress)) }, 202);
    }],
    ['POST', /^\/api\/devices\/([^/]+)\/launcher\/recover$/, async (_req, res, match, body) => {
      requireAdb();
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) invalid();
      json(res, { jobId: jobs.start(match.serial,
        () => engine.recoverLauncher(match.serial)) }, 202);
    }],
    ['GET', /^\/api\/devices\/([^/]+)\/history$/, async (_req, res, match) => {
      requireAdb();
      json(res, { entries: await engine.history(match.serial) });
    }],
    ['POST', /^\/api\/devices\/([^/]+)\/disconnect$/, async (_req, res, match) => {
      requireAdb();
      if (jobs.isBusy(match.serial)) throw new CleanTvError(ErrorCode.DEVICE_BUSY);
      await client.disconnect(match.serial);
      json(res, { ok: true });
    }],
    ['GET', /^\/api\/jobs\/([^/]+)\/events$/, async (req, res, match) => {
      if (!jobs.stream(match[1], req, res)) json(res, { error: { code: ErrorCode.NOT_FOUND, message: 'Job not found' } }, 404);
    }],
  ];
  return async (req, res, pathname, body) => {
    for (const [method, pattern, handle] of routes) {
      if (req.method !== method) continue;
      const match = pathname.match(pattern);
      if (!match) continue;
      if (pathname.startsWith('/api/devices/') && match[1]) {
        try { match.serial = decodeURIComponent(match[1]); } catch { invalid(); }
        if (!isValidSerial(match.serial)) invalid();
      }
      await handle(req, res, match, body);
      return true;
    }
    return false;
  };
}
