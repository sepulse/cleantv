import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAdbClient } from '../src/core/adb/client.js';
import { createJournal } from '../src/core/journal.js';
import { BUNDLED_APK, BUNDLED_LAUNCHER, verifyBundledLauncher } from '../src/core/bundled-launcher.js';
import { prepareLauncher } from '../scripts/prepare-launcher.js';

const serial = '192.168.1.5:5555';
const pkg = BUNDLED_LAUNCHER.package;
const bytes = Buffer.from('signed fixture APK');
const digest = createHash('sha256').update(bytes).digest('hex');

test('bundled verifier reads only the fixed APK and manifest and refuses missing, malformed or mismatched data', async () => {
  const paths = [];
  await verifyBundledLauncher(async (path, encoding) => {
    paths.push(path);
    if (path === BUNDLED_APK) { assert.equal(encoding, undefined); return bytes; }
    assert.equal(encoding, 'utf8');
    return `${digest}  cleantv-home.apk\n`;
  });
  assert.match(paths[0], /[\\/]launcher[\\/]cleantv-home\.apk$/);
  assert.equal(paths[1], join(BUNDLED_APK, '../SHA256SUMS.txt'));
  for (const manifest of ['', `${'0'.repeat(64)}  cleantv-home.apk`, `${digest}  other.apk`,
    `${digest}  ../cleantv-home.apk`, `${digest}  cleantv-home.apk\n${digest}  other.apk`]) {
    await assert.rejects(verifyBundledLauncher(async path => path === BUNDLED_APK ? bytes : manifest), { code: 'COMMAND_FAILED' });
  }
  await assert.rejects(verifyBundledLauncher(async () => { throw new Error('missing'); }), { code: 'COMMAND_FAILED' });
});

test('named install checks SDK and SHA before invoking only adb install -r at the fixed path', async () => {
  for (const sdk of ['25', '', '26', '34']) for (const valid of [true, false]) {
    const calls = [];
    const client = createAdbClient(async args => {
      calls.push(args);
      if (args.includes('getprop')) return { code: 0, stdout: `[ro.build.version.sdk]: [${sdk}]`, stderr: '' };
      assert.deepEqual(args, ['-s', serial, 'install', '-r', BUNDLED_APK]);
      return { code: 0, stdout: 'Success\n', stderr: '' };
    }, { readBundledFile: async path => path === BUNDLED_APK ? bytes : `${valid ? digest : '0'.repeat(64)}  cleantv-home.apk\n` });
    if (Number(sdk) >= 26 && valid) await client.installBundledLauncher(serial, '/user/evil.apk');
    else await assert.rejects(client.installBundledLauncher(serial), { code: Number(sdk) < 26 ? 'LAUNCHER_UNSUPPORTED' : 'COMMAND_FAILED' });
    assert.equal(calls.filter(args => args[2] === 'install').length, Number(Number(sdk) >= 26 && valid));
  }
});

test('journal and command boundary require completed fresh-install evidence for this exact package', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cleantv-ownership-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const journal = createJournal(dir);
  const record = (action, status, overrides = {}) => ({ at: 'today', package: pkg, action, status, absentBefore: true, ...overrides });
  const cases = [[], [record('install', 'pending')], [record('install', 'ok')],
    [record('install', 'pending'), record('install', 'failed')],
    [record('install', 'pending'), record('install', 'ok', { absentBefore: false })],
    [record('install', 'pending', { package: 'com.android.systemui' }), record('install', 'ok', { package: 'com.android.systemui' })],
    [record('install', 'pending'), record('install', 'ok'), record('remove', 'ok')],
    [record('install', 'pending'), record('install', 'ok')],
    [record('install', 'pending'), record('install', 'ok'), record('remove', 'failed')]];
  for (const [index, records] of cases.entries()) {
    const deviceId = `TV${index}`;
    for (const entry of records) await journal.append(deviceId, entry);
    const owned = index >= cases.length - 2;
    assert.deepEqual(await journal.installedByUs(deviceId), owned ? [pkg] : []);
    assert.deepEqual(await journal.disabledByUs(deviceId), []);
    const calls = [];
    const client = createAdbClient(async args => {
      calls.push(args);
      return { code: 0, stdout: 'Success', stderr: '' };
    });
    if (owned) {
      await client.removeBundledLauncher(serial, journal, deviceId);
      assert.deepEqual(calls, [['-s', serial, 'uninstall', 'io.github.sepulse.cleantv.home']]);
    } else {
      await assert.rejects(client.removeBundledLauncher(serial, journal, deviceId), { code: 'PACKAGE_PROTECTED' });
      assert.deepEqual(calls, []);
    }
  }
  const client = createAdbClient(async () => { assert.fail('no command with unreadable journal'); });
  await assert.rejects(client.removeBundledLauncher(serial, { read: async () => { throw new Error('damaged'); } }, 'TV'), /damaged/);
});

