import { CleanTvError, ErrorCode } from './errors.js';
import { appendRecovery, warnJournal } from './journal.js';

export const REPLACEMENT_LAUNCHERS = Object.freeze(['com.spocky.projengmenu']);
// HOME packages only; recommendation and channel services are deliberately excluded.
export const STOCK_LAUNCHERS = Object.freeze([
  'com.google.android.apps.tv.launcherx',
  'com.google.android.tvlauncher',
  'com.google.android.leanbacklauncher',
  'com.mitv.tvhome.atv',
  'com.hisense.tv.customerlauncher',
]);

export function assertReplacement(pkg) {
  if (!REPLACEMENT_LAUNCHERS.includes(pkg)) throw new CleanTvError(ErrorCode.INVALID_INPUT);
}

function unsupportedPlatform({ info, installed }, props) {
  const identity = [info.brand, info.manufacturer, info.model, props['ro.product.device'], props['ro.build.display.id']].join(' ');
  if (/amazon/i.test(info.manufacturer) || /amazon/i.test(info.brand) || /^AFT/i.test(info.model)
    || installed.includes('com.amazon.tv.launcher')) {
    return 'Fire OS supports debloating only; launcher switching is unsupported.';
  }
  if (/cvte/i.test(identity) || installed.some(pkg => pkg.startsWith('com.cvte.'))) {
    return 'This CVTE-board TV does not support launcher switching.';
  }
  const xiaomi = /xiaomi|redmi/i.test(identity)
    || installed.some(pkg => pkg.startsWith('com.mitv.') || pkg.startsWith('com.xiaomi.mitv.'));
  if (xiaomi && (installed.includes('com.mitv.tvhome') || installed.includes('com.xiaomi.mitv.settings')
    || /\.cn(?:\b|$)/i.test(props['ro.build.display.id'] ?? '')
    || !['com.mitv.tvhome.atv', 'com.google.android.apps.tv.launcherx',
      'com.google.android.tvlauncher'].some(pkg => installed.includes(pkg)))) {
    return 'This Xiaomi TV may use the China-market home system; launcher switching is unsupported.';
  }
  return null;
}

