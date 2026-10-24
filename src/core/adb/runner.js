import { execFile } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { CleanTvError, ErrorCode } from '../errors.js';

/** @typedef {(args: string[], options?: { timeoutMs?: number }) => Promise<{ stdout: string, stderr: string, code: number }>} Runner */

/** @param {string} adbPath @returns {Runner} */
export function createRunner(adbPath) {
  return (args, { timeoutMs = 15000 } = {}) => new Promise((resolve, reject) => {
    if (!isAbsolute(adbPath)) {
      reject(new CleanTvError(ErrorCode.ADB_NOT_FOUND, 'ADB path must be absolute', { adbPath }));
      return;
    }
    execFile(adbPath, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8', windowsHide: true },
      (error, stdout, stderr) => {
        if (error?.code === 'ENOENT') {
          reject(new CleanTvError(ErrorCode.ADB_NOT_FOUND, 'ADB binary not found', { adbPath }));
        } else if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
          reject(new CleanTvError(ErrorCode.COMMAND_FAILED, error.message));
        } else if (error?.killed) {
          reject(new CleanTvError(ErrorCode.TIMEOUT, 'ADB command timed out', { timeoutMs }));
        } else if (error && typeof error.code !== 'number') {
          reject(new CleanTvError(ErrorCode.COMMAND_FAILED, error.message));
        } else {
          resolve({ stdout, stderr, code: error?.code ?? 0 });
        }
      });
  });
}
