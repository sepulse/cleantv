# Brief — Phase 5: Home-screen ad removal via launcher swap (Projectivy)

Repo: `D:\Project\Deep\cleantv`. Read `docs/ARCHITECTURE.md` (§2 safety model),
`docs/DESIGN.md`, `docs/PLAN.md` "Risiko terbuka", `src/core/*`, `src/server/*`,
`public/js/*`.

On Google TV the home-screen video ads come from the stock launcher itself
(`com.google.android.apps.tv.launcherx`); on Xiaomi from PatchWall; etc. The only
reliable removal is to make a clean launcher (Projectivy Launcher,
`com.spocky.projengmenu`, from Play Store) the HOME app. Done wrong, the Home
button does nothing and a non-technical user thinks the TV is broken. This phase
must make that impossible.

## Rules (mandatory)

- Surgical, in-scope; simplicity first; Node built-ins only; no new screens beyond
  one optional "Remove home-screen ads (advanced)" card + its step flow.
- Never write uninstall, pm clear, settings put, wipe, reboot, `rm `, `shell: true`,
  `exec(` under `src/`. The general `disable` path keeps refusing launchers
  (`PACKAGE_IS_LAUNCHER` / red) — the swap is a separate, dedicated code path.
- No APK downloads or sideloading. Projectivy is installed by the user from Play Store.
- All UI strings via i18n keys in `en.json`; copy the English values into `ms.json`
  (Gemini translates later).

## Required behaviour

1. **Allowlists in code:** `REPLACEMENT_LAUNCHERS = ['com.spocky.projengmenu']`;
   `STOCK_LAUNCHERS` = the stock launcher packages already marked red/launcher in the
   presets (at least `com.google.android.apps.tv.launcherx`,
   `com.google.android.tvlauncher`, plus brand launchers present in
   `presets/*.json` with category `launcher`).
2. **New AdbClient methods** (named, validated, no generic shell):
   - `openPlayStore(serial, pkg)` — only for packages in `REPLACEMENT_LAUNCHERS`:
     `am start -a android.intent.action.VIEW -d market://details?id=<pkg>`.
   - `listHomeCandidates(serial)` — `cmd package query-activities --brief -a
     android.intent.action.MAIN -c android.intent.category.HOME` → package names.
3. **`engine.launcherStatus(serial)`** → `{ home, replacement: { package, installed,
   enabled, isHomeCandidate }, stock: [{ package, installed, enabled }] }`.
4. **`engine.swapLauncher(serial, replacement, onProgress)`** — preconditions, all
   required: replacement in allowlist, installed, enabled, and present in
   `listHomeCandidates`. Then for each installed+enabled stock launcher: journal
   pending → `disableUser` → journal. Then **verify**: `resolveHomeActivity` must
   return the replacement. If verification fails or any step throws → **automatic
   rollback**: re-enable every stock launcher disabled in this run, verify, report
   `failed` with reason. Choose and justify (in the report) whether a gentler
   `cmd package set-home-activity` attempt should come first; if you add it, it must
   also be verified and rolled back the same way.
5. **`engine.restoreLauncher(serial, onProgress)`** — enable every stock launcher
   (always allowed), verify HOME resolves to a stock launcher.
6. `restore(serial, 'all')` must also re-enable stock launchers disabled by a swap.
7. **API** (same security rules as Phase 3): `GET /api/devices/:serial/launcher`,
   `POST .../launcher/open-store { package }`, `POST .../launcher/swap { package }` →
   202 job, `POST .../launcher/restore {}` → 202 job. Add the routes to
   ARCHITECTURE §5 (only doc edit allowed).
8. **UI card** in the "Pilih" screen per DESIGN.md style: explains in plain words
   what happens, then steps: (a) "Open Play Store on the TV" button → (b) "Install
   Projectivy Launcher, open it once" → (c) "Check again" (calls status) → (d)
   "Switch home screen" with a confirm modal that says how to undo → progress →
   result. Always shows "Bring back the original home screen".

## Tests

Fake-runner tests for: every precondition refusal; happy path; verify failure →
rollback re-enables exactly what was disabled; exception mid-swap → rollback;
restoreLauncher; restore 'all' includes swap launchers; general `disable` still
refuses launchers; API routes incl. security; `test/public.test.js` still green.

## Done when

`cmd /c npm test` green; report files changed, test summary, the set-home-activity
decision and every interpreted point.
