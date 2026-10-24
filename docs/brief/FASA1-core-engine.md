# Brief — Phase 1: Core ADB Engine

Repo: `D:\Project\Deep\cleantv`. Read `docs/ARCHITECTURE.md` first (it is in Malay;
technical terms are English). It is the source of truth; do not change it.

## Rules (mandatory)

- **Surgical / in-scope only.** Build exactly what is listed below. No HTTP server,
  no frontend, no brand presets beyond `common-android-tv.json`, no extra features,
  no config options nobody asked for.
- **Simplicity first.** Minimum code that solves the problem. No single-use
  abstractions, no classes where a function does.
- **Zero runtime dependencies.** Node >= 22 built-ins only (`node:child_process`,
  `node:fs/promises`, `node:net`, `node:os`, `node:path`, `node:test`, `node:assert`).
  ESM (`"type": "module"`), JSDoc types on exported functions.
- **Safety model §2 is non-negotiable.** Never write `uninstall`, `pm clear`,
  `rm `, `settings put`, `wipe`, `reboot` anywhere under `src/`.

## Files to create

```
package.json                 name "cleantv-web", private, type module, engines node>=22,
                             scripts: test = "node --test test/", smoke = "node src/cli/smoke.js"
.gitignore                   node_modules, vendor/, *.log, .cleantv-data/
src/core/errors.js
src/core/adb/locate.js
src/core/adb/runner.js
src/core/adb/client.js
src/core/safety.js
src/core/device.js
src/core/packages.js
src/core/registry.js
src/core/journal.js
src/core/discovery.js
src/core/engine.js
src/cli/smoke.js
presets/SCHEMA.md
presets/common-android-tv.json
test/*.test.js               one file per core module + test/forbidden-commands.test.js
test/helpers/fake-runner.js
```

## Module contracts

**errors.js** — `class CleanTvError extends Error { code; details }` and a frozen
`ErrorCode` object with exactly the codes listed in ARCHITECTURE §5.

**adb/locate.js** — `locateAdb({ env, platform, exists }) -> Promise<string>`:
order `env.CLEANTV_ADB` → `<repo>/vendor/platform-tools/adb(.exe)` → `adb` on PATH
(resolve by trying `adb version`). Throws `ADB_NOT_FOUND`. Dependencies injectable
for tests.

**adb/runner.js** — `createRunner(adbPath) -> run(args: string[], { timeoutMs = 15000 })
-> Promise<{ stdout, stderr, code }>` using `execFile` (never `exec`, never
`shell: true`). Timeout → `TIMEOUT`. Non-zero exit is returned, not thrown
(callers decide). Missing binary (ENOENT) → `ADB_NOT_FOUND`.

**adb/client.js** — `createAdbClient(run)` returns an object with ONLY these methods
(no generic `shell`):
- `connect(ip, port = 5555)` → runs `adb connect ip:port`, then reads `devices` and
  returns `{ serial, state }` where state ∈ `device | unauthorized | offline | unreachable`.
  Note: `adb connect` prints "connected to" even when the TV has not yet approved
  the key — state must come from `adb devices`. "failed to connect" / "cannot
  connect" / timeout → `unreachable`.
- `disconnect(serial)`
- `devices()` → parse `adb devices -l` → `[{ serial, state, model? }]`
- `getprops(serial)` → `adb -s S shell getprop` → parse `[key]: [value]` lines to an object
- `listPackages(serial, { disabledOnly })` → `pm list packages --user 0` (`-d` if
  disabledOnly) → `string[]` (strip `package:` prefix)
- `disableUser(serial, pkg)` → `pm disable-user --user 0 <pkg>`; success iff output
  contains `new state: disabled-user`
- `enableUser(serial, pkg)` → `pm enable --user 0 <pkg>`; success iff `new state: enabled`
- `resolveHomeActivity(serial)` → `cmd package resolve-activity --brief -a
  android.intent.action.MAIN -c android.intent.category.HOME` → package name of the
  last `pkg/activity` line, or `null`
Every method validates `serial` and `pkg` through `safety.js` validators BEFORE
building args. Shell output may use `\r\n`.

**safety.js**
- `isValidPackageName(s)` — regex in ARCHITECTURE §2 L2, max length 255.
- `isValidSerial(s)` — `IPv4:port`, octets 0–255, port 1–65535.
- `NEVER_TOUCH` — frozen Set; include at least: `android`, `com.android.systemui`,
  `com.android.settings`, `com.android.tv.settings`, `com.android.vending`,
  `com.google.android.gms`, `com.google.android.gsf`, `com.android.packageinstaller`,
  `com.google.android.packageinstaller`, `com.android.permissioncontroller`,
  `com.google.android.permissioncontroller`, `com.android.shell`,
  `com.android.bluetooth`, `com.android.providers.settings`,
  `com.android.providers.media`, `com.android.providers.downloads`,
  `com.android.providers.contacts`, `com.android.webview`,
  `com.google.android.webview`, `com.android.inputmethod.latin`,
  `com.google.android.inputmethod.latin`, `com.google.android.leanback.ime`,
  `com.google.android.tvlauncher`, `com.google.android.apps.tv.launcherx`,
  `com.google.android.tungsten.setupwraith`, `com.google.android.tv.remote.service`,
  `com.android.networkstack`, `com.google.android.networkstack`,
  `com.android.wifi.resources`, `com.android.phone`, `com.android.keychain`.
  Also treat any package starting with `com.android.providers.` as never-touch.