test('build preparation replaces debug release signing and every localized display name without touching app code', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cleantv-prepare-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const build = `android {
    defaultConfig {
        applicationId providers.gradleProperty('launcherApplicationId').getOrElse('com.gathin.tvhome')
        minSdk 26
    }
    buildTypes {
        release {
            signingConfig signingConfigs.debug
        }
    }
}`;
  for (const name of ['values', 'values-ms']) {
    await mkdir(join(dir, 'app/src/main/res', name), { recursive: true });
    await writeFile(join(dir, 'app/src/main/res', name, 'strings.xml'), '<resources><string name="app_name">TV Home</string><string name="other">Keep me</string></resources>');
  }
  await writeFile(join(dir, 'app/build.gradle'), build);
  await prepareLauncher(dir);
  const patched = await readFile(join(dir, 'app/build.gradle'), 'utf8');
  assert.doesNotMatch(patched, /signingConfigs\.debug/);
  assert.match(patched, /signingConfig signingConfigs.cleanTvRelease/);
  for (const key of ['LAUNCHER_KEYSTORE_PATH', 'LAUNCHER_KEYSTORE_PASSWORD', 'LAUNCHER_KEY_ALIAS', 'LAUNCHER_KEY_PASSWORD']) assert.ok(patched.includes(`System.getenv('${key}')`));
  for (const name of ['values', 'values-ms']) {
    assert.equal(await readFile(join(dir, 'app/src/main/res', name, 'strings.xml'), 'utf8'), '<resources><string name="app_name">CleanTV Home</string><string name="other">Keep me</string></resources>');
  }
  await writeFile(join(dir, 'app/build.gradle'), build.replace('minSdk 26', 'minSdk 28'));
  await assert.rejects(prepareLauncher(dir), /Upstream launcher build changed/);
});

test('release workflow consumes the pin, requires all signing secrets, attests and publishes only the intended assets', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  const pin = await readFile(new URL('../launcher/UPSTREAM.txt', import.meta.url), 'utf8');
  assert.match(pin, /SHA: d6410ab3514506db666279e7ee17d4933f835776/);
  assert.match(workflow, /Get-Content launcher\/UPSTREAM.txt/);
  assert.match(workflow, /ref: \$\{\{ steps.launcher.outputs.sha \}\}/);
  for (const key of ['LAUNCHER_KEYSTORE_B64', 'LAUNCHER_KEYSTORE_PASSWORD', 'LAUNCHER_KEY_ALIAS', 'LAUNCHER_KEY_PASSWORD']) assert.ok(workflow.includes(`secrets.${key}`));
  assert.match(workflow, /Missing GitHub signing secret/);
  assert.match(workflow, /sparse-checkout: launcher\r?\n/);
  assert.match(workflow, /does not apply to the pinned upstream SHA/);
  assert.ok(workflow.indexOf('Apply CleanTV launcher patches') < workflow.indexOf('prepare-launcher.js'));
  assert.match(workflow, /'-PlauncherApplicationId=io\.github\.sepulse\.cleantv\.home' testDebugUnitTest --tests '\*PrayerTimesTest' assembleRelease/,
    'the -P value is quoted: unquoted, PowerShell splits it at the first dot');
  assert.match(workflow, /apksigner.bat" verify/);
  assert.match(workflow, /subject-path: \|\s+dist\/CleanTV-win-x64.zip\s+dist\/cleantv-home.apk/);
  assert.doesNotMatch(workflow, /assembleDebug|keytool|build-and-install/);
});

test('release workflow keeps secrets and upstream code away from the write and attestation tokens', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  const [head, publish] = workflow.split(/^  publish:$/m);
  assert.ok(publish, 'a separate publish job exists');
  const [top, build] = head.split(/^jobs:$/m);
  assert.match(top, /^permissions: \{\}$/m, 'no permissions unless a job asks');
  assert.match(build, /^  build:\r?\n    runs-on: windows-latest\r?\n    permissions:\r?\n      contents: read\r?\n/m);
  assert.doesNotMatch(build, /contents: write|id-token|attestations/);
  assert.match(publish, /needs: build[\s\S]*contents: write[\s\S]*id-token: write[\s\S]*attestations: write/);
  assert.doesNotMatch(publish, /secrets\.LAUNCHER|gradlew|prepare-launcher|actions\/checkout|apply /, 'publish never runs upstream code or sees the key');
  assert.equal((build.match(/persist-credentials: false/g) ?? []).length, build.match(/actions\/checkout@/g).length, 'no checkout leaves a token in .git/config');
  assert.match(build, /merge-base --is-ancestor \$env:GITHUB_SHA origin\/main/);
  assert.match(build, /fetch-depth: 0/);
  for (const [, ref] of workflow.matchAll(/^\s+(?:- )?uses: (\S+)/gm)) assert.match(ref, /@[0-9a-f]{40}$/, `${ref} is pinned to a commit`);
  assert.match(build, /actions\/upload-artifact@[0-9a-f]{40}[\s\S]*name: release-assets[\s\S]*if-no-files-found: error/);
  assert.match(publish, /actions\/download-artifact@[0-9a-f]{40}[\s\S]*name: release-assets/);
});
