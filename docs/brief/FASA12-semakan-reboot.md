# Fasa 12 — Semakan selepas reboot (pakej hidup semula)

Repo `D:\Project\Deep\cleantv` (`main`). Bergantung pada Fasa 11. Baca: `src/core/engine.js` (`inspect`, `act`),
`src/core/journal.js` (`disabledByUs`), `src/server/routes.js`, `public/js/app.js`, `public/js/screens/choose.js`,
`public/i18n/*.json`, `docs/ARCHITECTURE.md` §5.

## Peraturan kerja (wajib)

- **Surgical** dan **simplicity first** (lihat Fasa 11). L1–L7 kekal. `npm test` hijau.
- Pengesanan sahaja secara automatik; **tiada tindakan tanpa klik**.
- Teks UI: `en` dalam `en.json`, kunci sama dalam `ms.json` dengan `""` (Gemini mengisinya).

## Masalah

Sesetengah firmware menghidupkan semula pakej selepas reboot (cleanyourtv: contohnya `com.tcl.overseasappshow`,
`com.tcl.usercenter`). Pengguna tidak tahu.

## Kerja

1. `engine.inspect` memulangkan `reenabled: string[]` = pakej dalam `journal.disabledByUs(deviceId)` yang
   **dipasang** dan **tidak** dalam senarai `disabledOnly`. Jurnal gagal dibaca → `[]` (tiada ralat).
2. API: `GET /devices/:serial` dan `/packages` memulangkan `reenabled` (hanya jika tidak kosong). Kemas kini §5.
3. UI (`choose.js`): jika `state.reenabled.length`, satu kad status di atas senarai: tajuk + senarai nama aplikasi
   (`registryText`) + butang "Matikan semula" yang memilih pakej itu dan membuka modal pengesahan biasa
   (`confirmClean`) — laluan biasa `POST /disable`, jadi allowlist, `canDisable`, jurnal dan L7 terpakai.
   Pakej yang kini tidak lagi dibenarkan (`canDisable` false) dipaparkan tetapi tidak dipilih.
4. `demo-client.js`: tiada perubahan wajib; jika mudah, satu cara demo untuk melihat kad ini (contohnya pakej
   yang dihidupkan semula selepas `disconnect`/`connect`) — hanya jika ≤10 baris.
5. Ujian: `inspect` mengesan pakej hidup semula; tidak memasukkan pakej yang dinyahpasang atau yang kita pulihkan
   sendiri (rekod `enable` terkini); route memulangkan medan; tiada `disable` dipanggil secara automatik.

## Siap bila

Ujian hijau; ARCHITECTURE dikemas kini; kad dipaparkan dalam mod demo (jika langkah 4 dibuat).
