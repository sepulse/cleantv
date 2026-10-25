# Fasa 11 — Simpan keadaan asal TV (baseline)

Repo `D:\Project\Deep\cleantv` (`main`). Baca: `docs/ARCHITECTURE.md` §2 (L1–L7), `src/core/engine.js`,
`src/core/journal.js`, `src/core/launchers.js`, `src/core/adb/client.js`, `src/server/demo-client.js`,
`test/forbidden-commands.test.js`. Rujukan idea (MIT, baca sahaja, jangan jalankan):
`D:\Project\Deep\_cyt\src\tools\recovery.py`, `tools/restore.sh`.

## Peraturan kerja (wajib)

- **Surgical:** ubah hanya apa yang brief ini perlukan; ikut gaya sedia ada (ESM + JSDoc, tiada dependency).
- **Simplicity first:** kod minimum, tiada konfigurasi tambahan.
- L1: AdbClient hanya kaedah bernama; tiada `shell` generik. L2–L7 kekal. `npm test` hijau.
- Teks UI baharu: `en` sahaja dalam `public/i18n/en.json`; tambah kunci yang sama dalam `ms.json` dengan nilai
  `""` — Gemini mengisinya kemudian.

## Masalah

"Pulihkan semua" kini menghidupkan `disabledByUs` **dan** semua pakej registry/launcher stok yang sedang dimatikan
(`engine.js` `act`, cabang `pkgs === 'all'`). Pakej yang sudah dimatikan **sebelum** CleanTV (oleh kilang atau
pemilik) turut dihidupkan. Tiada rekod setting asal.

## Kerja

1. **AdbClient** — satu kaedah baca sahaja `getSettings(serial)`: membaca senarai kunci TETAP dalam kod
   (`settings get <ns> <key>`, satu panggilan setiap kunci):
   `global private_dns_mode`, `global private_dns_specifier`, `secure screensaver_components`,
   `global window_animation_scale`, `global transition_animation_scale`, `global animator_duration_scale`.
   Pulangkan `{ 'global/private_dns_mode': value | null, ... }` (`null` untuk output `null`). Tiada parameter kunci
   daripada pemanggil. Tambah ke senarai L1 dalam ARCHITECTURE.
2. **Baseline** dalam `journal.js` (fail sama direktori data, contoh `<deviceId>.baseline.json`, tulis atomik seperti
   `append`): `saveBaseline(deviceId, baseline)` menulis **hanya jika belum wujud** (rekod pertama kekal, seperti
   recovery.py); `readBaseline(deviceId)` → objek atau `null`. Kandungan:
   `{ at, disabledBefore: string[], props: { ro.product.brand, ro.product.manufacturer, ro.product.model,
   ro.build.version.release, ro.build.fingerprint }, settings: <getSettings>, homeComponent }`.
3. **Bila direkod:** dalam engine, sebelum tindakan mengubah yang pertama pada TV itu — `disable`, `swapLauncher`
   (dan kemudian Private DNS, Fasa 13) — jika `readBaseline` memulangkan `null`. `disabledBefore` = senarai
   `listPackages(serial, { disabledOnly: true })` pada saat itu. Jika baseline gagal ditulis: teruskan seperti
   jurnal gagal (amaran `journalWarning`), jangan sekat pemulihan.
4. **"Pulihkan semua":** set pakej = `disabledByUs` ∪ (pakej dimatikan yang ada dalam registry/launcher stok
   **tolak** `baseline.disabledBefore`). Pakej yang jurnal kata kita matikan tetap dipulihkan walaupun ia juga ada
   dalam `disabledBefore`. Tiada baseline (TV lama) → tingkah laku sekarang. Logik pemulihan HOME sedia ada kekal.
   Setting: Fasa ini hanya merekod; pemulihan setting dibuat oleh ciri yang mengubahnya (Fasa 13 Private DNS).
5. `demo-client.js`: sokong `getSettings` (nilai demo tetap) supaya mod demo berfungsi.
6. Ujian (`node --test`, FakeAdb/runner palsu sedia ada): baseline ditulis sekali sahaja (panggilan kedua tidak
   menimpa); "Pulihkan semua" tidak menghidupkan pakej `disabledBefore` tetapi menghidupkan yang kita matikan;
   tanpa baseline tingkah laku lama; `getSettings` hanya menghantar kunci tetap; forbidden-commands masih lulus
   (tiada `settings put` dalam fasa ini).

## Siap bila

Ujian hijau; ARCHITECTURE §2 L1 dan §5 (jika ada medan API baharu) dikemas kini; tiada perubahan UI selain
yang perlu.
