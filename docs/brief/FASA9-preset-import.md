# Fasa 9 — Import data preset daripada cleanyourtv

Repo: `D:\Project\Deep\cleantv` (branch `main`). Baca dahulu: `docs/ARCHITECTURE.md` (§2 keselamatan, §4 skema),
`presets/SCHEMA.md`, `src/core/safety.js` (`NEVER_TOUCH` + awalan), `src/core/registry.js` (`validatePreset`).

Fasa ini **hanya menambah data preset** (`presets/*.json`) dan satu fail notis lesen. Kod enjin, launcher, UI,
`safety.js` tidak diubah. Satu penambahan kecil dibenarkan dalam `test/` (lihat bahagian E).

## Sumber (baca sahaja, jangan jalankan kodnya)

- Clone: `D:\Project\Deep\_cyt\src` — `https://github.com/Gathin23/cleanyourtv`, commit
  `204143007f0bebfb14d6ef001a32e5836b1c90b5`, lesen MIT, "Copyright (c) 2026 Gathin".
  `examples/<model>/debloat.txt`: satu pakej bagi setiap baris; baris `# pakej` = dikekalkan oleh pengarang;
  blok "DO NOT DISABLE" / "Keep" / "Never disable" / "WARNING" = pakej itu penting pada firmware berkenaan.
- Agregat yang sudah dikira (skrip tempatan, bukan kod mereka): `D:\Project\Deep\_cyt\cand.json`.
  Kunci: `tcl`, `sony`, `xiaomi`, `hisense`, `generic`. Setiap calon: `active` (bil. model yang mematikannya),
  `kept` (bil. model yang mengekalkannya), `guard` (bil. model yang menyebutnya dalam blok amaran/jangan-matikan —
  isyarat kasar, banyak positif palsu), `notes`/`warn` (komen mereka), `models` (contoh folder model).
  Calon sudah ditapis: bukan `NEVER_TOUCH`/awalan terlindung, belum ada dalam mana-mana preset, ambang `active`
  ≥3 (Hisense ≥2; `generic` ≥8). Anda **mesti** membaca konteks sebenar dalam `debloat.txt` untuk setiap pakej
  yang dipilih (komen kumpulan, blok amaran) — jangan percaya angka sahaja.

## Peraturan kerja (wajib)

- **Surgical:** hanya tambah entri baharu. **Jangan ubah, susun semula atau buang entri sedia ada**
  (termasuk yang `red`). Jika sumber bercanggah dengan entri sedia ada, laporkan, jangan ubah.
- **Simplicity first:** tiada skema baharu, tiada medan baharu, tiada skrip kekal dalam repo.
- Format JSON ikut fail sedia ada (indentasi, satu baris untuk objek `label`/`description`/`effect`).
- Jangan import semua ~1,300 pakej. Sasaran: kira-kira 20–35 entri baharu bagi setiap jenama (TCL, Sony, Xiaomi,
  Hisense), dan ≤20 untuk Google (`google-tv.json` + `common-android-tv.json` + `android-tv.json`). Kurang lebih
  baik daripada salah.
- Keutamaan: iklan/promosi, telemetry/analytics, mod demo kedai, pemasang auto rakan kongsi, aplikasi pra-pasang
  (manual, pelayar, pasaran apl jenama). Kemudian pilihan pengguna (cast/mirroring, pembantu).

## Bahagian A — Skema setiap entri (§4 ARCHITECTURE)

```json
{ "package": "...", "risk": "green|yellow", "category": "ads|telemetry|bloat|store|launcher|assistant|system",
  "label": {"en":"...","ms":""}, "description": {"en":"...","ms":""}, "effect": {"en":"...","ms":""},
  "sources": ["https://raw.githubusercontent.com/Gathin23/cleanyourtv/main/examples/<model>/debloat.txt", "..."],
  "verified": false }
```

- `ms` **dibiarkan `""`** — Gemini mengisinya selepas itu (jangan terjemah sendiri).
- `sources`: 1–3 URL `raw.githubusercontent.com/Gathin23/cleanyourtv/main/examples/<folder>/debloat.txt`, hanya
  folder yang benar-benar wujud dalam clone dan benar-benar mematikan pakej itu (daripada `models` + semakan).
- `label`/`description` mesti berdasarkan komen sumber atau nama pakej yang jelas. **Jangan reka** fungsi.
  `effect` ialah akibat yang munasabah daripada fungsi itu, berbahasa Inggeris ringkas seperti entri sedia ada
  ("... stops appearing until restored.").
- `verified: false` untuk semua.

## Bahagian B — Risk

- `green`: tiada fungsi yang pengguna nampak/guna (telemetry, log, feedback, demo kedai, pemasang auto, stiker).
- `yellow`: mematikan sesuatu yang sesetengah pengguna guna (cast/mirroring, pembantu suara, manual, pelayar,
  pemain media, akaun jenama, app store jenama). `effect` mesti menyatakan fungsi yang hilang.
