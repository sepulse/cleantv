import { mkdir, readFile, writeFile, rename, unlink, link } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CleanTvError, ErrorCode } from './errors.js';

/** @returns {string} */
export function defaultDataDir() {
  return 'win32' === process.platform
    ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'CleanTV')
    : join(homedir(), '.cleantv');
}

/** @typedef {{ at: string, action: 'disable' | 'enable' | 'swap', package?: string, replacement?: string, disabled?: string[], status: 'pending' | 'ok' | 'failed' | 'rolled-back', error?: string }} JournalRecord */
/** @typedef {{ at: string, disabledBefore: string[], props: Record<string, string>, settings: Record<string, string | null>, homeComponent: string | null }} Baseline */

export function warnJournal(error, result) {
  console.error('CleanTV recovery journal:', error.message);
  result.journalWarning = true;
}

/** Recovery must reach the TV even when persistence fails. */
export async function appendRecovery(journal, deviceId, record, result) {
  try { await journal.append(deviceId, record); }
  catch (error) { warnJournal(error, result); }
}

/** @param {string} [dataDir] */
export function createJournal(dataDir = defaultDataDir()) {
  const queues = new Map();
  let sequence = 0;
  function fileFor(deviceId, suffix = '') {
    if (typeof deviceId !== 'string' || deviceId.trim() !== deviceId || !/^[A-Za-z0-9._-]+$/.test(deviceId)) {
      throw new CleanTvError(ErrorCode.INVALID_INPUT, 'Invalid device ID');
    }
    return join(dataDir, `${deviceId}${suffix}.json`);
  }
  /** @param {string} deviceId @returns {Promise<JournalRecord[]>} */
  async function read(deviceId) {
    const file = fileFor(deviceId);
    try {
      const records = JSON.parse(await readFile(file, 'utf8'));
      if (!Array.isArray(records)) throw new TypeError('Journal must contain an array');
      return records;
    }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  return {
    /** @param {string} deviceId @param {Baseline} baseline @returns {Promise<void>} */
    async saveBaseline(deviceId, baseline) {
      const file = fileFor(deviceId, '.baseline');
      await mkdir(dataDir, { recursive: true });
      const temp = `${file}.${randomUUID()}.tmp`;
      try {
        await writeFile(temp, JSON.stringify(baseline, null, 2), { flag: 'wx' });
        // Publish a complete file atomically without replacing the first record.
        try { await link(temp, file); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
      } finally {
        await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
    },
    /** @param {string} deviceId @returns {Promise<Baseline | null>} */
    async readBaseline(deviceId) {
      const file = fileFor(deviceId, '.baseline');
      try {
        const baseline = JSON.parse(await readFile(file, 'utf8'));
        if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) throw new TypeError('Baseline must contain an object');
        if (!Array.isArray(baseline.disabledBefore) || !baseline.disabledBefore.every(pkg => typeof pkg === 'string')) {
          throw new TypeError('Baseline must contain a disabledBefore string array');
        }
        return baseline;
      } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    /** @param {string} deviceId @param {JournalRecord} record @returns {Promise<void>} */
    async append(deviceId, record) {
      const file = fileFor(deviceId);
      const previous = queues.get(deviceId) ?? Promise.resolve();
      const next = previous.catch(() => {}).then(async () => {
        await mkdir(dataDir, { recursive: true });
        const records = await read(deviceId);
        records.push(record);
        const temp = `${file}.${process.pid}.${sequence++}.tmp`;
        try {
          await writeFile(temp, JSON.stringify(records, null, 2), { flag: 'wx' });
          for (let attempt = 0; ; attempt++) {
            try { await rename(temp, file); break; }
            catch (error) {
              if (attempt === 4 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
              await new Promise(resolve => setTimeout(resolve, 20));
            }
          }
        } finally {
          await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; });
        }
      });
      queues.set(deviceId, next);
      try { await next; }
      finally { if (queues.get(deviceId) === next) queues.delete(deviceId); }
    },
    read,
    /** @param {string} deviceId @returns {Promise<string[]>} */
    async disabledByUs(deviceId) {
      const latest = new Map();
      for (const record of await read(deviceId)) {
        if (record.status === 'ok' && record.action !== 'swap') latest.set(record.package, record.action);
      }
      return [...latest].filter(([, action]) => action === 'disable').map(([pkg]) => pkg);
    },
  };
}
