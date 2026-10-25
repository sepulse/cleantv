# Fasa 10 — Launcher cleanyourtv dibina dalam CI, dipasang sebagai pilihan

Keputusan pemilik (25 Okt 2026): guna launcher cleanyourtv (MIT, Gathin23) — bina APK dalam CI
kita dan tawarkan sebagai satu pilihan dalam pemilih launcher (Fasa 8, `src/core/launchers.js`).
Kita tidak membina launcher sendiri dan tidak mengubah reka bentuk launcher mereka.

Rujukan baca-sahaja: `https://github.com/Gathin23/cleanyourtv` — `launcher/` (Gradle, minSdk 26,
pakej `com.gathin.tvhome`), `launcher/build-and-install.sh` (langkah pasang, `cmd package compile`,
semakan HOME, `rollback_home`), `PROMPT.md` (seksyen Launcher, konfigurasi minimum), `LICENSE`
(MIT + fon Outfit OFL), `docs/TROUBLESHOOTING.md`.

## Peraturan kerja

- Surgical, kod minimum, ikut gaya sedia ada. AdbClient hanya kaedah bernama; `execFile` sahaja.
- Model keselamatan L1–L7 kekal. Guard Fasa 8 (HOME sebenar, `LAUNCHER_UNSUPPORTED`, tiada HOME sah)
  terpakai juga kepada launcher ini.
- Jangan ubah kod launcher mereka selain yang perlu untuk build (contoh applicationId, lihat B).

## A. CI (`.github/workflows/release.yml`)

1. Checkout `Gathin23/cleanyourtv` pada **commit SHA yang dipin** dalam fail repo kita
   (contoh `launcher/UPSTREAM.txt`: URL, SHA, tarikh). Jangan bina daripada `main` yang bergerak.
2. Setup JDK + Android SDK (action rasmi, versi dipin), `gradlew assembleRelease` dalam `launcher/`.
3. **Penandatanganan:** keystore tetap daripada GitHub Secrets (contoh `LAUNCHER_KEYSTORE_B64`,
   `LAUNCHER_KEYSTORE_PASSWORD`, `LAUNCHER_KEY_ALIAS`, `LAUNCHER_KEY_PASSWORD`) supaya kemas kini
   APK tidak gagal kerana tandatangan berbeza. Pemilik perlu mencipta secret ini — sediakan arahan
   langkah demi langkah dalam `docs/RELEASE.md`; JANGAN cipta atau muat naik kunci sendiri.
   Jika secret tiada, workflow gagal dengan mesej jelas (jangan jatuh ke kunci debug).
4. APK disalin ke dalam zip (contoh `app/launcher/cleantv-home.apk`), dimasukkan ke `SHA256SUMS.txt`,
   dan diattest bersama zip. Juga dimuat naik sebagai aset release.

## B. Identiti aplikasi

- Tetapkan applicationId kita sendiri (contoh `io.github.sepulse.cleantv.home`) semasa build supaya
  tidak bertembung dengan launcher cleanyourtv yang mungkin sudah dipasang pengguna sendiri.
- Nama paparan: "CleanTV Home" dengan kredit "berdasarkan Clean Your TV oleh Gathin" dalam UI dan
  README. Jangan guna jenama/logo mereka seolah-olah produk mereka.
- Tambah `THIRD_PARTY_NOTICES.md` (jika belum ada daripada Fasa 9): notis MIT cleanyourtv + OFL Outfit.

## C. Pemasangan dalam CleanTV

1. Registry launcher (`src/core/launchers.js`): entri baharu dengan `source: 'bundled'`
   (Projectivy/FLauncher kekal `source: 'play'`).
2. Kaedah bernama baharu dalam AdbClient, contoh `installBundledLauncher()` → `adb install -r <laluan>`.
   Laluan APK **tetap** (di bawah folder aplikasi), tidak pernah daripada input pengguna.
   Sebelum pasang: sahkan SHA-256 APK sepadan dengan manifest yang dibina bersama zip.
3. Prasyarat: `ro.build.version.sdk` ≥ minSdk launcher; jika tidak → `LAUNCHER_UNSUPPORTED`.
   Fire OS / CVTE / Xiaomi China tetap ditolak (Fasa 8).
4. Selepas pasang: ikut aliran swap Fasa 8 (jurnal, semakan HOME sebenar, rollback automatik).
   Langkah tambahan dari `build-and-install.sh` hanya jika perlu dan diterangkan (contoh `cmd package compile`).
5. **Jurnal merekod pemasangan.** "Pulihkan semua" memulihkan HOME asal dahulu, kemudian
   menyahpasang **hanya** pakej yang jurnal buktikan dipasang oleh CleanTV. Pakej TV lain tidak
   pernah dinyahpasang. Kemas kini janji keselamatan dalam README (BM/EN), UI dan
   `docs/ARCHITECTURE.md`: "Tidak memadam aplikasi TV; hanya membuang launcher yang CleanTV sendiri pasang."
6. UI pemilih: launcher terbina menunjukkan butang "Pasang & tukar" (bukan "Buka Play Store").
   Mod demo menyokongnya.

## D. Pengesahan

- Ujian `node --test` untuk: semakan SHA-256, laluan tetap, prasyarat SDK, jurnal install/uninstall,
  "Pulihkan semua" hanya menyahpasang pakej yang dipasang CleanTV, guard Fasa 8 kekal.
- Workflow tidak boleh dijalankan secara tempatan: sahkan sintaks dan, jika Android SDK ada,
  cuba build tempatan; jika tidak, nyatakan jelas bahawa build APK belum diuji sehingga CI berjalan.
- Semakan oleh Codex Sol high (rantaian bekalan, pemasangan, nyahpasang) dalam subagent berasingan.
- Teks BM baharu melalui Gemini agy (kekalkan istilah English: launcher, APK, home app).

## Siap bila

`npm test` hijau; semakan Sol lulus; brief arahan secret untuk pemilik ada dalam `docs/RELEASE.md`;
commit dibuat; tiada push. Laporkan perkara yang memerlukan pemilik: cipta secret, push, dan tag
release baharu untuk menjalankan CI.
