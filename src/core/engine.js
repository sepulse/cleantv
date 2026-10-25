import { getDeviceInfo } from './device.js';
import { getPackageStates } from './packages.js';
import { buildEntryIndex, matchPresets } from './registry.js';
import { canDisable, isValidPackageName, isValidSerial } from './safety.js';
import { CleanTvError, ErrorCode } from './errors.js';
import { createLauncherActions, STOCK_LAUNCHERS, REPLACEMENT_LAUNCHERS } from './launchers.js';
import { appendRecovery, warnJournal } from './journal.js';

/**
 * @param {{ client: ReturnType<typeof import('./adb/client.js').createAdbClient>, journal: ReturnType<typeof import('./journal.js').createJournal>, presets: import('./registry.js').Preset[] }} dependencies
 */
export function createEngine({ client, journal, presets }) {
  async function context(serial) {
    if (!isValidSerial(serial)) throw new CleanTvError(ErrorCode.INVALID_INPUT);
    const device = (await client.devices()).find(item => item.serial === serial);
    if (!device) throw new CleanTvError(ErrorCode.DEVICE_UNREACHABLE);
    if (device.state === 'unauthorized') throw new CleanTvError(ErrorCode.DEVICE_UNAUTHORIZED);
    if (device.state === 'offline') throw new CleanTvError(ErrorCode.DEVICE_OFFLINE);
    if (device.state !== 'device') throw new CleanTvError(ErrorCode.DEVICE_UNREACHABLE);
    const installed = await client.listPackages(serial);
    const info = await getDeviceInfo(client, serial, installed);
    const matched = matchPresets(presets, info);
    return { info, matched, index: buildEntryIndex(matched), installed };
  }

  async function ensureBaseline(serial, info, outcome) {
    try {
      if (await journal.readBaseline(info.deviceId) !== null) return;
      // A late baseline must not record packages CleanTV already touched as original state.
      const touched = new Set((await journal.read(info.deviceId)).flatMap(record =>
        record.action === 'disable' ? [record.package] : record.action === 'swap' ? record.disabled ?? [] : []));
      const disabledBefore = (await client.listPackages(serial, { disabledOnly: true }))
        .filter(pkg => !touched.has(pkg));
      const props = await client.getprops(serial);
      await journal.saveBaseline(info.deviceId, {
        at: new Date().toISOString(), disabledBefore,
        props: Object.fromEntries(['ro.product.brand', 'ro.product.manufacturer', 'ro.product.model',
          'ro.build.version.release', 'ro.build.fingerprint'].map(key => [key, props[key] ?? ''])),
        settings: await client.getSettings(serial),
        homeComponent: await client.resolveHomeComponent(serial),
      });
    } catch (error) { warnJournal(error, outcome); }
  }

  async function act(serial, pkgs, action, onProgress = () => {}) {
    if (pkgs !== 'all' && !Array.isArray(pkgs)) throw new CleanTvError(ErrorCode.INVALID_INPUT);
    const { info, index, installed } = await context(serial);
    const restoreAll = pkgs === 'all';
    if (action === 'disable' && !info.homePackage) {
      throw new CleanTvError(ErrorCode.COMMAND_FAILED, 'Cannot resolve the current HOME package');
    }
    let journalAvailable = true;
    const recovering = action === 'enable';
    const outcome = {};
    if (pkgs === 'all') {
      let disabledByUs = [];
      try { disabledByUs = await journal.disabledByUs(info.deviceId); }
      catch (error) { journalAvailable = false; warnJournal(error, outcome); }
      let baseline;
      try { baseline = await journal.readBaseline(info.deviceId); }
      catch (error) { warnJournal(error, outcome); }
      const disabledBefore = new Set(baseline?.disabledBefore ?? []);
      pkgs = [...new Set([
        ...disabledByUs,
        ...(await client.listPackages(serial, { disabledOnly: true }))
          .filter(pkg => (index.has(pkg) || STOCK_LAUNCHERS.includes(pkg)) && !disabledBefore.has(pkg)),
      ])];
    }
    const results = [];
    let baselineChecked = false;
    for (const pkg of pkgs) {
      const permission = action === 'disable'
        ? canDisable(pkg, { entry: index.get(pkg), homePackage: info.homePackage })
        : isValidPackageName(pkg) ? { ok: true } : { ok: false, reason: ErrorCode.INVALID_INPUT };
      let result;
      if (!permission.ok) {
        result = { package: pkg, result: 'skipped', reason: permission.reason };
      } else {
        if (action === 'disable' && !baselineChecked) {
          await ensureBaseline(serial, info, outcome);
          baselineChecked = true;
        }
        const record = status => ({ at: new Date().toISOString(), action, package: pkg, status });
        if (recovering) await appendRecovery(journal, info.deviceId, record('pending'), outcome);
        else if (journalAvailable) await journal.append(info.deviceId, record('pending'));
        let reason;
        try {
          const accepted = await (action === 'disable' ? client.disableUser(serial, pkg) : client.enableUser(serial, pkg));
          const installed = await client.listPackages(serial);
          const disabled = await client.listPackages(serial, { disabledOnly: true });
          const verified = installed.includes(pkg) && disabled.includes(pkg) === (action === 'disable');
          if (!accepted || !verified) reason = ErrorCode.COMMAND_FAILED;
        } catch (error) {
          reason = error.code ?? ErrorCode.COMMAND_FAILED;
        }
        const finalRecord = { ...record(reason ? 'failed' : 'ok'), ...(reason ? { error: reason } : {}) };
        if (recovering) await appendRecovery(journal, info.deviceId, finalRecord, outcome);
        else if (journalAvailable) await journal.append(info.deviceId, finalRecord);
        result = { package: pkg, result: reason ? 'failed' : action === 'disable' ? 'disabled' : 'enabled',
          ...(reason ? { reason } : {}) };
      }
      results.push(result);
      onProgress({ done: results.length, total: pkgs.length, ...result });
    }
    if (restoreAll) {
      const stocks = STOCK_LAUNCHERS.filter(pkg => installed.includes(pkg));
      let homeHealthy = false;
      try {
        const home = await client.resolveHomeActivity(serial);
        homeHealthy = home !== 'android' && !REPLACEMENT_LAUNCHERS.some(entry => entry.package === home)
          && (await client.listPackages(serial)).includes(home)
          && !(await client.listPackages(serial, { disabledOnly: true })).includes(home)
          && await actualHome(serial) === home;
      } catch { /* An unverifiable HOME still needs the shared restoration attempt. */ }
      if (!homeHealthy && !await restoreHome(serial, stocks)) {
        results.push({ package: stocks[0] ?? info.homePackage ?? REPLACEMENT_LAUNCHERS[0].package, result: 'failed',
          reason: stocks.length ? ErrorCode.LAUNCHER_RESTORE_FAILED : ErrorCode.LAUNCHER_STOCK_MISSING });
        if (stocks.length) outcome.manualHomePackage = stocks[0];
      }
    }
    return {
      succeeded: results.filter(item => ['disabled', 'enabled'].includes(item.result)).length,
      failed: results.filter(item => item.result === 'failed').length,
      skipped: results.filter(item => item.result === 'skipped').length,
      results,
      ...outcome,
    };
  }

  const { checkLauncherHealth, restoreHome, actualHome, ...launcherActions } = createLauncherActions({ client, journal, context, ensureBaseline });
  return {
    ...launcherActions,
    /** @param {string} serial */
    async inspect(serial) {
      const ctx = await context(serial);
      const recovery = await checkLauncherHealth(serial, ctx);
      const { info, matched, index, installed } = ctx;
      let disabledByUs = [];
      try { disabledByUs = await journal.disabledByUs(info.deviceId); }
      catch { /* Detection is unavailable when the journal cannot be read. */ }
      const disabled = new Set(await client.listPackages(serial, { disabledOnly: true }));
      const reenabled = disabledByUs.filter(pkg => installed.includes(pkg) && !disabled.has(pkg));
      return { info, presets: matched.map(preset => preset.id),
        packages: await getPackageStates(client, serial, index, info.homePackage, installed), reenabled, ...recovery };
    },
    /** @param {string} serial @param {string[]} pkgs @param {(progress: { done: number, total: number, package: string, result: string, reason?: string }) => void} [onProgress] */
    disable(serial, pkgs, onProgress) {
      if (!Array.isArray(pkgs)) throw new CleanTvError(ErrorCode.INVALID_INPUT);
      return act(serial, pkgs, 'disable', onProgress);
    },
    /** @param {string} serial @param {string[] | 'all'} pkgs @param {(progress: { done: number, total: number, package: string, result: string, reason?: string }) => void} [onProgress] */
    restore(serial, pkgs, onProgress) { return act(serial, pkgs, 'enable', onProgress); },
    /** @param {string} serial */
    async history(serial) {
      const { info } = await context(serial);
      try {
        const records = (await journal.read(info.deviceId)).filter(record => record.action !== 'swap');
        return records.filter((record, i) => record.status !== 'pending'
          || !records.slice(i + 1).some(later => later.package === record.package && later.action === record.action))
          .reverse().map(record => ({
          at: record.at, action: record.action, package: record.package,
          result: record.status === 'ok' ? (record.action === 'disable' ? 'disabled' : 'enabled') : record.status,
        }));
      } catch { return []; }
    },
  };
}
