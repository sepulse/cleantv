export const ErrorCode = Object.freeze({
  ADB_NOT_FOUND: 'ADB_NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  DEVICE_UNREACHABLE: 'DEVICE_UNREACHABLE',
  DEVICE_UNAUTHORIZED: 'DEVICE_UNAUTHORIZED',
  DEVICE_OFFLINE: 'DEVICE_OFFLINE',
  DEVICE_BUSY: 'DEVICE_BUSY',
  PACKAGE_PROTECTED: 'PACKAGE_PROTECTED',
  PACKAGE_NOT_IN_REGISTRY: 'PACKAGE_NOT_IN_REGISTRY',
  PACKAGE_IS_LAUNCHER: 'PACKAGE_IS_LAUNCHER',
  COMMAND_FAILED: 'COMMAND_FAILED',
  TIMEOUT: 'TIMEOUT',
  FORBIDDEN: 'FORBIDDEN',
});

export class CleanTvError extends Error {
  /** @param {string} code @param {string} message @param {unknown} [details] */
  constructor(code, message = code, details) {
    super(message);
    this.name = 'CleanTvError';
    this.code = code;
    this.details = details;
  }
}