/** Dedicated launcher operations; ordinary package cleanup never uses this path. */
export function createLauncherActions({ client, journal, context }) {
  const swapping = new Set();
  const checks = new Map();
  async function status(serial, ctx) {
    const { installed, info } = ctx ?? await context(serial);
    const disabled = await client.listPackages(serial, { disabledOnly: true });
    const candidates = await client.listHomeCandidates(serial);
    const pkg = REPLACEMENT_LAUNCHERS[0];
    return {
      home: info.homePackage,
      replacement: { package: pkg, installed: installed.includes(pkg),
        enabled: installed.includes(pkg) && !disabled.includes(pkg), isHomeCandidate: candidates.includes(pkg) },
      stock: STOCK_LAUNCHERS.map(packageName => ({ package: packageName, installed: installed.includes(packageName),
        enabled: installed.includes(packageName) && !disabled.includes(packageName) })),
    };
  }

  const record = (action, pkg, status, error) => ({ at: new Date().toISOString(), action, package: pkg, status,
    ...(error ? { error } : {}) });
  const summary = results => ({ succeeded: results.filter(item => item.result !== 'failed').length,
    failed: results.filter(item => item.result === 'failed').length, results });
  const swapRecord = (replacement, disabled, status) => ({ at: new Date().toISOString(), action: 'swap',
    status, replacement, disabled: [...disabled] });

  async function enabled(serial, pkg) {
    return (await client.listPackages(serial)).includes(pkg)
      && !(await client.listPackages(serial, { disabledOnly: true })).includes(pkg);
  }

  async function actualHome(serial) {
    await client.pressHome(serial);
    let previous = null;
    let focused = null;
    // Activity focus can lag behind HOME, including when the first read already matches.
    for (let sample = 0; sample < 5; sample++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      previous = focused;
      focused = await client.focusedPackage(serial);
    }
    return focused && focused === previous ? focused : null;
  }

  // Recovery must still reach the TV when the journal is damaged or storage is full.
  async function recover(serial, deviceId, pkgs, outcome) {
    const results = [];
    for (const pkg of pkgs) {
      await appendRecovery(journal, deviceId, record('enable', pkg, 'pending'), outcome);
      let reason;
      try {
        const accepted = await client.enableUser(serial, pkg);
        if (!accepted || !await enabled(serial, pkg)) reason = ErrorCode.COMMAND_FAILED;
      } catch (error) { reason = error.code ?? ErrorCode.COMMAND_FAILED; }
      await appendRecovery(journal, deviceId, record('enable', pkg, reason ? 'failed' : 'ok', reason), outcome);
      results.push({ package: pkg, result: reason ? 'failed' : 'enabled', ...(reason ? { reason } : {}) });
    }
    return results;
  }

  async function stockHome(serial) {
    const home = await actualHome(serial);
    return STOCK_LAUNCHERS.includes(home) && await enabled(serial, home);
  }

  async function restoreHome(serial, targets) {
    try {
      if (await stockHome(serial)) return true;
      const candidates = await client.listHomeCandidateComponents(serial);
      for (const component of candidates) {
        const pkg = component.split('/')[0];
        if (targets.includes(pkg) && await enabled(serial, pkg)) {
          await client.setHomeActivity(serial, component);
          break;
        }
      }
      return await stockHome(serial);
    } catch { return false; }
  }

  async function healthCheck(serial, ctx, repair = false) {
    const outcome = {};
    if (swapping.has(serial)) return outcome;
    let marker;
    try { marker = (await journal?.read(ctx.info.deviceId))?.filter(item => item.action === 'swap').at(-1); }
    catch (error) { warnJournal(error, outcome); }
    const disabled = await client.listPackages(serial, { disabledOnly: true });
    // A swap that began while we were reading owns recovery; re-enabling now would undo it.
    if (swapping.has(serial)) return outcome;
    const stocks = STOCK_LAUNCHERS.filter(pkg => ctx.installed.includes(pkg));
    const unhealthy = stocks.some(pkg => disabled.includes(pkg))
      && (!ctx.installed.includes(ctx.info.homePackage) || disabled.includes(ctx.info.homePackage));
    if (marker?.status !== 'pending' && !unhealthy) return outcome;
    if (!repair) return { ...outcome, needsRecovery: true,
      ...(stocks.length ? { manualHomePackage: stocks[0] } : {}) };
    const results = await recover(serial, ctx.info.deviceId, stocks.filter(pkg => disabled.includes(pkg)), outcome);
    const verified = await restoreHome(serial, stocks);
    const recovered = verified && results.every(item => item.result === 'enabled');
    if (!verified) results.push({ package: REPLACEMENT_LAUNCHERS[0], result: 'failed',
      reason: stocks.length ? ErrorCode.LAUNCHER_RESTORE_FAILED : ErrorCode.LAUNCHER_STOCK_MISSING });
    if (recovered) {
      await appendRecovery(journal, ctx.info.deviceId,
        swapRecord(marker?.replacement ?? REPLACEMENT_LAUNCHERS[0], marker?.disabled ?? [], 'rolled-back'), outcome);
    }
    return { ...summary(results), ...outcome, ...(recovered ? { recovered: true } : {}),
      ...(!verified && stocks.length ? { manualHomePackage: stocks[0] } : {}) };
  }

  async function recoverLauncher(serial) {
    if (checks.has(serial)) return checks.get(serial);
    const pending = (async () => {
      const ctx = await context(serial);
      return { succeeded: 0, failed: 0, results: [], ...await healthCheck(serial, ctx, true) };
    })();
    checks.set(serial, pending);
    try { return await pending; }
    finally { checks.delete(serial); }
  }

  return {
    checkLauncherHealth: healthCheck,
    recoverLauncher,
    restoreHome,
    actualHome,
    async launcherStatus(serial) {
      const ctx = await context(serial);
      const outcome = await healthCheck(serial, ctx);
      return { ...await status(serial, ctx), ...outcome };
    },
    async openLauncherStore(serial, pkg) {
      assertReplacement(pkg);
      await context(serial);
      await client.openPlayStore(serial, pkg);
    },
    async swapLauncher(serial, replacement, onProgress = () => {}) {
      assertReplacement(replacement);
      // Never interleave with a health check that is still re-enabling stock launchers.
      while (checks.has(serial)) await checks.get(serial).catch(() => {});
      const ctx = await context(serial);
      const reason = unsupportedPlatform(ctx, await client.getprops(serial));
      if (reason) throw new CleanTvError(ErrorCode.LAUNCHER_UNSUPPORTED, reason);
      const before = await status(serial, ctx);
      for (const condition of ['installed', 'enabled', 'isHomeCandidate']) {
        if (!before.replacement[condition]) {
          throw new CleanTvError(ErrorCode.LAUNCHER_NOT_READY, ErrorCode.LAUNCHER_NOT_READY, { condition });
        }
      }
      const targets = before.stock.filter(item => item.installed && item.enabled).map(item => item.package);
      if (![...targets, replacement].includes(await actualHome(serial))) {
        throw new CleanTvError(ErrorCode.LAUNCHER_NOT_READY, ErrorCode.LAUNCHER_NOT_READY, { condition: 'actualHome' });
      }
      const component = (await client.listHomeCandidateComponents(serial))
        .find(candidate => candidate.split('/')[0] === replacement);
      if (!component) throw new CleanTvError(ErrorCode.LAUNCHER_NOT_READY);
      const attempted = [];
      const disabledBySwap = [];
      const outcome = {};
      swapping.add(serial);
      try {
        await journal.append(ctx.info.deviceId, swapRecord(replacement, [], 'pending'));
        for (const [i, pkg] of targets.entries()) {
          await journal.append(ctx.info.deviceId, record('disable', pkg, 'pending'));
          // An interrupted command can have changed the TV before returning an error.
          attempted.push(pkg);
          let reason;
          try {
            const accepted = await client.disableUser(serial, pkg);
            const disabled = await client.listPackages(serial, { disabledOnly: true });
            if (!accepted || !disabled.includes(pkg)) throw new CleanTvError(ErrorCode.COMMAND_FAILED);
          } catch (error) {
            reason = error.code ?? ErrorCode.COMMAND_FAILED;
            throw error;
          } finally {
            await journal.append(ctx.info.deviceId, record('disable', pkg, reason ? 'failed' : 'ok', reason));
          }
          disabledBySwap.push(pkg);
          await journal.append(ctx.info.deviceId, swapRecord(replacement, disabledBySwap, 'pending'));
          onProgress({ done: i + 1, total: targets.length, package: pkg, result: 'disabled' });
        }
        await client.setHomeActivity(serial, component);
        if (await actualHome(serial) !== replacement || !await enabled(serial, replacement)
          || !(await client.listHomeCandidates(serial)).includes(replacement)) {
          throw new CleanTvError(ErrorCode.COMMAND_FAILED);
        }
        await journal.append(ctx.info.deviceId, swapRecord(replacement, disabledBySwap, 'ok'));
        return summary([{ package: replacement, result: 'switched' }]);
      } catch (error) {
        let toEnable = attempted;
        try {
          const disabled = await client.listPackages(serial, { disabledOnly: true });
          toEnable = attempted.filter(pkg => disabled.includes(pkg));
        } catch { /* Unknown state: conservatively enable every attempted stock package. */ }
        const rollback = await recover(serial, ctx.info.deviceId, toEnable, outcome);
        let verified = false;
        let homeVerified = false;
        const stocks = before.stock.filter(item => item.installed).map(item => item.package);
        try {
          verified = homeVerified = await restoreHome(serial, stocks);
          for (const pkg of attempted) verified = await enabled(serial, pkg) && verified;
        } catch { /* The failure result must not claim recovery without verification. */ }
        if (verified && rollback.every(item => item.result === 'enabled')) {
          await appendRecovery(journal, ctx.info.deviceId, swapRecord(replacement, disabledBySwap, 'rolled-back'), outcome);
        }
        const result = { package: replacement, result: 'failed',
          reason: verified && rollback.every(item => item.result === 'enabled')
            ? ErrorCode.LAUNCHER_SWAP_ROLLED_BACK : ErrorCode.LAUNCHER_ROLLBACK_FAILED,
          cause: error.code ?? ErrorCode.COMMAND_FAILED, rollback };
        onProgress({ done: targets.length, total: targets.length, ...result });
        return { ...summary([result]), ...outcome, ...(!homeVerified && stocks.length ? { manualHomePackage: stocks[0] } : {}) };
      } finally { swapping.delete(serial); }
    },
    async restoreLauncher(serial, onProgress = () => {}) {
      const { info, installed } = await context(serial);
      const targets = STOCK_LAUNCHERS.filter(pkg => installed.includes(pkg));
      const results = [];
      const outcome = {};
      for (const pkg of targets) {
        results.push(...await recover(serial, info.deviceId, [pkg], outcome));
        onProgress({ done: results.length, total: targets.length, ...results.at(-1) });
      }
      const verified = await restoreHome(serial, targets);
      if (!verified) {
        results.push({ package: REPLACEMENT_LAUNCHERS[0], result: 'failed',
          reason: targets.length ? ErrorCode.LAUNCHER_RESTORE_FAILED : ErrorCode.LAUNCHER_STOCK_MISSING });
      }
      return { ...summary(results), ...outcome, ...(!verified ? { manualHomePackage: targets[0] } : {}) };
    },
  };
}
