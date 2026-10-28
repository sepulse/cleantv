import { CleanTvError, ErrorCode } from '../errors.js';
import { isValidPackageName, isValidSerial } from '../safety.js';
import { assertReplacement } from '../launchers.js';
import { assertPrivateDns } from '../dns.js';
import { assertZone } from '../jakim-zones.js';
import { BUNDLED_LAUNCHER, BUNDLED_APK, verifyBundledLauncher, ownsBundledLauncher } from '../bundled-launcher.js';

const homeComponent = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*\/(?:\.?[A-Za-z_][A-Za-z0-9_]*)(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const parseHomeComponents = output => [...new Set(output.split(/\r?\n/).map(line => line.trim())
  .filter(line => homeComponent.test(line) && (isValidPackageName(line.split('/')[0]) || line.startsWith('android/'))))];
const isFactoryHome = pkg => /factory|(?:^|[._])test(?:[._]|$)/i.test(pkg);

/** @param {string} output @returns {string | null} */
export function parseFocusedPackage(output) {
  const packages = new Set();
  for (const marker of [/\bmFocusedApp\s*=/, /\b(?:mResumedActivity|topResumedActivity|ResumedActivity)\s*[:=]/]) {
    for (const line of output.split(/\r?\n/)) {
      if (!marker.test(line)) continue;
      const match = line.match(/\bu\d+\s+([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)\//);
      if (match && (match[1] === 'android' || isValidPackageName(match[1]))) packages.add(match[1]);
    }
  }
  return packages.size === 1 ? [...packages][0] : null;
}

/** @param {import('./runner.js').Runner} run */
export function createAdbClient(run, { readBundledFile } = {}) {
  function validate(serial, pkg) {
    if (!isValidSerial(serial) || (arguments.length > 1 && !isValidPackageName(pkg))) {
      throw new CleanTvError(ErrorCode.INVALID_INPUT);
    }
  }

  async function checked(args, options) {
    const response = await run(args, options);
    if (response.code !== 0) {
      throw new CleanTvError(ErrorCode.COMMAND_FAILED, response.stderr || response.stdout, response);
    }
    return response.stdout;
  }

  async function writePrivateDns(serial, { mode, specifier }) {
    if (specifier === null) await checked(['-s', serial, 'shell', 'settings', 'delete', 'global', 'private_dns_specifier']);
    else await checked(['-s', serial, 'shell', 'settings', 'put', 'global', 'private_dns_specifier', specifier]);
    if (mode === null) await checked(['-s', serial, 'shell', 'settings', 'delete', 'global', 'private_dns_mode']);
    else await checked(['-s', serial, 'shell', 'settings', 'put', 'global', 'private_dns_mode', mode]);
    const settings = await client.getSettings(serial);
    if (settings['global/private_dns_mode'] !== mode || settings['global/private_dns_specifier'] !== specifier) {
      throw new CleanTvError(ErrorCode.COMMAND_FAILED, 'Private DNS verification failed');
    }
  }

  const client = {
    /** @param {string} ip @param {number} [port] */
    async connect(ip, port = 5555) {
      const serial = `${ip}:${port}`;
      validate(serial);
      let response;
      try { response = await run(['connect', serial]); }
      catch (error) {
        if (error.code === ErrorCode.TIMEOUT) return { serial, state: 'unreachable' };
        throw error;
      }
      if (response.code !== 0 || /(?:failed|cannot)\s+connect|failed to connect/i.test(`${response.stdout}\n${response.stderr}`)) {
        return { serial, state: 'unreachable' };
      }
      // A failed device check after a successful connect is not proof that the port is closed.
      const device = (await client.devices()).find(item => item.serial === serial);
      return { serial, state: device?.state ?? 'unreachable' };
    },
    /** @param {string} serial */
    async disconnect(serial) {
      validate(serial);
      await checked(['disconnect', serial]);
    },
    /** @param {string} serial */
    async usbMode(serial) {
      validate(serial);
      await checked(['-s', serial, 'usb']);
    },
    /** @returns {Promise<Array<{ serial: string, state: string, model?: string }>>} */
    async devices() {
      const output = await checked(['devices', '-l']);
      return output.split(/\r?\n/).flatMap(line => {
        const [serial, state, ...fields] = line.trim().split(/\s+/);
        if (!isValidSerial(serial) || !['device', 'unauthorized', 'offline'].includes(state)) return [];
        const model = fields.find(field => field.startsWith('model:'))?.slice(6);
        return [{ serial, state, ...(model ? { model } : {}) }];
      });
    },
    /** @param {string} serial @returns {Promise<Record<string, string>>} */
    async getprops(serial) {
      validate(serial);
      const output = await checked(['-s', serial, 'shell', 'getprop']);
      return Object.fromEntries(output.split(/\r?\n/).flatMap(line => {
        const match = line.match(/^\[([^\]]+)\]: \[(.*)\]$/);
        return match ? [[match[1], match[2]]] : [];
      }));
    },
    /** @param {string} serial @returns {Promise<Record<string, string | null>>} */
    async getSettings(serial) {
      validate(serial);
      const settings = {};
      for (const [namespace, key] of [
        ['global', 'private_dns_mode'], ['global', 'private_dns_specifier'],
        ['secure', 'screensaver_components'], ['global', 'window_animation_scale'],
        ['global', 'transition_animation_scale'], ['global', 'animator_duration_scale'],
      ]) {
        const value = (await checked(['-s', serial, 'shell', 'settings', 'get', namespace, key])).trim();
        settings[`${namespace}/${key}`] = value === 'null' ? null : value;
      }
      return settings;
    },
    /** @param {string} serial @param {{ mode: 'off' | 'opportunistic' | 'hostname', specifier: string | null }} settings */
    async setPrivateDns(serial, settings) {
      validate(serial);
      assertPrivateDns(settings);
      await writePrivateDns(serial, settings);
    },
    /** @param {string} serial @param {{ mode: string | null, specifier: string | null }} settings */
    async restorePrivateDns(serial, settings) {
      validate(serial);
      assertPrivateDns(settings, true);
      await writePrivateDns(serial, settings);
    },
    /** @param {string} serial @param {{ disabledOnly?: boolean }} [options] @returns {Promise<string[]>} */
    async listPackages(serial, { disabledOnly = false } = {}) {
      validate(serial);
      const output = await checked(['-s', serial, 'shell', 'pm', 'list', 'packages', '--user', '0',
        ...(disabledOnly ? ['-d'] : [])]);
      return output.split(/\r?\n/).map(line => line.trim())
        .filter(line => line.startsWith('package:')).map(line => line.slice(8));
    },
    /** @param {string} serial @param {string} pkg @returns {Promise<boolean>} */
    async disableUser(serial, pkg) {
      validate(serial, pkg);
      const output = await checked(['-s', serial, 'shell', 'pm', 'disable-user', '--user', '0', pkg]);
      return /new state: disabled-user(?:\s|$)/.test(output);
    },
    /** @param {string} serial @param {string} pkg @returns {Promise<boolean>} */
    async enableUser(serial, pkg) {
      validate(serial, pkg);
      const output = await checked(['-s', serial, 'shell', 'pm', 'enable', '--user', '0', pkg]);
      return /new state: enabled(?:\s|$)/.test(output);
    },
    /** @param {string} serial */
    async installBundledLauncher(serial) {
      validate(serial);
      const sdk = (await client.getprops(serial))['ro.build.version.sdk'];
      if (!/^\d+$/.test(sdk) || Number(sdk) < BUNDLED_LAUNCHER.minSdk) {
        throw new CleanTvError(ErrorCode.LAUNCHER_UNSUPPORTED);
      }
      await verifyBundledLauncher(readBundledFile);
      // A slow TV can need much longer than the 15 s default to install.
      const output = await checked(['-s', serial, 'install', '-r', BUNDLED_APK], { timeoutMs: 120000 });
      if (!/^Success\s*$/m.test(output) || /Failure|Error:/i.test(output)) throw new CleanTvError(ErrorCode.COMMAND_FAILED);
    },
    /** Fixed package only, with durable journal evidence checked at the command boundary. */
    async removeBundledLauncher(serial, journal, deviceId) {
      validate(serial);
      if (!ownsBundledLauncher(await journal.read(deviceId))) throw new CleanTvError(ErrorCode.PACKAGE_PROTECTED);
      const output = await checked(['-s', serial, 'uninstall', 'io.github.sepulse.cleantv.home']);
      if (!/^Success\s*$/m.test(output) || /Failure|Error:/i.test(output)) throw new CleanTvError(ErrorCode.COMMAND_FAILED);
    },
    /** Sets the JAKIM zone of CleanTV Home's prayer-times panel; only a listed zone code is sent. */
    async setPrayerZone(serial, zone) {
      validate(serial);
      assertZone(zone);
      const output = await checked(['-s', serial, 'shell', 'am', 'broadcast', '-n',
        `${BUNDLED_LAUNCHER.package}/com.gathin.tvhome.PrayerConfig`, '--es', 'zone', zone]);
      // A broadcast nobody receives still completes; only the launcher's own answer proves the zone was set.
      if (!output.includes(`data="zone=${zone}"`)) throw new CleanTvError(ErrorCode.COMMAND_FAILED);
    },
    /** @param {string} serial @param {string} pkg */
    async openPlayStore(serial, pkg) {
      validate(serial, pkg);
      assertReplacement(pkg);
      if (pkg === BUNDLED_LAUNCHER.package) throw new CleanTvError(ErrorCode.INVALID_INPUT);
      const output = await checked(['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW',
        '-d', `market://details?id=${pkg}`]);
      if (/Error:|Exception|unable to resolve/i.test(output)) throw new CleanTvError(ErrorCode.COMMAND_FAILED);
    },
    /** @param {string} serial @returns {Promise<string[]>} */
    async listHomeCandidates(serial) {
      return [...new Set((await client.listHomeCandidateComponents(serial)).map(component => component.split('/')[0]))];
    },
    /** @param {string} serial @returns {Promise<string[]>} */
    async listHomeCandidateComponents(serial) {
      validate(serial);
      const output = await checked(['-s', serial, 'shell', 'cmd', 'package', 'query-activities',
        '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.HOME']);
      return parseHomeComponents(output).filter(component => !isFactoryHome(component.split('/')[0]));
    },
    /** @param {string} serial */
    async pressHome(serial) {
      validate(serial);
      await checked(['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_HOME']);
    },
    /** @param {string} serial @returns {Promise<string | null>} */
    async focusedPackage(serial) {
      validate(serial);
      return parseFocusedPackage(await checked(['-s', serial, 'shell', 'dumpsys', 'activity', 'activities']));
    },
    /** @param {string} serial @param {string} component */
    async setHomeActivity(serial, component) {
      validate(serial);
      if (typeof component !== 'string' || component.trim() !== component || !homeComponent.test(component)
        || !isValidPackageName(component.split('/')[0])) throw new CleanTvError(ErrorCode.INVALID_INPUT);
      const output = await checked(['-s', serial, 'shell', 'cmd', 'package', 'set-home-activity', component]);
      if (/Error:|Exception|failed/i.test(output)) throw new CleanTvError(ErrorCode.COMMAND_FAILED);
    },
    /** @param {string} serial @returns {Promise<string | null>} */
    async resolveHomeActivity(serial) {
      return (await client.resolveHomeComponent(serial))?.split('/')[0] ?? null;
    },
    /** @param {string} serial @returns {Promise<string | null>} */
    async resolveHomeComponent(serial) {
      validate(serial);
      const output = await checked(['-s', serial, 'shell', 'cmd', 'package', 'resolve-activity',
        '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.HOME']);
      return parseHomeComponents(output).at(-1) ?? null;
    },
  };
  return client;
}
