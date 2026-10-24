import { stat } from 'node:fs/promises';
import { resolve, win32, posix } from 'node:path';
import { createRunner } from './runner.js';
import { CleanTvError, ErrorCode } from '../errors.js';

/**
 * @param {{ env?: NodeJS.ProcessEnv, platform?: string, exists?: (path: string) => Promise<boolean>, run?: import('./runner.js').Runner }} [options]
 * @returns {Promise<string>}
 */
export async function locateAdb({
  env = process.env,
  platform: osName = process.platform,
  exists = async path => { try { return (await stat(path)).isFile(); } catch { return false; } },
  run,
} = {}) {
  const paths = osName === 'win32' ? win32 : posix;
  if (env.CLEANTV_ADB !== undefined) {
    if (await exists(env.CLEANTV_ADB)) return paths.resolve(env.CLEANTV_ADB);
    throw new CleanTvError(ErrorCode.ADB_NOT_FOUND, 'Configured ADB binary not found', { adbPath: env.CLEANTV_ADB });
  }
  const bundled = resolve(import.meta.dirname, '../../../vendor/platform-tools',
    osName === 'win32' ? 'adb.exe' : 'adb');
  if (await exists(bundled)) return bundled;
  const envValue = name => env[osName === 'win32'
    ? Object.keys(env).find(key => key.toUpperCase() === name) : name];
  const extensions = osName === 'win32' ? (envValue('PATHEXT') ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [''];
  for (const part of (envValue('PATH') ?? '').split(paths.delimiter)) {
    const directory = part.replace(/^"(.*)"$/, '$1');
    if (!paths.isAbsolute(directory)) continue;
    for (const extension of extensions) {
      const candidate = paths.resolve(directory, `adb${extension}`);
      if (!await exists(candidate)) continue;
      try {
        if ((await (run ?? createRunner(candidate))(['version'])).code === 0) return candidate;
      } catch { /* Try all locations before reporting the missing binary. */ }
    }
  }
  throw new CleanTvError(ErrorCode.ADB_NOT_FOUND, 'Install Android platform-tools or set CLEANTV_ADB');
}
