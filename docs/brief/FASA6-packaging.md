# Brief — Phase 6: Packaging (portable Windows build) + adb fetch

Repo: `D:\Project\Deep\cleantv`. Read `docs/ARCHITECTURE.md` D1/D3 and
`src/core/adb/locate.js`.

**Decision (replaces the Node SEA idea in PLAN.md):** ship a **portable folder/zip**,
not a single exe. It needs no bundler, no postject, and no asset-API changes in the
server. Users unzip and double-click `CleanTV.cmd`. Update ARCHITECTURE D1/D3 and
PLAN.md Phase 6 row to say this (only doc edits allowed besides README).

## Rules (mandatory)

Surgical, in-scope, simplicity first, Node built-ins only (no npm deps, dev or
runtime). Never write uninstall, pm clear, settings put, wipe, reboot, `rm `,
`shell: true` or `exec(` under `src/` (scripts/ may delete its own temp/dist dirs
with `fs.rm`, nothing else).

## Files

- `scripts/fetch-adb.js` — download Google's official platform-tools zip over HTTPS
  (`https://dl.google.com/android/repository/platform-tools-latest-{windows|darwin|linux}.zip`,
  chosen by `--platform`, default current), extract with the OS's own tool via
  `execFile` (`tar -xf` on Windows 10+/macOS, `unzip` on Linux) into
  `vendor/platform-tools/`, then run `adb version` to verify. Idempotent; `--force`
  re-downloads. Clear error messages.
- `scripts/build-portable.js` — builds `dist/CleanTV-win-x64/` containing: `node.exe`
  (copied from `process.execPath`, only when building on Windows x64; otherwise
  require `--node <path>`), `app/` (package.json, src/, public/, presets/ — no test/,
  no docs/), `app/vendor/platform-tools/` (runs fetch-adb for windows if missing),
  `CleanTV.cmd` (starts `node.exe app\src\server\index.js --open`, keeps the window
  open with a bilingual one-line note "Jangan tutup tetingkap ini / Do not close this
  window"), `CleanTV-Demo.cmd` (`--demo`), `BACA-SAYA.txt` / `README.txt` (bilingual
  quick start, plain words). Then zips it to `dist/CleanTV-win-x64.zip` with
  `tar -a -c -f` (Windows) — skip zipping elsewhere with a message.
- `package.json` scripts: `"fetch-adb"`, `"build:win"`.
- `README.md` — bilingual (Malay first, then English): what it does, safety promise
  (disable not uninstall, one-click restore, factory reset restores everything),
  quick start for users (portable zip), developer section (npm test, npm run demo,
  npm start, build), platform-tools licence note (Google's Android SDK terms; the
  portable build fetches the official binaries).
- `.gitignore`: add `dist/`.
- `test/scripts.test.js` — unit-test the pure parts (URL selection per platform,
  path layout of the build, cmd file contents) without network.

## Done when

`cmd /c npm test` green; `node scripts/build-portable.js` produces the folder and zip
on this Windows machine (network is available). Report sizes, test summary and any
interpreted point.
