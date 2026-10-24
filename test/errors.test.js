import test from 'node:test';
import assert from 'node:assert/strict';
import { CleanTvError, ErrorCode } from '../src/core/errors.js';

test('error codes match the architecture exactly and are frozen', () => {
  assert.deepEqual(Object.keys(ErrorCode).sort(), [
    'ADB_NOT_FOUND', 'INVALID_INPUT', 'DEVICE_UNREACHABLE', 'DEVICE_UNAUTHORIZED',
    'DEVICE_OFFLINE', 'DEVICE_BUSY', 'PACKAGE_PROTECTED', 'PACKAGE_NOT_IN_REGISTRY',
    'PACKAGE_IS_LAUNCHER', 'COMMAND_FAILED', 'TIMEOUT', 'FORBIDDEN', 'INTERNAL', 'NOT_FOUND',
    'LAUNCHER_NOT_READY', 'LAUNCHER_SWAP_ROLLED_BACK', 'LAUNCHER_ROLLBACK_FAILED', 'LAUNCHER_RESTORE_FAILED',
    'LAUNCHER_STOCK_MISSING',
  ].sort());
  assert.ok(Object.isFrozen(ErrorCode));
  for (const [key, value] of Object.entries(ErrorCode)) assert.equal(key, value);
});

test('CleanTvError preserves code, message and details', () => {
  const details = { package: 'com.example.app' };
  const error = new CleanTvError(ErrorCode.COMMAND_FAILED, 'Failed', details);
  assert.ok(error instanceof Error);
  assert.equal(error.name, 'CleanTvError');
  assert.equal(error.code, 'COMMAND_FAILED');
  assert.equal(error.message, 'Failed');
  assert.equal(error.details, details);
});
