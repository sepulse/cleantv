# Fasa 8 — Guard keselamatan launcher, NEVER_TOUCH, pemilih launcher

Repo: `D:\Project\Deep\cleantv` (branch `main`, remote `sepulse/cleantv`).
Baca dahulu: `docs/ARCHITECTURE.md` (§2 model keselamatan, §5 kontrak API),
`src/core/safety.js`, `src/core/launchers.js`, `src/core/engine.js`,
`src/core/adb/client.js`, `src/server/routes.js`, `public/js/screens/launcher.js`.

Rujukan: repo cleanyourtv (MIT, Gathin23) — clone baca-sahaja ke folder baharu yang
kosong, contohnya `git clone --depth 1 https://github.com/Gathin23/cleanyourtv`.
Jangan jalankan apa-apa kod daripadanya. Fail berguna: `PROMPT.md` (seksyen Launcher),
`launcher/build-and-install.sh` (`rollback_home`), `docs/TROUBLESHOOTING.md` (~baris 228–330),
`examples/*/debloat.txt` (blok "DO NOT DISABLE").

## Peraturan kerja (wajib, sampaikan juga kepada builder)

- **Surgical:** ubah hanya apa yang diperlukan oleh brief ini. Ikut gaya kod sedia ada
  (Node 24 ESM + JSDoc, tiada dependency, `execFile` sahaja, AdbClient hanya ada kaedah bernama).
- **Simplicity first:** kod minimum. Tiada ciri spekulatif atau konfigurasi tambahan.
- Setiap guard baharu ada ujian dalam `test/` (gaya `node --test`, FakeAdb sedia ada). `npm test` mesti hijau.
- Model keselamatan L1–L7 kekal; tiada laluan baharu yang memintas allowlist registry.

## Bahagian A — NEVER_TOUCH (`src/core/safety.js`)

Tambah ke `NEVER_TOUCH` (tepat) atau semakan awalan (sama seperti `com.android.providers.`):

- Tepat: `com.google.android.ext.services`, `com.google.android.ext.shared`,
  `com.android.ext.services`, `com.android.ext.shared`, `com.google.android.modulemetadata`,
  `com.android.devicelockcontroller`, `com.cvte.tv.hkcfac`, `com.cvte.tv.fac.menu`,
  `mediatek.factorymenu.ui`, `com.tcl.cyberui`, `com.tcl.providers.config`,
  `com.tcl.system.server`, `com.tcl.factory.view`, `com.tianci.movieplatform`,
  `com.sony.dtv.b2b.hotelmode`, `com.droidlogic.tvinput`, `org.droidtv.eum`,
  `org.droidtv.aurora`, `org.droidtv.xtv`, `com.amazon.imp`, `com.amazon.tv.oobe`.
- Awalan: `com.google.android.overlay.modules`, `com.mediatek.`, `com.at.factory.`, `com.jamdeo.tv.`.
- Sahkan setiap nama dengan sumber dalam cleanyourtv; buang yang tidak dapat disahkan dan laporkan.
- Ujian: tiada entri preset yang bertembung dengan senarai ini. Jika ada yang bertembung, jangan
  ubah preset senyap-senyap — laporkan.
- Teks kesan (`effect`/`ms`) untuk `com.google.android.backdrop` (android-tv.json) dan
  `com.google.android.apps.tv.dreamx` (google-tv.json): nyatakan bahawa screensaver TV perlu ditukar
  kepada screensaver lain dahulu (rujuk nota cleanyourtv `examples/tcl-32s5k`). Teks BM disemak Gemini.

## Bahagian B — Guard swap launcher

Sebelum dan selepas swap (`swapLauncher` / `restoreHome` dalam engine):

