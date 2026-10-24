import { CleanTvError, ErrorCode } from '../core/errors.js';

const statuses = {
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.DEVICE_BUSY]: 409,
  [ErrorCode.DEVICE_UNAUTHORIZED]: 409,
  [ErrorCode.DEVICE_OFFLINE]: 409,
  [ErrorCode.DEVICE_UNREACHABLE]: 404,
  [ErrorCode.PACKAGE_PROTECTED]: 422,
  [ErrorCode.PACKAGE_NOT_IN_REGISTRY]: 422,
  [ErrorCode.PACKAGE_IS_LAUNCHER]: 422,
  [ErrorCode.ADB_NOT_FOUND]: 503,
  [ErrorCode.TIMEOUT]: 504,
  [ErrorCode.COMMAND_FAILED]: 502,
};

/** @param {unknown} error @returns {{ status: number, code: string, message: string }} */
export function publicError(error) {
  if (error instanceof CleanTvError && statuses[error.code]) {
    return { status: error.code === ErrorCode.INVALID_INPUT && error.details?.tooLarge ? 413 : statuses[error.code],
      code: error.code, message: error.message };
  }
  console.error(error);
  return { status: 500, code: ErrorCode.INTERNAL, message: 'Internal server error' };
}

/** @param {import('node:http').ServerResponse} response @param {unknown} error */
export function sendError(response, error) {
  const { status, code, message } = publicError(error);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: { code, message } }));
}
