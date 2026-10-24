import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, cp, copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NAME = 'CleanTV-win-x64';
const COPIED = ['package.json', 'src', 'public', 'presets'];

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
    'Ia hanya MEMATIKAN aplikasi - tiada apa yang dipadam. Anda boleh',
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
    'Fail selebihnya ialah teks JavaScript/HTML dan data yang boleh dibaca.',
    '',
    '=== ENGLISH ===',
    '',
    'CleanTV helps your Android/Google TV run faster with fewer ads.',
    'It only DISABLES apps - nothing is deleted. You can restore everything',
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
    'The remaining files are plain, readable JavaScript/HTML text and data.',
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

  await rm(paths.folder, { recursive: true, force: true });
  await mkdir(paths.app, { recursive: true });
  await copyFile(nodeSource, paths.node);
  for (const item of COPIED) await cp(join(root, item), join(paths.app, item), { recursive: true });

  await mkdir(join(paths.app, 'scripts'), { recursive: true });
  await copyFile(join(root, 'scripts', 'fetch-adb.js'), paths.fetchScript);

  await writeFile(join(paths.folder, 'CleanTV.cmd'), launcherCmd(false));
  await writeFile(join(paths.folder, 'CleanTV-Demo.cmd'), launcherCmd(true));
  for (const file of ['BACA-SAYA.txt', 'README.txt']) await writeFile(join(paths.folder, file), quickStartText());
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
  const sums = `${hash.digest('hex')}  ${NAME}.zip\n`;
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
