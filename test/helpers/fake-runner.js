/**
 * @param {Record<string, { stdout?: string, stderr?: string, code?: number } | Error>} responses
 * @returns {import('../../src/core/adb/runner.js').Runner & { calls: string[][] }}
 */
export function fakeRunner(responses) {
  const calls = [];
  const run = async args => {
    calls.push([...args]);
    const key = args.join(' ');
    if (!Object.hasOwn(responses, key)) throw new Error(`Unknown args: ${key}`);
    const response = responses[key];
    if (response instanceof Error) throw response;
    return { stdout: '', stderr: '', code: 0, ...response };
  };
  run.calls = calls;
  return run;
}
