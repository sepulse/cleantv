import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createAdbClient } from '../src/core/adb/client.js';
import { createEngine } from '../src/core/engine.js';
import { createJournal } from '../src/core/journal.js';
import { loadPresets } from '../src/core/registry.js';
import { REPLACEMENT_LAUNCHERS, STOCK_LAUNCHERS } from '../src/core/launchers.js';
import { CleanTvError } from '../src/core/errors.js';

const serial = '192.168.1.5:5555';
const replacement = REPLACEMENT_LAUNCHERS[0].package;
const stock = STOCK_LAUNCHERS.slice(0, 3);

async function fixture(t, options = {}) {
  const replacement = options.replacement ?? REPLACEMENT_LAUNCHERS[0].package;
  const dir = await mkdtemp(join(tmpdir(), 'cleantv-launcher-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const journal = createJournal(dir);
  const installed = new Set([...(options.noStock ? [] : stock), ...(options.absent ? [] : [replacement]), ...(options.extraInstalled ?? [])]);
  const disabled = new Set([stock[2], ...(options.disabled ? [replacement] : [])]);
  const calls = [];
  let preferredHome;
  let homePress = 0;
  let focusRead = 0;
  const home = () => preferredHome ?? options.home ?? (options.alwaysReplacement ? replacement : stock.find(pkg => installed.has(pkg) && !disabled.has(pkg))
    ?? (options.badFinalHome ? null : options.competingHome ?? replacement));
  const run = async args => {
    calls.push(args);
    const result = stdout => ({ stdout, stderr: '', code: 0 });
    if (args[0] === 'devices') return result(`${serial} device\n`);
    assert.deepEqual(args.slice(0, 3), ['-s', serial, 'shell']);
    const command = args.slice(3).join(' ');
    if (command === 'getprop') return result(['[ro.serialno]: [LAUNCHER_TEST]', ...Object.entries(options.props ?? {})
      .map(([key, value]) => `[${key}]: [${value}]`)].join('\n'));
    if (['settings get global private_dns_mode', 'settings get global private_dns_specifier',
      'settings get secure screensaver_components', 'settings get global window_animation_scale',
      'settings get global transition_animation_scale', 'settings get global animator_duration_scale'].includes(command)) return result('null\n');
    if (command === 'pm list packages --user 0') return result([...installed].map(pkg => `package:${pkg}`).join('\n'));
    if (command === 'pm list packages --user 0 -d') return result([...disabled].map(pkg => `package:${pkg}`).join('\n'));
    if (command === 'cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.HOME') {
      return result([...installed].filter(pkg => !disabled.has(pkg) && !(options.notCandidate && pkg === replacement)).map(pkg => `${pkg}/.Main`).join('\n'));
    }
    if (command === 'cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME') {
      const resolved = home();
      return result(resolved ? resolved.includes('/') ? resolved : `${resolved}/.Main` : 'No activity found');
    }
    if (command === 'input keyevent KEYCODE_HOME') { homePress++; focusRead = 0; return result(''); }
    if (command === 'dumpsys activity activities') {
      const sequence = options.focusByPress?.[homePress];
      const focused = sequence ? sequence[Math.min(focusRead++, sequence.length - 1)]
        : options.focusBefore && stock.slice(0, 2).every(pkg => !disabled.has(pkg)) && !preferredHome ? options.focusBefore
        : options.focusAfterSwap && stock.slice(0, 2).every(pkg => disabled.has(pkg)) ? options.focusAfterSwap
        : options.focusAfterRestore && preferredHome === stock[0] ? options.focusAfterRestore : home();
      return result(focused ? `mFocusedApp=ActivityRecord{abc u0 ${focused}/.Main t12}` : 'mFocusedApp=null');
    }
    if (args.slice(3, 6).join(' ') === 'cmd package set-home-activity') {
      if (options.setHomeFailure) return { stdout: '', stderr: 'unsupported', code: 1 };
      if (!options.ignoreSetHome) preferredHome = options.chooser ? 'android/com.android.internal.app.ResolverActivity' : args.at(-1).split('/')[0];
      return result('Success');
    }
    if (args[3] === 'pm' && ['enable', 'disable-user'].includes(args[4])) {
      const pkg = args.at(-1);
      const disable = args[4] === 'disable-user';
      if (!options.skipJournalCheck) {
        const latest = (await journal.read('LAUNCHER_TEST')).at(-1);
        assert.equal(latest.status, 'pending');
        assert.equal(latest.package, pkg);
      }
      if (disable && options.throwOn === pkg && !options.throwAfterEffect) throw new CleanTvError('TIMEOUT');
      if (!disable && options.enableFailure === pkg) return result('Failure');
      if (disable) disabled.add(pkg); else disabled.delete(pkg);
      if (disable && options.dropPreferenceOnDisable) preferredHome = undefined;
      if (disable && options.throwOn === pkg) throw new CleanTvError('TIMEOUT');
      if (disable && options.falseOn === pkg) return result('Failure');
      return result(`Package ${pkg} new state: ${disable ? 'disabled-user' : 'enabled'}`);
    }
    if (command === `am start -a android.intent.action.VIEW -d market://details?id=${replacement}`) return result('Starting: Intent');
    throw new Error(`Unexpected command: ${command}`);
  };
  const client = createAdbClient(run);
  const presets = [{ id: 'launcher-test', match: { any: true }, packages: stock.map(packageName => ({ package: packageName, risk: 'red', category: 'launcher' })) }];
  const engine = createEngine({ client, journal, presets });
  const changes = kind => calls.filter(args => args[3] === 'pm' && args[4] === kind).map(args => args.at(-1));
  return { engine, client, journal, presets, disabled, installed, options, calls, changes };
}

test('stock allowlist covers supported preset launchers and excludes Fire OS', async () => {
  const presets = await loadPresets(fileURLToPath(new URL('../presets/', import.meta.url)));
  for (const entry of presets.flatMap(preset => preset.packages).filter(entry => entry.category === 'launcher')) {
    assert.equal(entry.risk, 'red');
    if (entry.package === 'com.amazon.tv.launcher') assert.equal(STOCK_LAUNCHERS.includes(entry.package), false);
    else assert.ok(STOCK_LAUNCHERS.includes(entry.package), entry.package);
  }
  for (const pkg of ['com.google.android.apps.tv.launcherx', 'com.google.android.tvlauncher', 'com.mitv.tvhome.atv']) assert.ok(STOCK_LAUNCHERS.includes(pkg));
  assert.deepEqual(REPLACEMENT_LAUNCHERS, [
    { package: 'com.spocky.projengmenu', name: 'Projectivy Launcher' },
    { package: 'me.efesser.flauncher', name: 'FLauncher' },
  ]);
});

test('status reports HOME, all stock states and replacement readiness', async t => {
  const { engine } = await fixture(t);
  const status = await engine.launcherStatus(serial);
  assert.equal(status.home, stock[0]);
  assert.deepEqual(status.replacement, { ...REPLACEMENT_LAUNCHERS[0], installed: true, enabled: true, isHomeCandidate: true });
  assert.deepEqual(status.replacements, [status.replacement,
    { ...REPLACEMENT_LAUNCHERS[1], installed: false, enabled: false, isHomeCandidate: false }]);
  assert.deepEqual(status.stock[2], { package: stock[2], installed: true, enabled: false });
  assert.equal(status.stock.at(-1).installed, false);
});

test('every swap precondition refuses before any journal intent or mutation', async t => {
  for (const [options, pkg, code, condition] of [
    [{}, 'com.example.other', 'INVALID_INPUT'], [{}, 'com.bad;input', 'INVALID_INPUT'],
    [{ absent: true }, replacement, 'LAUNCHER_NOT_READY', 'installed'],
    [{ disabled: true }, replacement, 'LAUNCHER_NOT_READY', 'enabled'],
    [{ notCandidate: true }, replacement, 'LAUNCHER_NOT_READY', 'isHomeCandidate'],
  ]) {
    const { engine, journal, changes } = await fixture(t, options);
    await assert.rejects(engine.swapLauncher(serial, pkg), error => error.code === code && (!condition || error.details.condition === condition));
    assert.deepEqual(changes('disable-user'), []);
    assert.deepEqual(await journal.read('LAUNCHER_TEST'), []);
  }
});

test('swap rejects an unverifiable current HOME before journal or stock changes', async t => {
  for (const focusBefore of ['com.example.other', 'android']) {
    const { engine, journal, changes } = await fixture(t, { focusBefore });
    await assert.rejects(engine.swapLauncher(serial, replacement), error => error.code === 'LAUNCHER_NOT_READY'
      && error.details.condition === 'actualHome');
    assert.deepEqual(changes('disable-user'), []);
    assert.deepEqual(await journal.read('LAUNCHER_TEST'), []);
  }
});

test('unsupported platforms reject swap with source-specific reason before any mutation', async t => {
  const cases = [
    [{ props: { 'ro.product.manufacturer': 'Amazon' } }, /Fire OS/],
    [{ props: { 'ro.product.model': 'AFTDCT31' } }, /Fire OS/],
    [{ extraInstalled: ['com.amazon.tv.launcher'] }, /Fire OS/],
    [{ props: { 'ro.product.manufacturer': 'CVTE' } }, /CVTE/],
    [{ extraInstalled: ['com.cvte.tv.hkcfac'] }, /CVTE/],
    [{ props: { 'ro.product.manufacturer': 'Xiaomi' }, extraInstalled: ['com.mitv.tvhome'] }, /Xiaomi/],
    [{ props: { 'ro.product.manufacturer': 'Xiaomi', 'ro.build.display.id': 'OS2.0.cn' } }, /Xiaomi/],
    [{ props: { 'ro.product.manufacturer': 'Xiaomi' }, noStock: true }, /Xiaomi/],
  ];
  for (const [options, reason] of cases) {
    const { engine, journal, changes } = await fixture(t, options);
    await assert.rejects(engine.swapLauncher(serial, replacement), error => error.code === 'LAUNCHER_UNSUPPORTED'
      && reason.test(error.message));
    assert.deepEqual(changes('disable-user'), []);
    assert.deepEqual(await journal.read('LAUNCHER_TEST'), []);
  }
});

test('happy swap journals first, disables only enabled installed stock, verifies HOME', async t => {
  const { engine, journal, changes } = await fixture(t);
  const progress = [];
  const result = await engine.swapLauncher(serial, replacement, event => progress.push(event));
  assert.deepEqual(changes('disable-user'), stock.slice(0, 2));
  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.results[0].result, 'switched');
  assert.equal((await engine.launcherStatus(serial)).home, replacement);
  const records = await journal.read('LAUNCHER_TEST');
  assert.deepEqual(records.filter(item => item.action !== 'swap').map(item => item.status), ['pending', 'ok', 'pending', 'ok']);
  assert.deepEqual(records.filter(item => item.action === 'swap').map(({ action, status, replacement, disabled }) =>
    ({ action, status, replacement, disabled })), [
    { action: 'swap', status: 'pending', replacement, disabled: [] },
    { action: 'swap', status: 'pending', replacement, disabled: stock.slice(0, 1) },
    { action: 'swap', status: 'pending', replacement, disabled: stock.slice(0, 2) },
    { action: 'swap', status: 'ok', replacement, disabled: stock.slice(0, 2) },
  ]);
  assert.equal(progress.at(-1).done, 2);
});

test('global Xiaomi remains supported after Projectivy becomes HOME', async t => {
  const { engine, client } = await fixture(t, { props: { 'ro.product.manufacturer': 'Xiaomi' } });
  assert.equal((await engine.swapLauncher(serial, replacement)).failed, 0);
  assert.equal(await client.resolveHomeActivity(serial), replacement);
  assert.equal((await engine.swapLauncher(serial, replacement)).failed, 0);
});

test('swap saves the original baseline before mutation and preserves it across launcher switches', async t => {
  const { engine, client, journal } = await fixture(t, { extraInstalled: REPLACEMENT_LAUNCHERS.map(entry => entry.package) });
  const disable = client.disableUser;
  client.disableUser = async (s, pkg) => {
    const baseline = await journal.readBaseline('LAUNCHER_TEST');
    assert.deepEqual(baseline.disabledBefore, [stock[2]]);
    assert.equal(baseline.homeComponent, `${stock[0]}/.Main`);
    assert.equal(Object.keys(baseline.settings).length, 6);
    return disable(s, pkg);
  };
  assert.equal((await engine.swapLauncher(serial, replacement)).failed, 0);
  const baseline = await journal.readBaseline('LAUNCHER_TEST');
  client.getSettings = async () => { assert.fail('must preserve the first baseline'); };
  assert.equal((await engine.swapLauncher(serial, REPLACEMENT_LAUNCHERS[1].package)).failed, 0);
  assert.deepEqual(await journal.readBaseline('LAUNCHER_TEST'), baseline);
  const result = await engine.restore(serial, 'all');
  assert.equal(result.failed, 0);
  assert.deepEqual(result.results.map(item => item.package).sort(), stock.slice(0, 2).sort());
});

test('baseline write failure warns while launcher switching and recovery remain available', async t => {
  const { engine, journal } = await fixture(t);
  journal.saveBaseline = async () => { throw new Error('baseline disk full'); };
  const result = await engine.swapLauncher(serial, replacement);
  assert.equal(result.failed, 0);
  assert.equal(result.journalWarning, true);
  assert.equal(await journal.readBaseline('LAUNCHER_TEST'), null);
  assert.equal((await engine.restore(serial, 'all')).failed, 0);
});

test('Xiaomi China and unverified stock remain unsupported with Projectivy HOME', async t => {
  for (const options of [{ noStock: true }, { extraInstalled: ['com.mitv.tvhome'] },
    { extraInstalled: ['com.xiaomi.mitv.settings'] }, { props: { 'ro.build.display.id': 'OS2.0.cn' } }]) {
    const { engine, journal, changes } = await fixture(t, { ...options, home: replacement,
      props: { 'ro.product.manufacturer': 'Xiaomi', ...options.props } });
    await assert.rejects(engine.swapLauncher(serial, replacement), { code: 'LAUNCHER_UNSUPPORTED' });
    assert.deepEqual(changes('disable-user'), []);
    assert.deepEqual(await journal.read('LAUNCHER_TEST'), []);
  }
});

test('swap sets Projectivy HOME after stock candidate changes clear the prior preference', async t => {
  const competingHome = 'com.example.otherhome';
  const { engine, calls, client } = await fixture(t, { competingHome, extraInstalled: [competingHome],
    dropPreferenceOnDisable: true });
  const result = await engine.swapLauncher(serial, replacement);
  assert.equal(result.results[0].result, 'switched');
  const lastDisable = calls.findLastIndex(args => args[4] === 'disable-user');
  const setHome = calls.findIndex(args => args.includes('set-home-activity'));
  assert.ok(setHome > lastDisable);
  assert.equal(await client.resolveHomeActivity(serial), replacement);
});

test('HOME focus settling accepts stale and null early reads once Projectivy stays focused', async t => {
  const { engine, calls } = await fixture(t, { focusByPress: {
    1: [null, stock[0], stock[0], stock[0], stock[0]],
    2: [stock[0], null, replacement, replacement, replacement],
  } });
  const result = await engine.swapLauncher(serial, replacement);
  assert.equal(result.results[0].result, 'switched');
  assert.equal(calls.filter(args => args.slice(3).join(' ') === 'dumpsys activity activities').length, 10);
});

test('HOME focus settling rejects an initially matching stale Projectivy focus', async t => {
  const competingHome = 'com.example.otherhome';
  const { engine, changes } = await fixture(t, { extraInstalled: [competingHome], focusByPress: {
    2: [replacement, replacement, competingHome, competingHome, competingHome],
  } });
  const result = await engine.swapLauncher(serial, replacement);
  assert.equal(result.results[0].reason, 'LAUNCHER_SWAP_ROLLED_BACK');
  assert.deepEqual(changes('enable'), stock.slice(0, 2));
});

test('verification failure rolls back exactly the stock launchers disabled this run', async t => {
  const { engine, changes, disabled } = await fixture(t, { badFinalHome: true, ignoreSetHome: true });
  const result = await engine.swapLauncher(serial, replacement);
  assert.equal(result.failed, 1);
  assert.equal(result.results[0].reason, 'LAUNCHER_SWAP_ROLLED_BACK');
  assert.deepEqual(changes('enable'), stock.slice(0, 2));
  assert.deepEqual([...disabled], [stock[2]]);
});

test('set-home Success and resolved HOME success with wrong focused app trigger rollback', async t => {
  const { engine, changes, disabled, client, calls } = await fixture(t, { ignoreSetHome: true, focusAfterSwap: stock[0] });
  const result = await engine.swapLauncher(serial, replacement);
  assert.equal(result.results[0].reason, 'LAUNCHER_SWAP_ROLLED_BACK');
  assert.deepEqual(changes('enable'), stock.slice(0, 2));
  assert.deepEqual([...disabled], [stock[2]]);
  assert.equal(await client.resolveHomeActivity(serial), stock[0]);
  assert.ok(calls.some(args => args.includes('set-home-activity')));
  assert.ok(calls.some(args => args.slice(3).join(' ') === 'input keyevent KEYCODE_HOME'));
});

test('mid-swap exceptions recover completed changes and commands that threw after taking effect', async t => {
  for (const throwAfterEffect of [false, true]) {
    const { engine, changes, disabled } = await fixture(t, { throwOn: stock[1], throwAfterEffect });
    const result = await engine.swapLauncher(serial, replacement);
    assert.equal(result.results[0].reason, 'LAUNCHER_SWAP_ROLLED_BACK');
    assert.equal(result.results[0].cause, 'TIMEOUT');
    assert.deepEqual(changes('enable'), throwAfterEffect ? stock.slice(0, 2) : stock.slice(0, 1));
    assert.deepEqual([...disabled], [stock[2]]);
  }
});

test('a missing success marker also rolls back actual device changes', async t => {
  const { engine, changes } = await fixture(t, { falseOn: stock[0] });
  const result = await engine.swapLauncher(serial, replacement);
  assert.equal(result.failed, 1);
  assert.deepEqual(changes('enable'), [stock[0]]);
});

test('failed rollback keeps trying the remaining stock and reports unverified recovery', async t => {
  const { engine, changes, disabled } = await fixture(t, { badFinalHome: true, ignoreSetHome: true, enableFailure: stock[0] });
  const result = await engine.swapLauncher(serial, replacement);
  assert.equal(result.results[0].reason, 'LAUNCHER_ROLLBACK_FAILED');
  assert.deepEqual(changes('enable'), stock.slice(0, 2));
  assert.ok(disabled.has(stock[0]));
});

test('journal failure before disable prevents mutation', async t => {
  const { client, presets, changes } = await fixture(t);
  const engine = createEngine({ client, presets, journal: { append: async () => { throw new Error('disk full'); } } });
  const result = await engine.swapLauncher(serial, replacement);
  assert.equal(result.failed, 1);
  assert.deepEqual(changes('disable-user'), []);
});

test('journal failure after disable cannot prevent automatic recovery', async t => {
  const { client, presets, journal, disabled } = await fixture(t);
  const original = journal.append;
  journal.append = async (id, record) => {
    if (record.action === 'disable' && record.status === 'ok') throw new Error('disk full');
    await original(id, record);
  };
  const engine = createEngine({ client, presets, journal });
  assert.equal((await engine.swapLauncher(serial, replacement)).results[0].reason, 'LAUNCHER_SWAP_ROLLED_BACK');
  assert.deepEqual([...disabled], [stock[2]]);
});

test('restoreLauncher enables every installed stock, leaves replacement alone, verifies stock HOME', async t => {
  const { engine, changes, disabled } = await fixture(t);
  await engine.swapLauncher(serial, replacement);
  const result = await engine.restoreLauncher(serial);
  assert.equal(result.failed, 0);
  assert.deepEqual(changes('enable'), stock);
  assert.deepEqual([...disabled], []);
  assert.equal((await engine.launcherStatus(serial)).home, stock[0]);
});

test('restoreLauncher reports remote guidance when HOME selection fails', async t => {
  const { engine } = await fixture(t, { alwaysReplacement: true, setHomeFailure: true });
  const result = await engine.restoreLauncher(serial);
  assert.equal(result.failed, 1);
  assert.equal(result.results.at(-1).reason, 'LAUNCHER_RESTORE_FAILED');
  assert.equal(result.manualHomePackage, stock[0]);
});

test('restoreLauncher does not report success when HOME still focuses Projectivy', async t => {
  const { engine } = await fixture(t, { alwaysReplacement: true, focusAfterRestore: replacement });
  const result = await engine.restoreLauncher(serial);
  assert.equal(result.results.at(-1).reason, 'LAUNCHER_RESTORE_FAILED');
  assert.equal(result.manualHomePackage, stock[0]);
});

test('restoreLauncher settles stale focus before verifying stock HOME', async t => {
  const { engine } = await fixture(t, { alwaysReplacement: true, focusByPress: {
    2: [null, replacement, stock[0], stock[0], stock[0]],
  } });
  const result = await engine.restoreLauncher(serial);
  assert.equal(result.failed, 0);
});

test('restoreLauncher selects a stock candidate and verifies actual focused HOME', async t => {
  for (const chooser of [false, true]) {
    const { engine, calls } = await fixture(t, { alwaysReplacement: true, chooser });
    const result = await engine.restoreLauncher(serial);
    assert.equal(result.failed, chooser ? 1 : 0);
    if (chooser) assert.equal(result.results.at(-1).reason, 'LAUNCHER_RESTORE_FAILED');
    assert.deepEqual(calls.find(args => args.includes('set-home-activity')),
      ['-s', serial, 'shell', 'cmd', 'package', 'set-home-activity', `${stock[0]}/.Main`]);
  }
});

test('restore all verifies stock HOME even when Projectivy remains preferred', async t => {
  for (const options of [{}, { chooser: true }, { ignoreSetHome: true }, { setHomeFailure: true }, { noStock: true }]) {
    const { engine, disabled, installed, calls, client } = await fixture(t, { alwaysReplacement: true, ...options });
    for (const pkg of stock) options.noStock ? installed.delete(pkg) : disabled.add(pkg);
    if (options.noStock) disabled.clear();
    const result = await engine.restore(serial, 'all');
    if (!options.noStock) assert.ok(calls.some(args => args.includes('set-home-activity')));
    const home = await client.resolveHomeActivity(serial);
    if (home === replacement || home === 'android') {
      assert.equal(result.failed, 1);
      assert.equal(result.results.at(-1).reason, options.noStock ? 'LAUNCHER_STOCK_MISSING' : 'LAUNCHER_RESTORE_FAILED');
      assert.equal(result.manualHomePackage, options.noStock ? undefined : stock[0]);
    } else {
      assert.ok(stock.includes(home) || home === 'android');
      assert.equal(result.failed, 0);
    }
  }
});

test('restore all repairs resolver and focused HOME disagreement and reports failed recovery', async t => {
  for (const focusAfterRestore of [undefined, replacement]) {
    const { engine, client, calls, disabled } = await fixture(t, { focusAfterRestore,
      focusByPress: { 1: [replacement], 2: [replacement] } });
    assert.equal(await client.resolveHomeActivity(serial), stock[0]);
    const result = await engine.restore(serial, 'all');
    assert.ok(calls.some(args => args.includes('set-home-activity')));
    assert.ok(calls.filter(args => args.slice(3).join(' ') === 'input keyevent KEYCODE_HOME').length >= 3);
    assert.deepEqual([...disabled], []);
    assert.equal(result.failed, focusAfterRestore ? 1 : 0);
    if (focusAfterRestore) {
      assert.equal(result.results.at(-1).reason, 'LAUNCHER_RESTORE_FAILED');
      assert.equal(result.manualHomePackage, stock[0]);
    }
  }
});

test('inspect and status only detect a pending swap; explicit recovery repairs and verifies HOME', async t => {
  for (const method of ['inspect', 'launcherStatus']) {
    const { client, journal, presets, disabled, changes } = await fixture(t);
    for (const pkg of stock) disabled.add(pkg);
    await journal.append('LAUNCHER_TEST', { action: 'swap', status: 'pending', replacement, disabled: [stock[0]] });
    const engine = createEngine({ client, journal, presets }); // Simulate a new process.
    const detected = await engine[method](serial);
    assert.equal(detected.needsRecovery, true);
    assert.equal(detected.manualHomePackage, stock[0]);
    assert.equal(detected.recovered, undefined);
    assert.deepEqual(changes('enable'), []);
    assert.equal((await journal.read('LAUNCHER_TEST')).at(-1).status, 'pending');
    const result = await engine.recoverLauncher(serial);
    assert.equal(result.recovered, true);
    assert.equal((await engine[method](serial)).info?.homePackage ?? (await engine.launcherStatus(serial)).home, stock[0]);
    assert.deepEqual(changes('enable'), stock);
    assert.equal((await journal.read('LAUNCHER_TEST')).filter(item => item.action === 'swap').at(-1).status, 'rolled-back');
    assert.equal((await engine[method](serial)).recovered, undefined);
  }
});

test('unusable HOME recovers disabled stock with missing history, including journal failures', async t => {
  for (const home of [null, 'com.example.missing', replacement]) {
    const { client, presets, disabled, changes } = await fixture(t, { skipJournalCheck: true, home, absent: home === replacement });
    // null HOME is produced once every stock launcher is disabled.
    for (const pkg of stock) disabled.add(pkg);
    if (home === null) disabled.add(replacement);
    const broken = async () => { throw new Error('disk full'); };
    const engine = createEngine({ client, presets, journal: { read: broken, append: broken } });
    assert.equal((await engine.inspect(serial)).needsRecovery, true);
    assert.deepEqual(changes('enable'), []);
    const result = await engine.recoverLauncher(serial);
    assert.equal(result.recovered, true);
    assert.equal(result.journalWarning, true);
    assert.deepEqual(changes('enable'), stock);
  }
});

test('restore all continues after append failures and reports a journal warning', async t => {
  const { client, presets, disabled, changes } = await fixture(t, { skipJournalCheck: true });
  for (const pkg of stock) disabled.add(pkg);
  const broken = async () => { throw new Error('disk full'); };
  const engine = createEngine({ client, presets, journal: { disabledByUs: async () => [], append: broken } });
  const result = await engine.restore(serial, 'all');
  assert.equal(result.failed, 0);
  assert.equal(result.journalWarning, true);
  assert.deepEqual(changes('enable').sort(), stock.toSorted());
});

test('restoreLauncher remains available with unreadable or unwritable history', async t => {
  const { client, presets, disabled, changes } = await fixture(t, { skipJournalCheck: true });
  for (const pkg of stock) disabled.add(pkg);
  const broken = async () => { throw new Error('history unavailable'); };
  const engine = createEngine({ client, presets, journal: { append: broken, read: broken } });
  const result = await engine.restoreLauncher(serial);
  assert.equal(result.failed, 0);
  assert.equal(result.journalWarning, true);
  assert.deepEqual(changes('enable'), stock);
  assert.deepEqual([...disabled], []);
});

test('restoreLauncher continues after an individual enable failure', async t => {
  const { engine, changes } = await fixture(t, { enableFailure: stock[1] });
  const result = await engine.restoreLauncher(serial);
  assert.equal(result.failed, 1);
  assert.deepEqual(changes('enable'), stock);
  assert.equal(result.results[1].result, 'failed');
});

test('restore all includes swap launchers even without matching presets or history', async t => {
  const { engine, client, journal, disabled } = await fixture(t);
  await engine.swapLauncher(serial, replacement);
  const withoutHistory = createEngine({ client, presets: [], journal: { ...journal, disabledByUs: async () => [], readBaseline: async () => null } });
  const result = await withoutHistory.restore(serial, 'all');
  assert.equal(result.failed, 0);
  assert.deepEqual(result.results.map(item => item.package).sort(), stock.toSorted());
  assert.deepEqual([...disabled], []);
});

test('general cleanup still refuses all stock launchers', async t => {
  const { engine, changes } = await fixture(t);
  const result = await engine.disable(serial, STOCK_LAUNCHERS);
  assert.equal(result.skipped, STOCK_LAUNCHERS.length);
  assert.deepEqual(changes('disable-user'), []);
});

test('a failed swap whose HOME cannot be restored carries remote guidance', async t => {
  const { engine } = await fixture(t, { throwOn: stock[0], alwaysReplacement: true, setHomeFailure: true });
  const result = await engine.swapLauncher(serial, replacement);
  assert.equal(result.results[0].reason, 'LAUNCHER_ROLLBACK_FAILED');
  assert.equal(result.manualHomePackage, stock[0]);
});

test('a failed health recovery carries manual HOME guidance and is not reported as recovered', async t => {
  const { client, journal, presets, disabled } = await fixture(t, { alwaysReplacement: true, setHomeFailure: true });
  for (const pkg of stock) disabled.add(pkg);
  await journal.append('LAUNCHER_TEST', { action: 'swap', status: 'pending', replacement, disabled: [stock[0]] });
  const result = await createEngine({ client, journal, presets }).recoverLauncher(serial);
  assert.equal(result.manualHomePackage, stock[0]);
  assert.equal(result.recovered, undefined);
  assert.equal((await journal.read('LAUNCHER_TEST')).filter(item => item.action === 'swap').at(-1).status, 'pending');
});

test('a swap waits for an in-flight recovery instead of racing it', async t => {
  const { client, journal, presets, disabled } = await fixture(t);
  for (const pkg of stock) disabled.add(pkg);
  await journal.append('LAUNCHER_TEST', { action: 'swap', status: 'pending', replacement, disabled: [stock[0]] });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let gated = false;
  const slow = { ...client, listPackages: async (s, options) => {
    if (options?.disabledOnly && !gated) { gated = true; await gate; }
    return client.listPackages(s, options);
  } };
  const engine = createEngine({ client: slow, journal, presets });
  const check = engine.recoverLauncher(serial);
  while (!gated) await new Promise(resolve => setImmediate(resolve));
  const swap = engine.swapLauncher(serial, replacement);
  await new Promise(resolve => setImmediate(resolve));
  release();
  await check;
  const result = await swap;
  assert.equal(result.results[0].result, 'switched');
  assert.deepEqual([...disabled].sort(), stock.toSorted());
});

test('restoreLauncher with no installed stock launcher explains the original home app is missing', async t => {
  const { engine, installed } = await fixture(t, { alwaysReplacement: true });
  for (const pkg of stock) installed.delete(pkg);
  const result = await engine.restoreLauncher(serial);
  assert.equal(result.failed, 1);
  assert.equal(result.results.at(-1).reason, 'LAUNCHER_STOCK_MISSING');
});

for (const { package: replacement, name } of REPLACEMENT_LAUNCHERS) {
  test(name + ': selected status and readiness guards do not use another launcher', async t => {
    const other = REPLACEMENT_LAUNCHERS.find(entry => entry.package !== replacement).package;
    for (const [options, condition] of [[{ absent: true }, 'installed'], [{ disabled: true }, 'enabled'], [{ notCandidate: true }, 'isHomeCandidate']]) {
      const { engine, journal, changes } = await fixture(t, { ...options, replacement, extraInstalled: [other] });
      const status = await engine.launcherStatus(serial, replacement);
      assert.equal(status.replacement.package, replacement);
      assert.equal(status.replacement[condition], false);
      assert.equal(status.replacements.find(entry => entry.package === other).isHomeCandidate, true);
      await assert.rejects(engine.swapLauncher(serial, replacement), error => error.code === 'LAUNCHER_NOT_READY' && error.details.condition === condition);
      assert.deepEqual(changes('disable-user'), []);
      assert.deepEqual(await journal.read('LAUNCHER_TEST'), []);
    }
  });

  test(name + ': unsupported platforms refuse before changes', async t => {
    for (const props of [{ 'ro.product.manufacturer': 'Amazon' }, { 'ro.product.manufacturer': 'CVTE' },
      { 'ro.product.manufacturer': 'Xiaomi', 'ro.build.display.id': 'OS2.0.cn' }]) {
      const { engine, journal, changes } = await fixture(t, { replacement, props });
      await assert.rejects(engine.swapLauncher(serial, replacement), { code: 'LAUNCHER_UNSUPPORTED' });
      assert.deepEqual(changes('disable-user'), []);
      assert.deepEqual(await journal.read('LAUNCHER_TEST'), []);
    }
  });

  test(name + ': swap verifies selected HOME and restore all returns to stock', async t => {
    const { engine, calls } = await fixture(t, { replacement });
    assert.equal((await engine.swapLauncher(serial, replacement)).results[0].result, 'switched');
    assert.equal((await engine.launcherStatus(serial, replacement)).home, replacement);
    assert.ok(calls.some(args => args.includes('set-home-activity') && args.at(-1) === replacement + '/.Main'));
    assert.equal((await engine.restore(serial, 'all')).failed, 0);
    assert.equal((await engine.launcherStatus(serial, replacement)).home, stock[0]);
  });

  test(name + ': false HOME success rolls back and verifies stock focus', async t => {
    const { engine, changes, disabled } = await fixture(t, { replacement, ignoreSetHome: true, focusAfterSwap: stock[0] });
    const result = await engine.swapLauncher(serial, replacement);
    assert.equal(result.results[0].reason, 'LAUNCHER_SWAP_ROLLED_BACK');
    assert.equal(result.results[0].package, replacement);
    assert.deepEqual(changes('enable'), stock.slice(0, 2));
    assert.deepEqual([...disabled], [stock[2]]);
  });
}

test('status, swap and store reject unregistered packages before device access', async t => {
  const { engine, calls } = await fixture(t);
  for (const method of ['launcherStatus', 'swapLauncher', 'openLauncherStore']) {
    for (const pkg of [null, '', 'com.example.other', 'com.bad;input', {}, ['me.efesser.flauncher']]) {
      await assert.rejects(engine[method](serial, pkg), { code: 'INVALID_INPUT' });
    }
  }
  for (const method of ['swapLauncher', 'openLauncherStore']) await assert.rejects(engine[method](serial), { code: 'INVALID_INPUT' });
  assert.deepEqual(calls, []);
});

test('switching between registered ready launchers still verifies focused HOME', async t => {
  const { engine, changes } = await fixture(t, { extraInstalled: REPLACEMENT_LAUNCHERS.map(entry => entry.package) });
  for (const entry of [...REPLACEMENT_LAUNCHERS, REPLACEMENT_LAUNCHERS[0]]) {
    assert.equal((await engine.swapLauncher(serial, entry.package)).failed, 0);
    assert.equal((await engine.launcherStatus(serial, entry.package)).home, entry.package);
  }
  assert.deepEqual(changes('disable-user'), stock.slice(0, 2));
});

for (const { package: first, name } of REPLACEMENT_LAUNCHERS) {
  test(name + ': failed cross-launcher verification restores and verifies original HOME', async t => {
    const second = REPLACEMENT_LAUNCHERS.find(entry => entry.package !== first).package;
    const { engine, options, disabled, changes } = await fixture(t, { replacement: first, extraInstalled: [second] });
    assert.equal((await engine.swapLauncher(serial, first)).failed, 0);
    options.focusByPress = { 4: ['com.example.wronghome'] };
    const result = await engine.swapLauncher(serial, second);
    assert.equal(result.results[0].reason, 'LAUNCHER_SWAP_ROLLED_BACK');
    assert.deepEqual(changes('enable'), stock);
    assert.deepEqual([...disabled], []);
    assert.equal((await engine.launcherStatus(serial, second)).home, stock[0]);
  });
}

test('FLauncher restore failures identify original HOME or FLauncher rather than Projectivy', async t => {
  const replacement = REPLACEMENT_LAUNCHERS[1].package;
  for (const noStock of [false, true]) for (const method of ['restoreLauncher', 'restore']) {
    const { engine } = await fixture(t, { replacement, noStock, alwaysReplacement: true, setHomeFailure: true });
    const result = await engine[method](serial, ...(method === 'restore' ? ['all'] : []));
    assert.equal(result.results.at(-1).reason, noStock ? 'LAUNCHER_STOCK_MISSING' : 'LAUNCHER_RESTORE_FAILED');
    assert.equal(result.results.at(-1).package, noStock ? replacement : stock[0]);
  }
  const { engine, journal, disabled } = await fixture(t, { replacement, alwaysReplacement: true, setHomeFailure: true });
  for (const pkg of stock) disabled.add(pkg);
  await journal.append('LAUNCHER_TEST', { action: 'swap', status: 'pending', replacement, disabled: stock });
  assert.equal((await engine.recoverLauncher(serial)).results.at(-1).package, stock[0]);
});
