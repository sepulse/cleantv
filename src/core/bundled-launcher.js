import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CleanTvError, ErrorCode } from './errors.js';

export const BUNDLED_LAUNCHER = Object.freeze({ package: 'io.github.sepulse.cleantv.home',
  name: 'CleanTV Home', source: 'bundled', minSdk: 26 });
export const BUNDLED_APK = resolve(import.meta.dirname, '../../launcher/cleantv-home.apk');
const SUMS = resolve(import.meta.dirname, '../../launcher/SHA256SUMS.txt');

/** Only the fixed application asset can be installed; the reader is injectable for tests. */
export async function verifyBundledLauncher(read = readFile) {
  try {
    const apk = await read(BUNDLED_APK);
    const sums = await read(SUMS, 'utf8');
    const match = sums.trim().match(/^([a-f0-9]{64})  cleantv-home\.apk$/);
    if (!match || createHash('sha256').update(apk).digest('hex') !== match[1]) throw new Error('SHA-256 mismatch');
  } catch (error) {
    throw new CleanTvError(ErrorCode.COMMAND_FAILED, `Bundled launcher verification failed: ${error.message}`);
  }
}

/** A completed fresh install is ownership evidence; a completed removal revokes it. */
export function ownsBundledLauncher(records) {
  let pending = false;
  let owned = false;
  for (const record of records) {
    if (record.package !== BUNDLED_LAUNCHER.package) continue;
    if (record.action === 'install') {
      if (record.status === 'pending') pending = record.absentBefore === true;
      else {
        if (record.status === 'ok' && record.absentBefore === true && pending) owned = true;
        pending = false;
      }
    }
    if (record.action === 'remove' && record.status === 'ok') owned = false;
  }
  return owned;
}
