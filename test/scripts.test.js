import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { mkdtemp, mkdir, readFile, readdir, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { adbBinaryName, extractCommand, fetchAdb, hostPlatform, parseArgs, parseSignature,
  platformToolsUrl, validateRedirect, verifyAdbSignature } from '../scripts/fetch-adb.js';
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
  assert.equal(paths.fetchScript, join(paths.app, 'scripts', 'fetch-adb.js'));
  assert.equal(paths.sums, join(paths.dist, 'SHA256SUMS.txt'));
});

// Independent complete expectations: do not derive these from launcherCmd or its branches.
const NORMAL_CMD = String.raw`@echo off
title CleanTV
cd /d "%~dp0"
echo Jangan tutup tetingkap ini / Do not close this window
if not exist "%~dp0app\vendor\platform-tools\adb.exe" (
  echo CleanTV akan memuat turun Android platform-tools rasmi Google, kira-kira 7 MB, dari dl.google.com.
  echo CleanTV will download Google's official Android platform-tools, about 7 MB, from dl.google.com.
  echo Ini perisian Google di bawah terma Google / This is Google's software under Google's terms:
  echo https://developer.android.com/studio/releases/platform-tools
  "%~dp0node.exe" "%~dp0app\scripts\fetch-adb.js"
  if errorlevel 1 (
    echo Muat turun atau semakan gagal. Sambung ke internet dan buka CleanTV.cmd semula. Aplikasi akan dibuka juga.
    echo Download or verification failed. Connect to the internet and open CleanTV.cmd again. The app will still open.
  )
)
"%~dp0node.exe" "%~dp0app\src\server\index.js" --open
echo.
echo CleanTV telah berhenti / CleanTV has stopped.
pause
`.replace(/\r?\n/g, '\r\n');
const DEMO_CMD = String.raw`@echo off
title CleanTV (Demo)
cd /d "%~dp0"
echo Jangan tutup tetingkap ini / Do not close this window
"%~dp0node.exe" "%~dp0app\src\server\index.js" --demo --open
echo.
echo CleanTV telah berhenti / CleanTV has stopped.
pause
`.replace(/\r?\n/g, '\r\n');

test('launcher cmd files exactly match independent expectations; demo never downloads', () => {
  assert.equal(launcherCmd(false), NORMAL_CMD);
  assert.equal(launcherCmd(true), DEMO_CMD);
  assert.doesNotMatch(DEMO_CMD, /fetch-adb|dl\.google\.com|if not exist/);
});

test('portable build excludes even existing vendor tools, copies fetcher and hashes the zip', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cleantv-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['src/server', 'scripts', 'public', 'presets', 'vendor/platform-tools']) await mkdir(join(root, dir), { recursive: true });
  for (const file of ['package.json', 'scripts/fetch-adb.js', 'src/server/index.js', 'vendor/platform-tools/adb.exe', 'runtime.exe', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) await writeFile(join(root, file), 'fixture');
  // A previous first run must not leak its adb back into the next build.
  const paths = layout(root);
  await mkdir(join(paths.app, 'vendor/platform-tools'), { recursive: true });
  await writeFile(join(paths.app, 'vendor/platform-tools/adb.exe'), 'old download');
  const logs = [];
  const { folder, zip } = await buildPortable({ root, nodePath: join(root, 'runtime.exe'), log: line => logs.push(line) });
  assert.equal(await readFile(paths.fetchScript, 'utf8'), 'fixture');
  await assert.rejects(access(join(paths.app, 'vendor')), { code: 'ENOENT' });
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) assert.equal(await readFile(join(folder, file), 'utf8'), 'fixture');
  for (const [file, expected] of [['CleanTV.cmd', NORMAL_CMD], ['CleanTV-Demo.cmd', DEMO_CMD]]) {
    const text = await readFile(join(folder, file), 'utf8');
    assert.equal(text, expected);
    const serverPath = text.match(/"%~dp0(app[^"\r\n]+server[^"\r\n]+)"/)[1];
    await access(join(folder, ...serverPath.split('\\')));
  }
  if (zip) {
    const sums = await readFile(paths.sums, 'utf8');
    assert.match(sums, /^[a-f0-9]{64}  CleanTV-win-x64\.zip\n$/);
    const digest = createHash('sha256').update(await readFile(zip)).digest('hex');
    assert.equal(sums, `${digest}  CleanTV-win-x64.zip\n`);
    assert.ok(logs.includes(sums.trimEnd()));
  }
});

