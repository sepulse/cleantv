import { getDeviceInfo } from './device.js';
import { getPackageStates } from './packages.js';
import { buildEntryIndex, matchPresets } from './registry.js';
import { canDisable, isValidPackageName, isValidSerial } from './safety.js';
import { CleanTvError, ErrorCode } from './errors.js';

/**
 * @param {{ client: ReturnType<typeof import('./adb/client.js').createAdbClient>, journal: ReturnType<typeof import('./journal.js').createJournal>, presets: import('./registry.js').Preset[] }} dependencies
 */
export function createEngine({ client, journal, presets }) {
  async function context(serial) {
    if (!isValidSerial(serial)) throw new CleanTvError(ErrorCode.INVALID_INPUT);
    const installed = await client.listPackages(serial);
    const info = await getDeviceInfo(client, serial, installed);
    const matched = matchPresets(presets, info);
    return { info, matched, index: buildEntryIndex(matched), installed };
  }

  async function act(serial, pkgs, action, onProgress = () => {}) {
    if (pkgs !== 'all' && !Array.isArray(pkgs)) throw new CleanTvError(ErrorCode.INVALID_INPUT);
    const { info, index } = await context(serial);
    if (action === 'disable' && !info.homePackage) {
      throw new CleanTvError(ErrorCode.COMMAND_FAILED, 'Cannot resolve the current HOME package');
    }
    let journalAvailable = true;
    if (pkgs === 'all') {
      let disabledByUs = [];
      try { disabledByUs = await journal.disabledByUs(info.deviceId); }
      catch { journalAvailable = false; }
      pkgs = [...new Set([
        ...disabledByUs,
        ...(await client.listPackages(serial, { disabledOnly: true })).filter(pkg => index.has(pkg)),
      ])];
    }
    const results = [];
    for (const pkg of pkgs) {
      const permission = action === 'disable'
        ? canDisable(pkg, { entry: index.get(pkg), homePackage: info.homePackage })
        : isValidPackageName(pkg) ? { ok: true } : { ok: false, reason: ErrorCode.INVALID_INPUT };
      let result;
      if (!permission.ok) {
        result = { package: pkg, result: 'skipped', reason: permission.reason };
      } else {
        const record = status => ({ at: new Date().toISOString(), action, package: pkg, status });
        if (journalAvailable) await journal.append(info.deviceId, record('pending'));
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
        if (journalAvailable) await journal.append(info.deviceId, { ...record(reason ? 'failed' : 'ok'), ...(reason ? { error: reason } : {}) });
        result = { package: pkg, result: reason ? 'failed' : action === 'disable' ? 'disabled' : 'enabled',
          ...(reason ? { reason } : {}) };
      }
      results.push(result);
      onProgress({ done: results.length, total: pkgs.length, ...result });
    }
    return {
      succeeded: results.filter(item => ['disabled', 'enabled'].includes(item.result)).length,
      failed: results.filter(item => item.result === 'failed').length,
      skipped: results.filter(item => item.result === 'skipped').length,
      results,
    };
  }

  return {
    /** @param {string} serial */
    async inspect(serial) {
      const { info, matched, index, installed } = await context(serial);
      return { info, presets: matched.map(preset => preset.id),
        packages: await getPackageStates(client, serial, index, info.homePackage, installed) };
    },
    /** @param {string} serial @param {string[]} pkgs @param {(progress: { done: number, total: number, package: string, result: string, reason?: string }) => void} [onProgress] */
    disable(serial, pkgs, onProgress) {
      if (!Array.isArray(pkgs)) throw new CleanTvError(ErrorCode.INVALID_INPUT);
      return act(serial, pkgs, 'disable', onProgress);
    },
    /** @param {string} serial @param {string[] | 'all'} pkgs @param {(progress: { done: number, total: number, package: string, result: string, reason?: string }) => void} [onProgress] */
    restore(serial, pkgs, onProgress) { return act(serial, pkgs, 'enable', onProgress); },
  };
}
