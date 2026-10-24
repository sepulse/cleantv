import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

test('all source files exclude forbidden commands and process execution APIs', async () => {
  const forbidden = ['uninstall', 'pm clear', 'settings put', 'wipe', 'reboot', 'rm ', 'shell: true', 'exec('];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { await visit(path); continue; }
      const source = await readFile(path, 'utf8');
      for (const text of forbidden) assert.ok(!source.includes(text), `${path} contains ${JSON.stringify(text)}`);
      assert.doesNotMatch(source, /\{\s*exec\s*\}/, path);
      assert.doesNotMatch(source, /\bshell\s*:\s*true\b/, path);
      assert.doesNotMatch(source, /import\s*\{[^}]*\bexec\b[^}]*\}\s*from\s*['"](?:node:)?child_process['"]/, path);
    }
  }
  await visit(resolve(import.meta.dirname, '../src'));
});