- `assertCanDisable(pkg, { entry, homePackage })` throws `CleanTvError` with:
  `INVALID_INPUT` (bad name) → `PACKAGE_PROTECTED` (NEVER_TOUCH) →
  `PACKAGE_NOT_IN_REGISTRY` (no entry) → `PACKAGE_PROTECTED` (entry.risk === "red")
  → `PACKAGE_IS_LAUNCHER` (pkg === homePackage). Order matters; test each.
- `canDisable(...)` → `{ ok: true } | { ok: false, reason: code }` (non-throwing wrapper).

**device.js** — `getDeviceInfo(client, serial)` → `{ serial, deviceId, brand,
manufacturer, model, androidVersion, sdk, isGoogleTv, homePackage }`.
`deviceId` = first non-empty of `ro.serialno`, `ro.boot.serialno`, else
`${manufacturer}-${model}-${serial}`; sanitize to `[A-Za-z0-9._-]`.
`isGoogleTv` = installed packages include `com.google.android.apps.tv.launcherx`
(pass the package list in, do not shell again if the caller already has it).

**registry.js**
- `validatePreset(obj)` → `{ ok, errors: string[] }` (hand-written, no JSON-schema lib).
  Rejects: unknown risk/category, invalid package names, duplicate package within a
  preset, any NEVER_TOUCH package with risk other than `red`, missing `en` text.
- `loadPresets(dir)` → reads every `*.json` in `presets/`, throws with file name +
  errors if any preset is invalid.
- `matchPresets(presets, deviceInfo)` → presets whose `match` fits
  (`any`, `brand[]`, `manufacturer[]`, `feature: "google-tv"`), case-insensitive.
- `buildEntryIndex(matched)` → `Map<package, entry>`; if two presets list the same
  package, the **stricter** risk wins (red > yellow > green).

**packages.js** — `getPackageStates(client, serial, index, homePackage)` → one call
for all packages, one for `-d`; returns, for each registry entry, the entry fields
plus `{ installed, enabled, canDisable, blockedReason? }`. Entries not installed
are still returned with `installed: false`.

**journal.js** — `createJournal(dataDir)` → `{ append(deviceId, record), read(deviceId),
disabledByUs(deviceId) }`. One JSON file per device (`<deviceId>.json`), written
atomically (write temp file in same dir, then `rename`). Record:
`{ at: ISO string, action: "disable" | "enable", package, status: "pending" | "ok" | "failed", error? }`.
`disabledByUs` = packages whose latest ok record is `disable`. Default data dir:
`%APPDATA%\CleanTV` on Windows, `~/.cleantv` elsewhere (exported helper
`defaultDataDir()`); tests use a temp dir.

**discovery.js** — `scanForAdb({ port = 5555, timeoutMs = 500, concurrency = 64,
signal, interfaces = os.networkInterfaces(), probe })` → `[{ ip, port }]`.
Only private IPv4 (10/8, 172.16/12, 192.168/16), non-internal; scan the /24 around
each address (skip own address, .0, .255); dedupe. `probe(ip, port, timeoutMs)`
defaults to a `net.connect` attempt; injectable for tests. Honors `AbortSignal`.

**engine.js** — `createEngine({ client, journal, presets })` →
- `inspect(serial)` → `{ info, presets: [id], packages }` (packages from packages.js)
- `disable(serial, pkgs, onProgress)` → for each pkg sequentially: check
  `canDisable` → journal `pending` → `disableUser` → re-read state (L7) → journal
  `ok|failed` → `onProgress({ done, total, package, result, reason? })`. A
  blocked package yields `result: "skipped"` with reason and does not stop the run.
  Returns `{ succeeded, failed, skipped, results }`.
- `restore(serial, pkgs | "all", onProgress)` → "all" = journal `disabledByUs`
  ∪ (`listPackages -d` ∩ registry index). `enableUser` needs only L2 validation
  (enabling is always safe). Same journaling + progress shape.

**cli/smoke.js** — `node src/cli/smoke.js <ip> [port]`: READ-ONLY. Connect, print
device info, matched presets, and a table of registry package states. Never calls
disable/enable. Prints a plain message if state is `unauthorized` ("Press Allow on
the TV, then run again").

**presets/common-android-tv.json** — `match: { any: true }`. Include only packages
you are highly confident exist on stock Android TV / Google TV and are safe; 5–10
entries; every entry `verified: false`, a real `sources` URL you are confident of
(XDA / official docs), `ms` fields as empty strings. When unsure, leave it out.
`presets/SCHEMA.md` documents the format (English).

## Tests (`node:test`, no TV needed)

- `test/helpers/fake-runner.js`: maps an args array (joined by space) to canned
  `{ stdout, stderr, code }`; records calls; unknown args → throw.
- Cover: every client parser (incl. `\r\n`, unauthorized, offline, failed connect),
  every `assertCanDisable` branch in order, registry validation failures + strictest
  risk merge, journal atomic write + `disabledByUs`, discovery subnet math with a
  fake probe + abort, engine disable (success, skipped, command failure, verify
  mismatch) and restore "all" union.
- `test/forbidden-commands.test.js`: reads every file under `src/` and fails if it
  contains `uninstall`, `pm clear`, `settings put`, `wipe`, `reboot`, `"rm "`,
  `shell: true`, or `child_process.exec(` / `{ exec }` (execFile only).
- Validate the real `presets/` directory with `loadPresets` in a test.

## Done when

- `npm test` passes (paste the summary line).
- No file outside the list above was created or changed.
- Report: files created, test count, and any spec point you could not satisfy or
  had to interpret (list them explicitly — do not silently deviate).
