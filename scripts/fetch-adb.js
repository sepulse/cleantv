import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const PLATFORMS = ['windows', 'darwin', 'linux'];
const DEFAULT_DEST = fileURLToPath(new URL('../vendor/platform-tools', import.meta.url));

/**
 * @param {string} platform windows | darwin | linux
 * @returns {string} Google's official platform-tools zip URL
 */
export function platformToolsUrl(platform) {
  if (!PLATFORMS.includes(platform)) throw new Error(`Unknown platform "${platform}". Use one of: ${PLATFORMS.join(', ')}.`);
  return `https://dl.google.com/android/repository/platform-tools-latest-${platform}.zip`;
}

/** Validate a redirect before any request is sent to its destination. */
export function validateRedirect(location, currentUrl) {
  let url;
  try { url = new URL(location, currentUrl); }
  catch { throw new Error('Download redirect has an invalid URL.'); }
  if (url.protocol !== 'https:' || !(url.hostname === 'dl.google.com'
    || ['.google.com', '.gvt1.com', '.googleusercontent.com'].some(suffix => url.hostname.endsWith(suffix)))) {
    throw new Error(`Download redirect blocked: only approved Google HTTPS hosts are allowed (${url.href}).`);
  }
  return url.href;
}

/** @param {NodeJS.Platform} [nodePlatform] @returns {string} windows | darwin | linux */
export function hostPlatform(nodePlatform = process.platform) {
  return nodePlatform === 'win32' ? 'windows' : nodePlatform === 'darwin' ? 'darwin' : 'linux';
}

/** @param {string} platform @returns {string} */
export function adbBinaryName(platform) {
  return platform === 'windows' ? 'adb.exe' : 'adb';
}

/**
 * The OS's own unzip tool: bsdtar on Windows 10+ and macOS, unzip on Linux.
 * @param {string} host windows | darwin | linux
 * @param {string} zipPath
 * @param {string} outDir
 * @returns {{ file: string, args: string[] }}
 */
export function extractCommand(host, zipPath, outDir) {
  if (host === 'linux') return { file: 'unzip', args: ['-q', '-o', zipPath, '-d', outDir] };
  const file = host === 'windows' ? join(process.env.SystemRoot ?? 'C:\Windows', 'System32', 'tar.exe') : 'tar';
  return { file, args: ['-xf', zipPath, '-C', outDir] };
}

/** @param {string[]} argv @returns {{ platform: string, force: boolean }} */
export function parseArgs(argv) {
  const index = argv.indexOf('--platform');
  const platform = index === -1 ? hostPlatform() : argv[index + 1];
  if (!PLATFORMS.includes(platform)) throw new Error(`--platform needs one of: ${PLATFORMS.join(', ')}.`);
  return { platform, force: argv.includes('--force') };
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

/** Accept only a valid Authenticode signature from Google (PowerShell emits enum 0 or "Valid"). */
export function parseSignature(stdout) {
  let signature;
  try { signature = JSON.parse(stdout.replace(/^\uFEFF/, '').trim()); }
  catch { throw new Error('Authenticode check failed: invalid PowerShell response.'); }
  if (!signature || ![0, 'Valid'].includes(signature.Status)
    || typeof signature.Subject !== 'string' || !/(^|,\s*)O=Google LLC(,|$)/.test(signature.Subject)) {
    throw new Error('Authenticode check failed: adb.exe must have a Valid signature from Google.');
  }
  return signature;
}

/** Check before installing or running the extracted binary; run is injectable for offline tests. */
export async function verifyAdbSignature(adbPath, { platform = process.platform, run = execFileAsync, log = console.log } = {}) {
  if (platform !== 'win32') {
    log('Authenticode check skipped: only available on Windows; the portable build is Windows-only.');
    return;
  }
  // The path travels in an environment variable, never inside the command text, so no quoting can break out.
  const command = "(Get-AuthenticodeSignature -LiteralPath $env:CLEANTV_ADB_SIG_PATH) | Select-Object Status, @{n='Subject';e={$_.SignerCertificate.Subject}} | ConvertTo-Json";
  let stdout;
  try {
    ({ stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true, timeout: 60_000, env: { ...process.env, CLEANTV_ADB_SIG_PATH: adbPath } }));
  } catch (error) {
    throw new Error(`Authenticode check failed: could not verify adb.exe (${error.message}).`);
  }
  const signature = parseSignature(stdout);
  log(`Authenticode signature: Valid; Subject: ${signature.Subject}`);
}

/**
 * Download and unpack Google's platform-tools into `dest` (default vendor/platform-tools).
 * Idempotent: does nothing when adb is already there unless `force` is set.
 * @param {{ platform?: string, dest?: string, force?: boolean, log?: (message: string) => void,
 *   run?: typeof execFileAsync, request?: typeof fetch }} [options]
 * @returns {Promise<string>} path of the adb binary
 */
export async function fetchAdb({ platform = hostPlatform(), dest = DEFAULT_DEST, force = false, log = console.log,
  run = execFileAsync, request = fetch } = {}) {
  const adbPath = join(dest, adbBinaryName(platform));
  if (!force && await exists(adbPath)) {
    log(`adb already present: ${adbPath} (use --force to download again)`);
  } else {
    let url = platformToolsUrl(platform);
    const parent = dirname(resolve(dest));
    await mkdir(parent, { recursive: true });
    const work = await mkdtemp(join(parent, '.fetch-'));
    try {
      log(`Downloading ${url}`);
      let response;
      const signal = AbortSignal.timeout(300_000);
      for (let redirects = 0; ; redirects++) {
        response = await request(url, { redirect: 'manual', signal })
          .catch(error => { throw new Error(`Download failed (${error.message}). Check your internet connection and try again.`); });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        await response.body?.cancel();
        if (redirects === 5) throw new Error('Download failed: more than 5 redirects.');
        const location = response.headers.get('location');
        if (!location) throw new Error('Download redirect is missing its Location header.');
        url = validateRedirect(location, url);
      }
      if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} from ${url}`);
      const zipPath = join(work, 'platform-tools.zip');
      await writeFile(zipPath, Buffer.from(await response.arrayBuffer()));
      const { file, args } = extractCommand(hostPlatform(), zipPath, work);
      await run(file, args, { windowsHide: true }).catch(error => {
        throw new Error(`Could not unzip with "${file}" (${error.message}).`);
      });
      if (!await exists(join(work, 'platform-tools', adbBinaryName(platform)))) {
        throw new Error('The downloaded archive does not contain adb. Try again with --force.');
      }
      if (platform === 'windows') {
        await verifyAdbSignature(join(work, 'platform-tools', 'adb.exe'), { run, log });
      } else {
        log('Authenticode check skipped: non-Windows adb; the portable build is Windows-only.');
      }
      await rm(dest, { recursive: true, force: true });
      await rename(join(work, 'platform-tools'), dest);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
  if (platform === hostPlatform()) {
    const { stdout } = await run(adbPath, ['version'], { windowsHide: true, timeout: 15_000 })
      .catch(error => { throw new Error(`adb was unpacked but does not run (${error.message}).`); });
    log(stdout.split(/\r?\n/).find(line => line.trim())?.trim() ?? 'adb ok');
  } else {
    log(`Unpacked ${platform} adb to ${dest} (not run: different platform).`);
  }
  return adbPath;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { platform, force } = parseArgs(process.argv.slice(2));
    await fetchAdb({ platform, force });
  } catch (error) {
    console.error(`fetch-adb: ${error.message}`);
    process.exitCode = 1;
  }
}
