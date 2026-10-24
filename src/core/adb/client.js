import { CleanTvError, ErrorCode } from '../errors.js';
import { isValidPackageName, isValidSerial } from '../safety.js';

/** @param {import('./runner.js').Runner} run */
export function createAdbClient(run) {
  function validate(serial, pkg) {
    if (!isValidSerial(serial) || (arguments.length > 1 && !isValidPackageName(pkg))) {
      throw new CleanTvError(ErrorCode.INVALID_INPUT);
    }
  }

  async function checked(args) {
    const response = await run(args);
    if (response.code !== 0) {
      throw new CleanTvError(ErrorCode.COMMAND_FAILED, response.stderr || response.stdout, response);
    }
    return response.stdout;
  }

  const client = {
    /** @param {string} ip @param {number} [port] */
    async connect(ip, port = 5555) {
      const serial = `${ip}:${port}`;
      validate(serial);
      try {
        const response = await run(['connect', serial]);
        if (response.code !== 0 || /(?:failed|cannot)\s+connect|failed to connect/i.test(`${response.stdout}\n${response.stderr}`)) {
          return { serial, state: 'unreachable' };
        }
        const device = (await client.devices()).find(item => item.serial === serial);
        return { serial, state: device?.state ?? 'unreachable' };
      } catch (error) {
        if (error.code === ErrorCode.TIMEOUT) return { serial, state: 'unreachable' };
        throw error;
      }
    },
    /** @param {string} serial */
    async disconnect(serial) {
      validate(serial);
      await checked(['disconnect', serial]);
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
    /** @param {string} serial @returns {Promise<string | null>} */
    async resolveHomeActivity(serial) {
      validate(serial);
      const output = await checked(['-s', serial, 'shell', 'cmd', 'package', 'resolve-activity',
        '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.HOME']);
      const packages = output.split(/\r?\n/).map(line => line.trim().match(/^([^/\s]+)\/[^\s]+$/)?.[1])
        .filter(pkg => isValidPackageName(pkg));
      return packages.at(-1) ?? null;
    },
  };
  return client;
}