test('Authenticode parser requires Valid status and Google signer, failing closed', () => {
  for (const Status of [0, 'Valid']) {
    const signature = { Status, Subject: 'CN=Google LLC, O=Google LLC, C=US' };
    assert.deepEqual(parseSignature(JSON.stringify(signature)), signature);
  }
  for (const value of [
    { Status: 2, Subject: 'CN=Google LLC' }, { Status: 'NotSigned', Subject: null },
    { Status: 'Valid', Subject: 'CN=Other LLC' }, { Status: 0, Subject: '' },
    { Status: 'Valid', Subject: 'CN=Google LLC' }, { Status: 'Valid', Subject: 'CN=x, O=Googlefake Inc' },
    { Status: '0', Subject: 'Google' }, { Status: false, Subject: 'Google' },
    { Status: 'Valid' }, null, [], {},
  ]) assert.throws(() => parseSignature(JSON.stringify(value)), /Authenticode check failed/);
  assert.throws(() => parseSignature('not JSON'), /invalid PowerShell response/);
});

test('Authenticode PowerShell call passes the path via env, is injectable and skips other hosts', async () => {
  const path = String.raw`C:\Aisha’s ' $folder\[tools]\adb.exe`;
  let calls = 0;
  const logs = [];
  const run = async (file, args, options) => {
    calls++;
    assert.equal(file, 'powershell.exe');
    assert.deepEqual(args, ['-NoProfile', '-NonInteractive', '-Command',
      String.raw`(Get-AuthenticodeSignature -LiteralPath $env:CLEANTV_ADB_SIG_PATH) | Select-Object Status, @{n='Subject';e={$_.SignerCertificate.Subject}} | ConvertTo-Json`]);
    assert.equal(options.windowsHide, true);
    assert.equal(options.env.CLEANTV_ADB_SIG_PATH, path);
    assert.ok(options.timeout > 0);
    return { stdout: '{"Status":0,"Subject":"CN=Google LLC, O=Google LLC, C=US"}' };
  };
  await verifyAdbSignature(path, { platform: 'win32', run, log: line => logs.push(line) });
  assert.match(logs[0], /Authenticode signature: Valid; Subject: CN=Google LLC/);
  for (const platform of ['darwin', 'linux']) {
    await verifyAdbSignature(path, { platform, run, log: line => logs.push(line) });
    assert.match(logs.at(-1), /skipped.*Windows-only/);
  }
  assert.equal(calls, 1);
  await assert.rejects(verifyAdbSignature(path, { platform: 'win32', run: async () => { throw new Error('not available'); } }),
    /Authenticode check failed.*not available/);
});

test('download checks signature before install/version; failure cleans only staging and preserves existing tools',
  { skip: process.platform !== 'win32' }, async t => {
    const root = await mkdtemp(join(tmpdir(), 'cleantv-fetch-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const dest = join(root, 'platform-tools');
    const adbPath = join(dest, 'adb.exe');
    const sentinel = join(root, 'keep.txt');
    await writeFile(sentinel, 'keep');
    const request = async (url, options) => {
      assert.equal(url, 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip');
      assert.equal(options.redirect, 'manual');
      return new Response('mock archive');
    };
    let verified = false;
    let versionRuns = 0;
    let valid = false;
    const run = async (file, args) => {
      if (file.endsWith('tar.exe')) {
        const extracted = join(args[args.indexOf('-C') + 1], 'platform-tools');
        await mkdir(extracted);
        await writeFile(join(extracted, 'adb.exe'), 'new tools');
        return { stdout: '' };
      }
      if (file === 'powershell.exe') {
        verified = valid;
        return { stdout: JSON.stringify({ Status: valid ? 0 : 'NotSigned', Subject: valid ? 'CN=Google LLC, O=Google LLC' : null }) };
      }
      assert.equal(file, adbPath);
      assert.deepEqual(args, ['version']);
      assert.ok(verified, 'never execute the new binary before verification');
      assert.equal(await readFile(adbPath, 'utf8'), 'new tools');
      versionRuns++;
      return { stdout: 'Android Debug Bridge version 1.0.41\n' };
    };
    for (const existing of [false, true]) {
      if (existing) {
        await mkdir(dest);
        await writeFile(adbPath, 'old tools');
      }
      await assert.rejects(fetchAdb({ platform: 'windows', dest, force: true, run, request, log() {} }), /Authenticode check failed/);
      assert.deepEqual((await readdir(root)).sort(), existing ? ['keep.txt', 'platform-tools'] : ['keep.txt']);
      if (existing) assert.equal(await readFile(adbPath, 'utf8'), 'old tools');
      assert.equal(await readFile(sentinel, 'utf8'), 'keep');
      assert.equal(versionRuns, 0);
    }
    valid = true;
    await fetchAdb({ platform: 'windows', dest, force: true, run, request, log() {} });
    assert.equal(versionRuns, 1);
    assert.deepEqual((await readdir(root)).sort(), ['keep.txt', 'platform-tools']);
    await fetchAdb({ platform: 'windows', dest, run, request: async () => { assert.fail('existing adb must not download'); }, log() {} });
    assert.equal(versionRuns, 2);
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
