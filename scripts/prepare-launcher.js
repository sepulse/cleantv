import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Build-only changes in the CI checkout; never runs upstream installation tools. */
export async function prepareLauncher(root) {
  const buildFile = join(root, 'app/build.gradle');
  let build = await readFile(buildFile, 'utf8');
  if (!build.includes("applicationId providers.gradleProperty('launcherApplicationId')")
    || !/^\s*minSdk 26\s*$/m.test(build)
    || (build.match(/signingConfig signingConfigs\.debug/g) ?? []).length !== 1) {
    throw new Error('Upstream launcher build changed; review the identity, minSdk and signing patch.');
  }
  build = build.replace('    buildTypes {', `    signingConfigs {
        cleanTvRelease {
            storeFile file(System.getenv('LAUNCHER_KEYSTORE_PATH'))
            storePassword System.getenv('LAUNCHER_KEYSTORE_PASSWORD')
            keyAlias System.getenv('LAUNCHER_KEY_ALIAS')
            keyPassword System.getenv('LAUNCHER_KEY_PASSWORD')
        }
    }

    buildTypes {`)
    .replace('signingConfig signingConfigs.debug', 'signingConfig signingConfigs.cleanTvRelease')
    .replace('            // Sideloaded over ADB, never published: sign with the debug key so it installs over a debug build.\n', '');
  if (!build.includes('cleanTvRelease {') || build.includes('signingConfigs.debug')) throw new Error('Release signing patch failed');
  await writeFile(buildFile, build);
  const res = join(root, 'app/src/main/res');
  for (const entry of await readdir(res, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^values(?:-|$)/.test(entry.name)) continue;
    const strings = join(res, entry.name, 'strings.xml');
    let source;
    try { source = await readFile(strings, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    await writeFile(strings, source.replace(/(<string\s+name="app_name"[^>]*>)[\s\S]*?<\/string>/g, '$1CleanTV Home</string>'));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareLauncher(resolve(process.argv[2]));
}
