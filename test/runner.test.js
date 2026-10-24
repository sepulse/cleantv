import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRunner } from '../src/core/adb/runner.js';

test('runner accepts output up to 16 MiB and reports overflow as COMMAND_FAILED', async () => {
  const run = createRunner(process.execPath);
  const result = await run(['-e', 'process.stdout.write("x".repeat(16 * 1024 * 1024))']);
  assert.equal(result.stdout.length, 16 * 1024 * 1024);
  assert.equal(result.code, 0);
  for (const stream of ['stdout', 'stderr']) {
    await assert.rejects(run(['-e', `process.${stream}.write("x".repeat(17 * 1024 * 1024)); setTimeout(() => {}, 10000)`]),
      { code: 'COMMAND_FAILED' });
  }
});

test('runner captures stdout and stderr using an actual child process, no adb', async () => {
  const run = createRunner(process.execPath);
  assert.deepEqual(await run(['-e', 'process.stdout.write("hello"); process.stderr.write("warning")']),
    { stdout: 'hello', stderr: 'warning', code: 0 });
});

test('nonzero child exit is returned to the caller', async () => {
  const result = await createRunner(process.execPath)(['-e', 'process.stderr.write("bad"); process.exitCode = 7']);
  assert.deepEqual(result, { stdout: '', stderr: 'bad', code: 7 });
});

test('runner passes metacharacters literally as one argument', async () => {
  const arg = 'hello; echo unsafe & $(bad)';
  const result = await createRunner(process.execPath)(['-e', 'process.stdout.write(process.argv[1])', arg]);
  assert.equal(result.stdout, arg);
});

test('child timeout maps to TIMEOUT', async () => {
  await assert.rejects(createRunner(process.execPath)(['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 50 }), { code: 'TIMEOUT' });
});

test('missing binary maps to ADB_NOT_FOUND', async () => {
  await assert.rejects(createRunner(resolve(import.meta.dirname, 'no-such-adb-binary'))([]), { code: 'ADB_NOT_FOUND' });
});
