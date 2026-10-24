import { canDisable } from './safety.js';
import { ErrorCode } from './errors.js';

/**
 * @param {ReturnType<typeof import('./adb/client.js').createAdbClient>} client
 * @param {string} serial
 * @param {Map<string, import('./registry.js').Entry>} index
 * @param {string | null} homePackage
 * @param {string[]} [installedPackages] Reuse an existing snapshot when supplied.
 */
export async function getPackageStates(client, serial, index, homePackage, installedPackages) {
  const installed = new Set(installedPackages ?? await client.listPackages(serial));
  const disabled = new Set(await client.listPackages(serial, { disabledOnly: true }));
  return [...index.values()].map(entry => {
    let permission = canDisable(entry.package, { entry, homePackage });
    if (permission.ok && !homePackage) permission = { ok: false, reason: ErrorCode.COMMAND_FAILED };
    return {
      ...entry,
      installed: installed.has(entry.package),
      enabled: installed.has(entry.package) && !disabled.has(entry.package),
      canDisable: installed.has(entry.package) && permission.ok,
      ...(!permission.ok ? { blockedReason: permission.reason } : {}),
    };
  });
}
