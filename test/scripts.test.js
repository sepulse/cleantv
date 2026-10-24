import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtemp, mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { adbBinaryName, extractCommand, hostPlatform, parseArgs, platformToolsUrl, validateRedirect } from '../scripts/fetch-adb.js';
import { buildPortable, launcherCmd, layout, quickStartText } from '../scripts/build-portable.js';

test('platform-tools URL is Google official per platform', () => {
  for (const platform of ['windows', 'darwin', 'linux']) {
    assert.equal(platformToolsUrl(platform), `https://dl.google.com/android/repository/platform-tools-latest-${platform}.zip`);
  }
  assert.throws(() => platformToolsUrl('plan9'), /Unknown platform/);
});

test('redirect validator accepts only HTTPS destinations on the approved Google hosts', () => {
  const base = platformToolsUrl('windows');
  for (const host of ['dl.google.com', 'redirect.google.com', 'r1.gvt1.com', 'download.googleusercontent.com']) {
    const url = `https://${host}/tools.zip`;
    assert.equal(validateRedirect(url, base), url);
  }
  assert.equal(validateRedirect('../tools.zip', base), 'https://dl.google.com/android/tools.zip');
  for (const url of ['http://dl.google.com/tools.zip', 'https://evil.example/tools.zip',
    'https://google.com.evil.example/tools.zip', 'https://evilgoogle.com/tools.zip',
    'https://evilgvt1.com/tools.zip', 'https://evilgoogleusercontent.com/tools.zip',
    'https://dl.google.com@evil.example/tools.zip', 'file:///tools.zip', 'https://[invalid']) {
    assert.throws(() => validateRedirect(url, base), /redirect (blocked|has an invalid URL)/);
  }
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

test('launcher cmd files emit the quoted server path that exists in the built layout', async t => {
  const normal = launcherCmd(false);
  const demo = launcherCmd(true);
  const expected = String.raw`"%~dp0node.exe" "%~dp0app\src\server\index.js"`;
  for (const [text, flags] of [[normal, '--open'], [demo, '--demo --open']]) {
    assert.match(text, /^@echo off\r\n/);
    assert.ok(text.includes('Jangan tutup tetingkap ini / Do not close this window'));
    assert.equal(text.split('\r\n')[4], `${expected} ${flags}`);
    assert.match(text, /pause\r\n$/);
    assert.doesNotMatch(text, /(?<!\r)\n/, 'CRLF only');
  }
  assert.ok(!normal.includes('--demo'));
  assert.ok(demo.includes('--demo --open'));
  if (process.platform !== 'win32' || process.arch !== 'x64') return;
  const root = await mkdtemp(join(tmpdir(), 'cleantv-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['src/server', 'public', 'presets', 'vendor/platform-tools']) await mkdir(join(root, dir), { recursive: true });
  for (const file of ['package.json', 'src/server/index.js', 'vendor/platform-tools/adb.exe', 'runtime.exe']) await writeFile(join(root, file), 'fixture');
  const { folder } = await buildPortable({ root, nodePath: join(root, 'runtime.exe'), log() {} });
  for (const [file, flags] of [['CleanTV.cmd', '--open'], ['CleanTV-Demo.cmd', '--demo --open']]) {
    const text = await readFile(join(folder, file), 'utf8');
    assert.equal(text.split('\r\n')[4], `${expected} ${flags}`);
    const serverPath = text.split('\r\n')[4].match(/"%~dp0(app[^"\r\n]+)"/)[1];
    await access(join(folder, ...serverPath.split('\\')));
  }
});

test('quick start and README describe the same checked switch and recovery, Malay first', async () => {
  const text = quickStartText();
  assert.ok(text.indexOf('BAHASA MELAYU') < text.indexOf('ENGLISH'));
  assert.ok(text.includes('CleanTV.cmd') && text.includes('CleanTV-Demo.cmd'));
  assert.match(text, /^[\x00-\x7f]*$/);
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const normalize = value => value.replace(/\s+/g, ' ').trim();
  for (const paragraph of [
    'Anda boleh menukar skrin utama (launcher) kepada Projectivy secara pilihan.',
    'You can optionally switch the home screen (launcher) to Projectivy.',
  ]) {
    const start = readme.indexOf(paragraph);
    const end = readme.indexOf('\n- ', start);
    const description = normalize(readme.slice(start, end));
    assert.ok(normalize(text).includes(description), paragraph);
  }
  assert.doesNotMatch(readme, /not disabled until the replacement is confirmed|tidak akan dimatikan selagi/);
});