1. **Pengesahan HOME sebenar:** selepas swap, tekan HOME (`input keyevent KEYCODE_HOME`) dan baca
   aplikasi fokus (`dumpsys activity activities`, baris `mFocusedApp` / `ResumedActivity`).
   Jika pakej fokus bukan launcher pilihan → rollback automatik sedia ada. Sebab: pada Google TV
   `set-home-activity` boleh cetak "Success" tanpa kesan. Tambah kaedah bernama dalam AdbClient
   (contoh `pressHome()`, `focusedPackage()`), dengan parser yang diuji.
2. **Tiada HOME lain → tolak:** jangan matikan launcher asal jika launcher pilihan bukan calon HOME
   yang sah. Abaikan launcher factory/test (contoh pakej yang mengandungi `factory`/`factorytest`)
   semasa mengira calon.
3. **Peraturan platform (kod ralat baharu `LAUNCHER_UNSUPPORTED`, sebab dalam mesej):**
   Fire OS (Amazon) → debloat sahaja, tiada swap; TV papan CVTE dan Xiaomi pasaran China → tiada swap.
   Ambil cara pengesanan (prop `ro.*`) daripada dokumen cleanyourtv; jika tidak pasti, pilih yang
   lebih ketat (tolak).
4. Kemas kini `docs/ARCHITECTURE.md` (§2 dan §5) dan i18n `en.json`/`ms.json` untuk mesej baharu.

## Bahagian C — Pemilih launcher

- Ganti `REPLACEMENT_LAUNCHERS = ['com.spocky.projengmenu']` dengan registry kecil dalam kod:
  `{ package, name, }` untuk Projectivy (`com.spocky.projengmenu`), FLauncher dan Wolf Launcher.
  **Sahkan nama pakej FLauncher dan Wolf Launcher daripada Play Store sebelum menambahnya**; jika
  tidak dapat disahkan, tinggalkan dan laporkan.
- Route status / swap / buka Play Store menerima `package`, disahkan terhadap registry (fail-closed;
  kod ralat sedia ada untuk pakej tidak sah).
- UI `public/js/screens/launcher.js`: pilihan "Kekal launcher asal" (default, tiada tindakan) +
  satu pilihan bagi setiap launcher dalam registry, dengan status dipasang/sedia. Ikut `docs/DESIGN.md`.
- Mod demo (`src/server/demo-client.js`) menyokong semua launcher dalam registry.
- Teks UI baharu dwibahasa; teks BM melalui Gemini (`agy.exe`, lihat memori `gemini-cli`), dengan arahan:
  kekalkan istilah teknikal English (launcher, home app, Play Store), jangan tambah apa-apa yang
  tiada dalam sumber, kekalkan struktur.

## Di luar skop

Import senarai pakej cleanyourtv ke preset, Private DNS, tutup ADB, simpan getprop/settings,
semakan selepas reboot, sokongan Fire TV debloat. (Calon fasa seterusnya.)

## Aliran kerja

1. Bina melalui subagent `codex:codex-rescue` (GPT-6 high; jangan hantar `--model gpt-6`;
   tambah "Proceed immediately and complete the whole task in this turn; do not ask for confirmation.").
   Bahagian A+B dahulu, kemudian C.
2. Semakan dalam subagent berasingan (Codex Sol high untuk A+B kerana berisiko; Sonnet/GPT-6 medium untuk C).
   Maksimum 3 pusingan.
3. QA visual skrin launcher (BM/EN, desktop/telefon) dalam mod demo — satu helaian gabungan sahaja.
4. Ujian hijau + semakan lulus → commit sendiri. Push perlu kebenaran pemilik (satu soalan di hujung).
5. Kemas kini `STATUS.md`.

## Siap bila

- `npm test` hijau dengan ujian baharu untuk setiap guard dan parser.
- Swap ditolak dengan mesej jelas untuk Fire OS / CVTE / Xiaomi China / tiada HOME sah.
- Swap yang "Success" tetapi HOME tidak berubah → rollback automatik (diuji dengan FakeAdb).
- Pengguna boleh pilih launcher atau kekal launcher asal; demo berfungsi; teks BM/EN lengkap.
