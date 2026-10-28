import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, cp, copyFile, mkdir, rm, stat, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NAME = 'CleanTV-win-x64';
const COPIED = ['package.json', 'src', 'public', 'presets'];
const LEGAL = ['LICENSE', 'THIRD_PARTY_NOTICES.md'];

/**
 * @param {string} root repository root
 * @returns {{ dist: string, folder: string, zip: string, sums: string, app: string, node: string, fetchScript: string }}
 */
export function layout(root) {
  const dist = join(root, 'dist');
  const folder = join(dist, NAME);
  const app = join(folder, 'app');
  return { dist, folder, zip: join(dist, `${NAME}.zip`), sums: join(dist, 'SHA256SUMS.txt'),
    app, node: join(folder, 'node.exe'), fetchScript: join(app, 'scripts', 'fetch-adb.js') };
}

/** @param {boolean} demo @returns {string} contents of a double-click launcher (CRLF) */
export function launcherCmd(demo) {
  return [
    '@echo off',
    `title CleanTV${demo ? ' (Demo)' : ''}`,
    'cd /d "%~dp0"',
    'echo Jangan tutup tetingkap ini / Do not close this window',
    ...demo ? [] : [
      'if not exist "%~dp0app\\vendor\\platform-tools\\adb.exe" (',
      '  echo CleanTV akan memuat turun Android platform-tools rasmi Google, kira-kira 7 MB, dari dl.google.com.',
      '  echo CleanTV will download Google\'s official Android platform-tools, about 7 MB, from dl.google.com.',
      '  echo Ini perisian Google di bawah terma Google / This is Google\'s software under Google\'s terms:',
      '  echo https://developer.android.com/studio/releases/platform-tools',
      '  "%~dp0node.exe" "%~dp0app\\scripts\\fetch-adb.js"',
      '  if errorlevel 1 (',
      '    echo Muat turun atau semakan gagal. Sambung ke internet dan buka CleanTV.cmd semula. Aplikasi akan dibuka juga.',
      '    echo Download or verification failed. Connect to the internet and open CleanTV.cmd again. The app will still open.',
      '  )',
      ')',
    ],
    `"%~dp0node.exe" "%~dp0app\\src\\server\\index.js" ${demo ? '--demo ' : ''}--open`,
    'echo.',
    'echo CleanTV telah berhenti / CleanTV has stopped.',
    'pause',
    '',
  ].join('\r\n');
}

