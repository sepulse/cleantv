import { NEVER_TOUCH } from '../core/safety.js';
import { CleanTvError, ErrorCode } from '../core/errors.js';
import { assertReplacement, REPLACEMENT_LAUNCHERS, STOCK_LAUNCHERS } from '../core/launchers.js';

const serial = '192.168.1.50:5555';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/** An isolated, in-memory TV; package data comes from the real registry. */
export function createDemoClient(presets) {
  const installed = new Set([...NEVER_TOUCH].filter(pkg => !pkg.startsWith('com.cvte.')).concat(presets
    .filter(preset => ['common-android-tv', 'google-tv'].includes(preset.id))
    .flatMap(preset => preset.packages.map(entry => entry.package))));
  const disabled = new Set();
  let attempts = 0;
  let connected = false;
  let preferredHome;
  const homePackages = [...STOCK_LAUNCHERS, ...REPLACEMENT_LAUNCHERS.map(entry => entry.package)];
  const validate = value => {
    if (value !== serial) throw new CleanTvError(ErrorCode.DEVICE_UNREACHABLE);
  };
  return {
    async connect(ip, port = 5555) {
      validate(`${ip}:${port}`);
      connected = true;
      return { serial, state: ++attempts <= 2 ? 'unauthorized' : 'device' };
    },
    async disconnect(value) { validate(value); connected = false; attempts = 0; },
    async devices() {
      return connected ? [{ serial, state: attempts <= 2 ? 'unauthorized' : 'device', model: 'Chromecast' }] : [];
    },
    async getprops(value) {
      validate(value);
      return { 'ro.serialno': 'CLEANTV_DEMO', 'ro.product.brand': 'google',
        'ro.product.manufacturer': 'Google', 'ro.product.model': 'Chromecast',
        'ro.build.version.release': '14', 'ro.build.version.sdk': '34' };
    },
    async getSettings(value) {
      validate(value);
      return { 'global/private_dns_mode': 'opportunistic', 'global/private_dns_specifier': null,
        'secure/screensaver_components': 'com.google.android.backdrop/.Backdrop',
        'global/window_animation_scale': '1.0', 'global/transition_animation_scale': '1.0',
        'global/animator_duration_scale': '1.0' };
    },
    async listPackages(value, { disabledOnly = false } = {}) {
      validate(value);
      return [...(disabledOnly ? disabled : installed)];
    },
    async resolveHomeActivity(value) {
      validate(value);
      return [preferredHome, ...homePackages].find(pkg => installed.has(pkg) && !disabled.has(pkg)) ?? null;
    },
    async resolveHomeComponent(value) {
      const pkg = await this.resolveHomeActivity(value);
      return pkg && `${pkg}/.HomeActivity`;
    },
    async pressHome(value) { validate(value); },
    async focusedPackage(value) { return this.resolveHomeActivity(value); },
    async listHomeCandidateComponents(value) {
      return (await this.listHomeCandidates(value)).map(pkg => `${pkg}/.HomeActivity`);
    },
    async setHomeActivity(value, component) {
      const candidates = await this.listHomeCandidateComponents(value);
      if (!candidates.includes(component)) throw new CleanTvError(ErrorCode.INVALID_INPUT);
      preferredHome = component.split('/')[0];
    },
    async listHomeCandidates(value) {
      validate(value);
      return homePackages.filter(pkg => installed.has(pkg) && !disabled.has(pkg));
    },
    async openPlayStore(value, pkg) {
      validate(value);
      assertReplacement(pkg);
      installed.add(pkg);
      disabled.delete(pkg);
    },
    async disableUser(value, pkg) {
      validate(value);
      await delay(300);
      if (!installed.has(pkg)) return false;
      disabled.add(pkg);
      return true;
    },
    async enableUser(value, pkg) {
      validate(value);
      await delay(300);
      if (!installed.has(pkg)) return false;
      disabled.delete(pkg);
      return true;
    },
  };
}

export async function scanDemo({ signal }) {
  await delay(1500);
  signal?.throwIfAborted();
  return [{ ip: '192.168.1.50', port: 5555 }];
}
