import { CleanTvError, ErrorCode } from './errors.js';

/** @param {unknown} value @returns {boolean} */
export function isValidPackageName(value) {
  return typeof value === 'string' && value.length <= 255 && value.trim() === value
    && /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(value);
}

/** @param {unknown} value @returns {boolean} */
export function isValidSerial(value) {
  if (typeof value !== 'string' || value.trim() !== value || !/^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$/.test(value)) return false;
  const [ip, port] = value.split(':');
  return ip.split('.').every(part => Number(part) <= 255)
    && Number(port) >= 1 && Number(port) <= 65535;
}

export const NEVER_TOUCH = new Set([
  'android', 'com.android.systemui', 'com.android.settings', 'com.android.tv.settings',
  'com.android.vending', 'com.google.android.gms', 'com.google.android.gsf',
  'com.android.packageinstaller', 'com.google.android.packageinstaller',
  'com.android.permissioncontroller', 'com.google.android.permissioncontroller',
  'com.android.shell', 'com.android.bluetooth', 'com.android.providers.settings',
  'com.android.providers.media', 'com.android.providers.downloads',
  'com.android.providers.contacts', 'com.android.webview', 'com.google.android.webview',
  'com.android.inputmethod.latin', 'com.google.android.inputmethod.latin',
  'com.google.android.leanback.ime', 'com.google.android.tvlauncher',
  'com.google.android.apps.tv.launcherx', 'com.google.android.tungsten.setupwraith',
  'com.google.android.tv.remote.service', 'com.android.networkstack',
  'com.google.android.networkstack', 'com.android.wifi.resources',
  'com.android.phone', 'com.android.keychain',
]);
// Freezing a Set alone does not protect its contents.
for (const method of ['add', 'delete', 'clear']) {
  Object.defineProperty(NEVER_TOUCH, method, {
    value() { throw new TypeError('NEVER_TOUCH is read-only'); },
  });
}
Object.freeze(NEVER_TOUCH);

/**
 * @param {string} pkg
 * @param {{ entry?: { risk: string }, homePackage?: string | null }} context
 * @returns {void}
 */
export function assertCanDisable(pkg, { entry, homePackage } = {}) {
  if (!isValidPackageName(pkg)) throw new CleanTvError(ErrorCode.INVALID_INPUT);
  if (NEVER_TOUCH.has(pkg) || pkg.startsWith('com.android.providers.')) {
    throw new CleanTvError(ErrorCode.PACKAGE_PROTECTED);
  }
  if (!entry) throw new CleanTvError(ErrorCode.PACKAGE_NOT_IN_REGISTRY);
  if (entry.risk !== 'green' && entry.risk !== 'yellow') throw new CleanTvError(ErrorCode.PACKAGE_PROTECTED);
  if (pkg === homePackage) throw new CleanTvError(ErrorCode.PACKAGE_IS_LAUNCHER);
}

/**
 * @param {string} pkg
 * @param {{ entry?: { risk: string }, homePackage?: string | null }} [context]
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function canDisable(pkg, context) {
  try {
    assertCanDisable(pkg, context);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.code };
  }
}