- **Tolak (jangan import)** jika mana-mana benar: ada amaran dalam komen/blok (rosak Wi-Fi, HOME, input/HDMI, tuner,
  remote, kekunci, bootloop, skrin kosong, "re-enabled", "keep"); `kept` ≥ `active`; `guard` ≥2 atau
  `guard`×3 ≥ `active`; teras sistem (setup, launcher/HOME, settings, input/tuner/HDMI, Wi-Fi, keyboard, remote
  service, providers, OTA/updater firmware, factory/hotel/B2B); `com.mediatek.*`; aksesibiliti (TalkBack, TTS);
  aplikasi penstriman pihak ketiga/serantau (Netflix, Disney+, Spotify, Pluto, Rakuten, Stan, …); apa-apa yang tidak
  dapat dikenal pasti fungsinya. `red` hanya jika pakej itu mesti dipaparkan sebagai dilindungi; lalai ialah **tolak**.
- Tiada pakej yang `NEVER_TOUCH.has()` atau berawalan `com.android.providers.`, `com.google.android.overlay.modules`,
  `com.mediatek.`, `com.at.factory.`, `com.jamdeo.tv.`.
- Jika ragu antara green dan yellow → yellow; antara yellow dan tolak → tolak.

## Bahagian C — Ke mana setiap pakej pergi

- `presets/tcl.json`, `sony.json`, `xiaomi.json`, `hisense.json`: pakej berawalan jenama (`com.tcl.*`, `com.sony*`,
  `tv.samba*`, `com.mitv*`/`com.xiaomi*`/`com.miui*`, `com.hisense*`/`com.vt.*`) dan
  `android.autoinstalls.config.<jenama>.*` mengikut jenama.
- `presets/google-tv.json` (match `feature: google-tv`): pakej Google yang hanya bermakna pada Google TV.
- `presets/common-android-tv.json` (match any): pakej Google/AOSP generik (`com.google.*`, `com.android.*`,
  `android.autoinstalls.config.google.*`) daripada `generic`. Hanya awalan ini — `com.amazon.*`, `org.droidtv.*`,
  `com.homwee.*`, `com.smartdevice.*` dan lain-lain (tiada preset jenama) **ditolak: di luar skop**.
- `presets/android-tv.json`: hanya jika ada pakej leanback/Android TV lama yang jelas; jika tiada, biarkan.
- Satu pakej hanya dalam satu preset; elak pertindihan dengan entri sedia ada merentas fail.

## Bahagian D — Notis lesen

- Cipta `THIRD_PARTY_NOTICES.md` di akar repo: nama projek, URL, commit di atas, "Copyright (c) 2026 Gathin",
  teks penuh lesen MIT (salin tepat dari `D:\Project\Deep\_cyt\src\LICENSE`), dan satu perenggan: data pakej dalam
  `presets/*.json` disusun daripada senarai `examples/*/debloat.txt` komuniti itu; CleanTV tidak menjalankan
  kodnya. Dua bahasa (BM + EN) — bahagian BM ditulis oleh Gemini, jangan tulis sendiri.
- Tambah satu pautan ke `THIRD_PARTY_NOTICES.md` dalam bahagian BM dan bahagian EN `README.md`
  (satu ayat pendek setiap satu, di tempat yang sesuai berhampiran nota "belum diuji").

## Bahagian E — Ujian

- `npm test` mesti hijau; `loadPresets` mengesahkan semua JSON.
- Tambah satu ujian kecil dalam `test/registry.test.js`: setiap entri dalam `presets/*.json` yang `sources`-nya
  mengandungi `Gathin23/cleanyourtv` mempunyai `verified === false`, bukan dalam `NEVER_TOUCH`, dan tidak
  berawalan terlindung (`com.android.providers.`, `com.google.android.overlay.modules`, `com.mediatek.`,
  `com.at.factory.`, `com.jamdeo.tv.`), dan tiada pakej yang sama muncul dalam dua preset jenama berbeza.

## Siap bila

- Setiap preset sasaran bertambah dengan entri bersumber; tiada entri sedia ada berubah (`git diff` hanya tambahan).
- `npm test` hijau; notis lesen dan pautan README ada; semua `ms` kosong untuk entri baharu (diisi Gemini selepas itu).
- Laporan (jangan tulis ke repo): senarai per jenama — bilangan ditambah, dan bilangan ditolak dengan sebab
  (kategori ringkas) — ke `D:\Project\Deep\_cyt\laporan-builder.md`, termasuk jadual `pakej | jenama | sebab tolak`
  bagi setiap calon yang dipertimbangkan tetapi ditolak.
