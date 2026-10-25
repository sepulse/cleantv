import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const adbClient = resolve(import.meta.dirname, '../src/core/adb/client.js');
function assertSettingsWrites(source, path) {
  // Strip only these complete, literal argument arrays in the one permitted file.
  const allowed = /\['-s', serial, 'shell', 'settings', '(?:put', 'global', 'private_dns_(?:mode', mode|specifier', specifier)|delete', 'global', 'private_dns_(?:mode|specifier)')\]/g;
  const remaining = path === adbClient ? source.replace(allowed, '') : source;
  assert.doesNotMatch(remaining, /settings(?:['"]\s*,\s*['"]|\s+)(?:put|delete)\b/, path);
}

test('settings writes allow only the two literal global DNS keys in AdbClient', () => {
  for (const [key, value] of [['private_dns_mode', 'mode'], ['private_dns_specifier', 'specifier']]) {
    const put = `['-s', serial, 'shell', 'settings', 'put', 'global', '${key}', ${value}]`;
    const remove = `['-s', serial, 'shell', 'settings', 'delete', 'global', '${key}']`;
    for (const command of [put, remove]) {
      assert.doesNotThrow(() => assertSettingsWrites(command, adbClient));
      assert.throws(() => assertSettingsWrites(command, resolve(import.meta.dirname, '../src/core/engine.js')));
      assert.throws(() => assertSettingsWrites(command.replace(key, 'window_animation_scale'), adbClient));
      assert.throws(() => assertSettingsWrites(command.replace('global', 'secure'), adbClient));
    }
    assert.throws(() => assertSettingsWrites(put.replace(`'${key}'`, 'key'), adbClient));
    assert.throws(() => assertSettingsWrites(put.replace(value + ']', 'input]'), adbClient));
  }
  assert.throws(() => assertSettingsWrites('settings put global private_dns_mode off', adbClient));
});

test('all source files exclude forbidden commands and process execution APIs', async () => {
  const forbidden = ['uninstall', 'pm clear', 'settings put', 'wipe', 'reboot', 'rm ', 'shell: true', 'exec('];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { await visit(path); continue; }
      const source = await readFile(path, 'utf8');
      assertSettingsWrites(source, path);
      for (const text of forbidden) assert.ok(!source.includes(text), `${path} contains ${JSON.stringify(text)}`);
      assert.doesNotMatch(source, /\{\s*exec\s*\}/, path);
      assert.doesNotMatch(source, /\bshell\s*:\s*true\b/, path);
      assert.doesNotMatch(source, /import\s*\{[^}]*\bexec\b[^}]*\}\s*from\s*['"](?:node:)?child_process['"]/, path);
    }
  }
  await visit(resolve(import.meta.dirname, '../src'));
});