/** @returns {string} bilingual quick start (Malay first), plain ASCII, CRLF */
export function quickStartText() {
  return [
    'CleanTV - BACA SAYA / README',
    '',
    '=== BAHASA MELAYU ===',
    '',
    'CleanTV membantu TV Android/Google TV anda lebih laju dan kurang iklan.',
    'CleanTV tidak memadam aplikasi TV; hanya membuang launcher yang CleanTV',
    'sendiri pasang. Anda boleh',
    'memulihkan semuanya dengan satu klik, dan factory reset TV juga',
    'memulihkan semuanya.',
    '',
    'Anda boleh menukar skrin utama (launcher) kepada Projectivy secara pilihan.',
    'CleanTV menyemak Projectivy sudah dipasang, dihidupkan dan tersedia sebagai',
    'home app sebelum menukar launcher. Kemudian CleanTV mematikan home app asal,',
    'menyemak butang Home dan cuba kembali ke skrin utama asal secara automatik',
    'jika semakan gagal. Jika sambungan terputus semasa penukaran, CleanTV',
    'memulihkannya apabila anda bersambung semula, atau anda boleh pilih',
    '"Pulihkan skrin utama asal" / "Pulihkan semua". Factory reset sentiasa',
    'memulihkan semuanya.',
    '',
    'Juga dalam versi ini (setiap satu pilihan dan bertanya dahulu sebelum mengubah',
    'apa-apa):',
    '- Senarai aplikasi Google TV, Xiaomi, TCL, Sony, Hisense dan Amazon Fire TV.',
    '  Senarai ini belum lagi diuji pada TV sebenar.',
    '- Sebelum perubahan pertama, CleanTV menyimpan keadaan asal TV, supaya',
    '  "Pulihkan semua" hanya menghidupkan semula apa yang dimatikan oleh CleanTV.',
    '- Selepas TV dimulakan semula, CleanTV menyemak sama ada sebarang aplikasi',
    '  yang dimatikannya hidup semula, dan membolehkan anda mematikannya lagi.',
    '- Private DNS: sekat iklan bagi seluruh TV dengan AdGuard DNS, atau matikannya.',
    '- Audit privasi: memaparkan aplikasi iklan dan telemetry yang masih aktif',
    '  (baca sahaja).',
    '- Apabila selesai, anda boleh menutup network debugging pada TV.',
    '',
    'Lesen: lihat LICENSE (CleanTV) dan THIRD_PARTY_NOTICES.md (sumber data, MIT).',
    '',
    'Cara mula:',
    '1. Nyahzip folder ini (klik kanan > Extract All).',
    '2. Pada TV, hidupkan "Pilihan pembangun" dan "Penyahpepijatan USB/rangkaian".',
    '3. Sambung ke internet dan klik dua kali CleanTV.cmd. Pelayar akan terbuka.',
    '   Kali pertama, platform-tools rasmi Google dimuat turun dari dl.google.com.',
    '   Perisian Google ini tertakluk kepada terma Google:',
    '   https://developer.android.com/studio/releases/platform-tools',
    '4. Ikut langkah di skrin. Tekan "Benarkan" pada skrin TV apabila diminta.',
    '',
    'Jangan tutup tetingkap hitam semasa menggunakan CleanTV.',
    'Mahu cuba tanpa TV? Klik dua kali CleanTV-Demo.cmd.',
    'Windows mungkin memberi amaran kerana CleanTV masih baharu dan tiada code signing.',
    'Jika anda memilih untuk teruskan, pilih "More info" > "Run anyway", atau sebelum',
    'nyahzip: klik kanan zip > Properties > tandakan Unblock > OK.',
    'node.exe ditandatangani oleh OpenJS Foundation; adb.exe yang dimuat turun pada',
    'kali pertama ditandatangani oleh Google dan tandatangannya disemak sebelum digunakan.',
    'Zip ini turut menyertakan APK CleanTV Home yang ditandatangani. Jika anda',
    'memasangnya dan memilih zon, TV menghubungi e-solat.gov.my (JAKIM) untuk',
    'waktu solat; hanya kod zon dihantar.',
    '',
    '=== ENGLISH ===',
    '',
    'CleanTV helps your Android/Google TV run faster with fewer ads.',
    'CleanTV does not delete TV apps; it only removes the launcher CleanTV itself installed.',
    'You can restore everything',
    'with one click, and a factory reset of the TV also restores everything.',
    '',
    'You can optionally switch the home screen (launcher) to Projectivy.',
    'CleanTV checks Projectivy is installed, enabled and offered as a home app',
    'before switching. It then turns off the original home apps, checks the Home',
    'button, and tries to switch back automatically if the check fails. If the',
    'connection drops mid-switch, CleanTV repairs it the next time it connects,',
    'or you can choose "Restore the original home screen" / "Restore all".',
    'A factory reset always restores everything.',
    '',
    'Also in this version (each is optional and asks before it changes anything):',
    '- App lists for Google TV, Xiaomi, TCL, Sony, Hisense and Amazon Fire TV.',
    '  These lists are not yet tested on a real TV.',
    '- Before the first change, CleanTV saves the original state of the TV, so',
    '  "Restore all" only turns back on what CleanTV turned off.',
    '- After the TV restarts, CleanTV checks whether any app it turned off came',
    '  back on, and lets you turn it off again.',
    '- Private DNS: block ads for the whole TV with AdGuard DNS, or switch it off.',
    '- Privacy audit: shows ad and telemetry apps that are still on (read only).',
    '- When you are done, you can close network debugging on the TV.',
    '',
    'Licence: see LICENSE (CleanTV) and THIRD_PARTY_NOTICES.md (data sources, MIT).',
    '',
    'How to start:',
    '1. Unzip this folder (right-click > Extract All).',
    '2. On the TV, switch on "Developer options" and "USB/network debugging".',
    '3. Connect to the internet and double-click CleanTV.cmd. Your browser will open.',
    '   On first run, official Google platform-tools are downloaded from dl.google.com.',
    '   This is Google\'s software under Google\'s terms:',
    '   https://developer.android.com/studio/releases/platform-tools',
    '4. Follow the steps on screen. Press "Allow" on the TV when asked.',
    '',
    'Do not close the black window while you use CleanTV.',
    'Want to try it without a TV? Double-click CleanTV-Demo.cmd.',
    'Windows may warn because CleanTV is new and not code-signed.',
    'If you choose to continue, select "More info" > "Run anyway", or before extracting:',
    'right-click the zip > Properties > tick Unblock > OK.',
    'node.exe is signed by the OpenJS Foundation; adb.exe downloaded on first run',
    'is signed by Google, and its signature is checked before use.',
    'The zip also includes the signed CleanTV Home APK. If you install it and',
    'choose a zone, the TV contacts e-solat.gov.my (JAKIM) for prayer times;',
    'only the zone code is sent.',
    '',
  ].join('\r\n');
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

/** @param {string[]} argv @returns {{ node: string | undefined }} */
export function parseArgs(argv) {
  const index = argv.indexOf('--node');
  return { node: index === -1 ? undefined : argv[index + 1] };
}

/**
 * @param {{ root?: string, nodePath?: string, log?: (message: string) => void }} [options]
 * @returns {Promise<{ folder: string, zip: string | null }>}
 */
export async function buildPortable({ root = ROOT, nodePath, log = console.log } = {}) {
  const paths = layout(root);
  const isWinX64 = process.platform === 'win32' && process.arch === 'x64';
  const nodeSource = nodePath ?? (isWinX64 ? process.execPath : undefined);
  if (!nodeSource) throw new Error('Not on Windows x64: pass --node <path to a Windows x64 node.exe>.');
  if (!await exists(nodeSource)) throw new Error(`node.exe not found: ${nodeSource}`);
  const apkSource = join(root, 'launcher/cleantv-home.apk');
  if (!await exists(apkSource)) throw new Error('Signed launcher/cleantv-home.apk missing. Build it through the release workflow; see docs/RELEASE.md.');

  await rm(paths.folder, { recursive: true, force: true });
  await mkdir(paths.app, { recursive: true });
  await copyFile(nodeSource, paths.node);
  for (const item of COPIED) await cp(join(root, item), join(paths.app, item), { recursive: true });
  const launcherDir = join(paths.app, 'launcher');
  await mkdir(launcherDir, { recursive: true });
  await copyFile(apkSource, join(launcherDir, 'cleantv-home.apk'));
  const apkHash = createHash('sha256').update(await readFile(join(launcherDir, 'cleantv-home.apk'))).digest('hex');
  await writeFile(join(launcherDir, 'SHA256SUMS.txt'), `${apkHash}  cleantv-home.apk\n`);
  await copyFile(join(root, 'launcher/UPSTREAM.txt'), join(launcherDir, 'UPSTREAM.txt'));
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await copyFile(join(root, file), join(paths.folder, file));

  await mkdir(join(paths.app, 'scripts'), { recursive: true });
  await copyFile(join(root, 'scripts', 'fetch-adb.js'), paths.fetchScript);

  await writeFile(join(paths.folder, 'CleanTV.cmd'), launcherCmd(false));
  await writeFile(join(paths.folder, 'CleanTV-Demo.cmd'), launcherCmd(true));
  for (const file of ['BACA-SAYA.txt', 'README.txt']) await writeFile(join(paths.folder, file), quickStartText());
  for (const file of LEGAL) await copyFile(join(root, file), join(paths.folder, file));
  log(`Built ${paths.folder}`);

  await rm(paths.zip, { force: true });
  await rm(paths.sums, { force: true });
  if (process.platform !== 'win32') {
    log('Zip skipped: it is only made on Windows (tar -a). Zip the folder yourself.');
    return { folder: paths.folder, zip: null };
  }
  await execFileAsync(join(process.env.SystemRoot ?? 'C:\Windows', 'System32', 'tar.exe'),
    ['-a', '-c', '-f', paths.zip, '-C', paths.dist, NAME], { windowsHide: true });
  log(`Zipped ${paths.zip} (${((await stat(paths.zip)).size / 1048576).toFixed(1)} MB)`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(paths.zip)) hash.update(chunk);
  await copyFile(apkSource, join(paths.dist, 'cleantv-home.apk'));
  const sums = `${hash.digest('hex')}  ${NAME}.zip\n${apkHash}  cleantv-home.apk\n`;
  await writeFile(paths.sums, sums);
  log(sums.trimEnd());
  return { folder: paths.folder, zip: paths.zip };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await buildPortable({ nodePath: parseArgs(process.argv.slice(2)).node });
  } catch (error) {
    console.error(`build-portable: ${error.message}`);
    process.exitCode = 1;
  }
}
