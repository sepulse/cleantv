import { resolve } from 'node:path';
import { locateAdb } from '../core/adb/locate.js';
import { createRunner } from '../core/adb/runner.js';
import { createAdbClient } from '../core/adb/client.js';
import { createEngine } from '../core/engine.js';
import { loadPresets } from '../core/registry.js';

try {
  const [ip, port = '5555'] = process.argv.slice(2);
  if (!ip) throw new Error('Usage: node src/cli/smoke.js <ip> [port]');
  const client = createAdbClient(createRunner(await locateAdb()));
  const { serial, state } = await client.connect(ip, Number(port));
  if (state === 'unauthorized') {
    console.log('Press Allow on the TV, then run again');
  } else if (state !== 'device') {
    throw new Error(`Device is ${state}`);
  } else {
    const presets = await loadPresets(resolve(import.meta.dirname, '../../presets'));
    const engine = createEngine({ client, presets });
    const inspection = await engine.inspect(serial);
    console.log(inspection.info);
    console.log('Matched presets:', inspection.presets.join(', '));
    console.table(inspection.packages.map(({ package: pkg, risk, installed, enabled, canDisable, blockedReason }) =>
      ({ package: pkg, risk, installed, enabled, canDisable, blockedReason })));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
