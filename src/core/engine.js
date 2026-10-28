import { getDeviceInfo } from './device.js';
import { getPackageStates } from './packages.js';
import { buildEntryIndex, matchPresets } from './registry.js';
import { canDisable, isValidPackageName, isValidSerial } from './safety.js';
import { CleanTvError, ErrorCode } from './errors.js';
import { createLauncherActions, STOCK_LAUNCHERS, REPLACEMENT_LAUNCHERS } from './launchers.js';
import { appendRecovery, warnJournal } from './journal.js';
import { privateDnsFor, assertPrivateDns } from './dns.js';
import { BUNDLED_LAUNCHER } from './bundled-launcher.js';

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
      const existing = await journal.readBaseline(info.deviceId);
      if (existing !== null) return existing;
      // A late baseline must not record packages CleanTV already touched as original state.
      const records = await journal.read(info.deviceId);
      const touched = new Set(records.flatMap(record =>
        record.action === 'disable' ? [record.package] : record.action === 'swap' ? record.disabled ?? [] : []));
      const disabledBefore = (await client.listPackages(serial, { disabledOnly: true }))
        .filter(pkg => !touched.has(pkg));
      const props = await client.getprops(serial);
      const settings = await client.getSettings(serial);
      // DNS that CleanTV may already have changed is unknown, never original state.
      if (records.some(record => record.action === 'dns')) {
        delete settings['global/private_dns_mode'];
        delete settings['global/private_dns_specifier'];
      }
      await journal.saveBaseline(info.deviceId, {
        at: new Date().toISOString(), disabledBefore,
        props: Object.fromEntries(['ro.product.brand', 'ro.product.manufacturer', 'ro.product.model',
          'ro.build.version.release', 'ro.build.fingerprint'].map(key => [key, props[key] ?? ''])),
        settings,
        homeComponent: await client.resolveHomeComponent(serial),
      });
      return await journal.readBaseline(info.deviceId);
    } catch (error) { warnJournal(error, outcome); }
  }

  const baselineDns = baseline => ({ mode: baseline?.settings?.['global/private_dns_mode'],
    specifier: baseline?.settings?.['global/private_dns_specifier'] });

  async function changeDns(serial, info, settings, provider, outcome, restoring = false) {
    const record = status => ({ at: new Date().toISOString(), action: 'dns', provider, status });
    if (restoring) await appendRecovery(journal, info.deviceId, record('pending'), outcome);
    else await journal.append(info.deviceId, record('pending'));
    let reason;
    try {
      await (restoring ? client.restorePrivateDns(serial, settings) : client.setPrivateDns(serial, settings));
    } catch (error) { reason = error.code ?? ErrorCode.COMMAND_FAILED; }
    const finalRecord = { ...record(reason ? 'failed' : 'ok'), ...(reason ? { error: reason } : {}) };
    if (restoring) await appendRecovery(journal, info.deviceId, finalRecord, outcome);
    else await journal.append(info.deviceId, finalRecord);
    return { action: 'dns', provider, result: reason ? 'failed' : restoring ? 'restored' : 'configured',
      ...(reason ? { reason } : {}) };
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
    let baseline;
    let restoreDns = false;
    if (pkgs === 'all') {
      let disabledByUs = [];
      try { disabledByUs = await journal.disabledByUs(info.deviceId); }
      catch (error) { journalAvailable = false; warnJournal(error, outcome); }
      try { baseline = await journal.readBaseline(info.deviceId); }
      catch (error) { warnJournal(error, outcome); }
      // Even a failed/interrupted pair of settings writes may have changed one key.
      try { restoreDns = (await journal.read(info.deviceId)).some(record => record.action === 'dns'); }
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
      onProgress({ done: results.length, total: pkgs.length + Number(restoreDns), ...result });
    }
    if (restoreDns) {
      const result = await changeDns(serial, info, baselineDns(baseline), 'baseline', outcome, true);
      results.push(result);
      onProgress({ done: results.length, total: results.length, ...result });
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
      // Prefer the saved original component, including a user-installed original HOME.
      const original = baseline?.homeComponent;
      // If the saved original is gone or disabled, a healthy stock HOME or the usual stock search still applies.
      const homeRestored = (original && await restoreHome(serial, stocks, original))
        || homeHealthy || await restoreHome(serial, stocks);
      if (!homeRestored) {
        results.push({ package: stocks[0] ?? info.homePackage ?? REPLACEMENT_LAUNCHERS[0].package, result: 'failed',
          reason: stocks.length ? ErrorCode.LAUNCHER_RESTORE_FAILED : ErrorCode.LAUNCHER_STOCK_MISSING });
        if (stocks.length) outcome.manualHomePackage = stocks[0];
      }
      let owned = [];
      try { owned = await journal.installedByUs(info.deviceId); }
      catch (error) { warnJournal(error, outcome); }
      if (owned.includes(BUNDLED_LAUNCHER.package) && (await client.listPackages(serial)).includes(BUNDLED_LAUNCHER.package)) {
        const pkg = BUNDLED_LAUNCHER.package;
        let reason;
        try {
          if (!original || !homeRestored || await actualHome(serial) === pkg) throw new CleanTvError(ErrorCode.LAUNCHER_RESTORE_FAILED);
          // Removal requires its own durable intent, even during recovery.
          await journal.append(info.deviceId, { at: new Date().toISOString(), action: 'remove', package: pkg, status: 'pending' });
          await client.removeBundledLauncher(serial, journal, info.deviceId);
          if ((await client.listPackages(serial)).includes(pkg)) throw new CleanTvError(ErrorCode.COMMAND_FAILED);
        } catch (error) { reason = error.code ?? ErrorCode.COMMAND_FAILED; }
        await appendRecovery(journal, info.deviceId, { at: new Date().toISOString(), action: 'remove', package: pkg,
          status: reason ? 'failed' : 'ok', ...(reason ? { error: reason } : {}) }, outcome);
        const result = { package: pkg, result: reason ? 'failed' : 'removed', ...(reason ? { reason } : {}) };
        results.push(result);
        onProgress({ done: results.length, total: results.length, ...result });
      }
    }
    return {
      succeeded: results.filter(item => ['disabled', 'enabled', 'restored', 'removed'].includes(item.result)).length,
      failed: results.filter(item => item.result === 'failed').length,
      skipped: results.filter(item => item.result === 'skipped').length,
      results,
      ...outcome,
    };
  }

  const { checkLauncherHealth, restoreHome, actualHome, ...launcherActions } = createLauncherActions({ client, journal, context, ensureBaseline });
  return {
    ...launcherActions,
    /** @param {string} serial @param {string} provider @param {Function} [onProgress] */
    async setDns(serial, provider, onProgress = () => {}) {
      const settings = privateDnsFor(provider);
      const { info } = await context(serial);
      const outcome = {};
      const baseline = await ensureBaseline(serial, info, outcome);
      if (!baseline) throw new CleanTvError(ErrorCode.COMMAND_FAILED, 'Cannot save the original DNS settings');
      assertPrivateDns(baselineDns(baseline), true);
      const result = await changeDns(serial, info, settings, provider, outcome);
      onProgress({ done: 1, total: 1, ...result });
      return { succeeded: result.result === 'configured' ? 1 : 0, failed: result.result === 'failed' ? 1 : 0,
        results: [result], ...outcome };
    },
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
        const records = (await journal.read(info.deviceId)).filter(record => ['disable', 'enable'].includes(record.action));
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
