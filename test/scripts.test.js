import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { adbBinaryName, extractCommand, hostPlatform, parseArgs, platformToolsUrl } from '../scripts/fetch-adb.js';
import { launcherCmd, layout, quickStartText } from '../scripts/build-portable.js';

test('platform-tools URL is Google official per platform', () => {
  for (const platform of ['windows', 'darwin', 'linux']) {
    assert.equal(platformToolsUrl(platform), `https://dl.google.com/android/repository/platform-tools-latest-${platform}.zip`);
  }
  assert.throws(() => platformToolsUrl('plan9'), /Unknown platform/);
});

test('host platform, binary name and --platform parsing', () => {
  assert.equal(hostPlatform('win32'), 'windows');
  assert.equal(hostPlatform('darwin'), 'darwin');
  assert.equal(hostPlatform('freebsd'), 'linux');
  assert.equal(adbBinaryName('windows'), 'adb.exe');
  assert.equal(adbBinaryName('linux'), 'adb');
  assert.deepEqual(parseArgs(['--platform', 'linux', '--force']), { platform: 'linux', force: true });
  assert.equal(parseArgs([]).platform, hostPlatform());
  assert.throws(() => parseArgs(['--platform', 'amiga']), /--platform/);
});

test('extract uses the OS own tool without a shell', () => {
  assert.deepEqual(extractCommand('linux', 'a.zip', 'out'), { file: 'unzip', args: ['-q', '-o', 'a.zip', '-d', 'out'] });
  assert.deepEqual(extractCommand('darwin', 'a.zip', 'out'), { file: 'tar', args: ['-xf', 'a.zip', '-C', 'out'] });
  const windows = extractCommand('windows', 'a.zip', 'out');
  assert.match(windows.file, /tar\.exe$/);
  assert.deepEqual(windows.args, ['-xf', 'a.zip', '-C', 'out']);
});

test('portable build layout', () => {
  const paths = layout('/repo');
  assert.equal(paths.folder, join('/repo', 'dist', 'CleanTV-win-x64'));
  assert.equal(paths.zip, join('/repo', 'dist', 'CleanTV-win-x64.zip'));
  assert.equal(paths.node, join(paths.folder, 'node.exe'));
  assert.equal(paths.app, join(paths.folder, 'app'));
  assert.equal(paths.platformTools, join(paths.app, 'vendor', 'platform-tools'));
});

test('launcher cmd files start the server and keep the window open', () => {
  const normal = launcherCmd(false);
  const demo = launcherCmd(true);
  for (const text of [normal, demo]) {
    assert.match(text, /^@echo off\r\n/);
    assert.ok(text.includes('Jangan tutup tetingkap ini / Do not close this window'));
    assert.ok(text.includes('"%~dp0node.exe" app\src\server\index.js'));
    assert.ok(text.includes('--open'));
    assert.match(text, /pause\r\n$/);
    assert.doesNotMatch(text, /(?<!\r)\n/, 'CRLF only');
  }
  assert.ok(!normal.includes('--demo'));
  assert.ok(demo.includes('--demo --open'));
});

test('quick start text is bilingual, Malay first, ASCII only', () => {
  const text = quickStartText();
  assert.ok(text.indexOf('BAHASA MELAYU') < text.indexOf('ENGLISH'));
  assert.ok(text.includes('CleanTV.cmd') && text.includes('CleanTV-Demo.cmd'));
  assert.match(text, /^[\x00-\x7f]*$/);
});
