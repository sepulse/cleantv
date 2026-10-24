# Brief — Phase 7: lite build (no bundled adb) + trust kit

Repo: `D:\Project\Deep\cleantv`. Read `docs/brief/FASA6-packaging.md`,
`scripts/fetch-adb.js`, `scripts/build-portable.js`, `src/core/adb/locate.js`,
`src/server/index.js`, `public/js/screens/start.js`, `README.md`.

Goal: stop redistributing Google's adb binary inside our zip, and give users
verifiable reasons to trust the download.

## Rules (mandatory)

Surgical, in-scope, simplicity first, Node built-ins only (no npm deps). Never write
uninstall, pm clear, settings put, wipe, reboot, `rm `, `shell: true` or `exec(`
under `src/`. Every new UI string via i18n: `en.json` + natural Malay in `ms.json`.
Do not commit.

## 1. Lite build — adb fetched from Google on first run

- `scripts/build-portable.js`: **no longer copies or fetches platform-tools** into the
  build. It must copy `scripts/fetch-adb.js` into `app/scripts/`.
- `CleanTV.cmd`: before starting the server, if
  `%~dp0app\vendor\platform-tools\adb.exe` is missing, print (bilingual, plain words)
  that CleanTV will download Google's official Android platform-tools (~7 MB) from
  dl.google.com, that it is Google's software under Google's terms
  (https://developer.android.com/studio/releases/platform-tools), then run
  `"%~dp0node.exe" "%~dp0app\scripts\fetch-adb.js"`. If it fails (no internet), print a
  bilingual message and still start the app (the UI already shows the adb-missing
  card). `CleanTV-Demo.cmd` must NOT download anything.
- Update the adb-missing card text (`start.missingBody` in both i18n files) to say:
  connect to the internet and open CleanTV.cmd again (it downloads the tool
  automatically); advanced users may set CLEANTV_ADB.
- **Integrity check in `fetch-adb.js` (Windows):** after extracting, verify
  `adb.exe` has a valid Authenticode signature whose signer subject contains
  `Google` — via `execFile` of
  `powershell.exe -NoProfile -NonInteractive -Command "(Get-AuthenticodeSignature -LiteralPath '<path>') | Select-Object Status, @{n='Subject';e={$_.SignerCertificate.Subject}} | ConvertTo-Json"`
  (pass the path safely; reject paths containing `'`). Status must be `Valid`. On
  failure delete only the just-extracted `platform-tools` folder and report a clear
  error. (macOS/Linux: skip with a note — the portable build is Windows-only.)
- Keep the HTTPS + Google-host redirect validation already in `fetch-adb.js`.

## 2. SmartScreen — mitigate honestly (no paid signing now)

- `BACA-SAYA.txt` / `README.txt` (generated) and `README.md`: one short bilingual
  note: Windows may warn because CleanTV is new and not code-signed; choose
  **More info → Run anyway**, or before extracting: right-click the zip →
  **Properties** → tick **Unblock** → OK. Explain that `node.exe` is signed by the
  OpenJS Foundation and `adb.exe` (downloaded on first run) by Google; the rest is
  plain, readable JavaScript/HTML text files.

## 3. Trust kit

- `scripts/build-portable.js`: after zipping, write `dist/SHA256SUMS.txt`
  (`<sha256>  CleanTV-win-x64.zip`) using `node:crypto`; print it.
- `.github/workflows/release.yml`: on tag `v*`: checkout, setup Node 24 (windows-latest),
  `node --test "test/*.test.js"`, `node scripts/build-portable.js`, attest the zip with
  `actions/attest-build-provenance@v2` (permissions: `id-token: write`,
  `attestations: write`, `contents: write`), and upload the zip + `SHA256SUMS.txt` to
  the GitHub Release (use `gh release upload` or `softprops/action-gh-release@v2`).
  Not run now (no remote yet) — just correct.
- `README.md`: new bilingual section **"Keselamatan & privasi / Security & privacy"**,
  plain words, only true statements: open source (link placeholder
  `[PAUTAN REPO]`); the app runs only on this computer (server on 127.0.0.1, no
  account, no telemetry, no data sent anywhere; the only internet use is the one-time
  adb download from Google); it only turns apps off and every action can be undone;
  how to verify a download: compare the SHA-256 with `SHA256SUMS.txt`
  (`certutil -hashfile CleanTV-win-x64.zip SHA256` on Windows), check the GitHub
  build attestation (`gh attestation verify CleanTV-win-x64.zip --repo <owner>/<repo>`),
  and the VirusTotal report link in each release's notes (placeholder).
- `docs/RELEASE.md` (Malay, short): release checklist — tag, CI build, verify
  SHA256SUMS, upload zip to VirusTotal and paste the report link in release notes,
  update `[PAUTAN MUAT TURUN]` in `docs/marketing/posting-media-sosial.md`.

## Tests

Update `test/scripts.test.js`: build layout has no `vendor/platform-tools` and has
`app/scripts/fetch-adb.js`; `.cmd` text matches an independently written expected
string (download branch only in CleanTV.cmd); signature-check parser accepts
`{"Status":0|"Valid","Subject":"CN=Google LLC, ..."}` and rejects unsigned/other
signers (keep the PowerShell call injectable); SHA256SUMS format. i18n key parity
stays green.

## Done when

`node --test "test/*.test.js"` green; `node scripts/build-portable.js` produces a zip
without adb (report its size) and `dist/SHA256SUMS.txt`; run
`dist/CleanTV-win-x64/node.exe dist/CleanTV-win-x64/app/scripts/fetch-adb.js` once to
prove first-run download + signature check works, then delete that downloaded
`dist/.../vendor` folder again so the zip stays lite. Report all of it.
