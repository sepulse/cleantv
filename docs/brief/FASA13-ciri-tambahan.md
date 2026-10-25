# Fasa 13 — Ciri tambahan: Private DNS, tutup ADB, audit privasi

Repo `D:\Project\Deep\cleantv` (`main`). Bergantung pada Fasa 11 (baseline) dan 12. Tiga bahagian, **tiga commit
berasingan** (13a, 13b, 13c). Baca: `docs/ARCHITECTURE.md` §2 dan §5, `src/core/adb/client.js`,
`src/core/engine.js`, `src/core/journal.js`, `src/server/routes.js`, `src/server/demo-client.js`,
`public/js/app.js`, `public/js/screens/done.js`, `public/i18n/*.json`, `test/forbidden-commands.test.js`.
Rujukan idea (MIT, baca sahaja): `D:\Project\Deep\_cyt\src\tools\privacy.py`, `docs/TROUBLESHOOTING.md`.

## Peraturan kerja (wajib)

- **Surgical** dan **simplicity first**. L1: AdbClient hanya kaedah bernama; L2–L7 kekal. `npm test` hijau.
- Teks UI: `en` dalam `en.json`, kunci sama dalam `ms.json` dengan `""` (Gemini mengisinya).
- Setiap tindakan mengubah TV: butang + modal pengesahan sedia ada; tiada tindakan automatik.

## 13a — Ad-block Private DNS (pilihan, lalai mati)

- `src/core/dns.js` (atau dalam modul sedia ada yang sesuai): senarai TETAP penyedia, contohnya
  `{ id: 'adguard', name: 'AdGuard DNS', host: 'dns.adguard-dns.com' }`, `{ id: 'mullvad-adblock', name:
  'Mullvad DNS (ad-blocking)', host: 'adblock.dns.mullvad.net' }` — hanya hos yang didokumenkan secara rasmi
  oleh penyedia; letak URL dokumen dalam komen.
- AdbClient `setPrivateDns(serial, { mode, specifier })`: `mode` ∈ `off | opportunistic | hostname`;
  `specifier` = hos dari senarai tetap, ATAU nilai baseline (pemulihan) yang lulus regex hostname ketat, ATAU
  `null` → `settings delete global private_dns_specifier`. Hanya dua kunci ini boleh ditulis. Sahkan dengan
  `getSettings` selepas tulis (L7).
- `test/forbidden-commands.test.js`: benarkan `settings put` **hanya** dalam `src/core/adb/client.js` dan hanya
  untuk `private_dns_mode` / `private_dns_specifier` (ujian membuktikannya). Larangan lain kekal.
- Engine: `setDns(serial, providerId)` — rekod baseline dahulu (Fasa 11), jurnal `{ action: 'dns', ... }`
  `pending` → `ok/failed`. `journal.disabledByUs` dan `engine.history` mesti mengabaikan rekod `dns` seperti
  `swap` (atau history memaparkannya dengan betul).
- "Pulihkan semua": jika jurnal ada rekod `dns` `ok`, kembalikan `private_dns_mode`/`private_dns_specifier` kepada
  nilai baseline (null → delete). Gagal → keputusan `failed` dalam ringkasan, pemulihan pakej tetap berjalan.
- API `POST /devices/:serial/dns` `{ provider: id | 'off' }` → job. UI: kad pilihan (lalai: mati) dengan amaran
  dwibahasa: "Some apps or captive Wi-Fi portals may stop working; restore with Restore all."
- Ujian: penyedia luar senarai ditolak; pemulihan memulihkan nilai baseline; null → delete.

## 13b — Tutup ADB selepas selesai (pilihan)

- AdbClient `usbMode(serial)`: `adb -s <serial> usb` (kembali ke mod USB, port rangkaian ditutup).
- Engine/route `POST /devices/:serial/close-adb` (ditolak jika ada job berjalan, seperti `disconnect`): panggil
  `usbMode`, `disconnect`, kemudian cuba `connect` sekali → `portClosed: true` jika `unreachable`,
  `false` jika masih bersambung (kemudian `disconnect`), `null` jika tidak dapat ditentukan.
- UI skrin Selesai: butang sekunder + modal pengesahan dengan nota: langkah sediakan TV (Network debugging)
  perlu diulang untuk guna CleanTV semula; jika port masih terbuka, matikan Network debugging dalam
  Developer options. Selepas berjaya → kembali ke skrin mula.
- Demo: `usbMode` disokong (putuskan sambungan demo).
- Ujian: susunan arahan, `portClosed` untuk tiga kes, busy ditolak.

## 13c — Audit privasi (baca sahaja)

- UI sahaja, tiada API baharu: daripada `state.packages`, entri `category` `telemetry` atau `ads` yang
  `installed && enabled`. Kad boleh dilipat pada skrin pilih (dan ringkasan pada skrin Selesai): bilangan +
  senarai nama (`registryText`) + risk. **Tiada butang tindakan**; teks menerangkan pengguna boleh memilihnya
  dalam senarai jika mahu. Jika 0 → mesej positif ringkas.
- Ujian `public.test.js` gaya sedia ada jika ada corak untuk fungsi tulen (contohnya fungsi `privacyAudit(packages)`
  dieksport dan diuji).

## Siap bila

Tiga commit, ujian hijau, ARCHITECTURE §2 (L1: `getSettings`, `setPrivateDns`, `usbMode`) dan §5 dikemas kini.
