# Semakan BM Fasa 14 (Gemini Flash, medium)

Tugas: semak teks Bahasa Melayu baharu/diubah dalam Fasa 14 dan senaraikan cadangan pembetulan.
**Jangan baiki sendiri** dan jangan ubah fail; hanya senarai dapatan (fail, baris, teks semasa, cadangan, sebab).

Peraturan: kekalkan istilah teknikal English (launcher, APK, home app, Home, Developer options, Network debugging).
Jangan tambah apa-apa yang tiada dalam sumber. Kekalkan struktur dan fakta.

Fail dan kunci untuk disemak:
- `public/i18n/ms.json`: semua kunci `prayer.promo*` (kad Waktu solat di bahagian atas skrin pilihan), `launcher.zone*`, `launcher.bundled*`, `launcher.installSwitch`, `result.removed`,
  `restore.body`, `launcher.notInstalled`, `error.LAUNCHER_UNSUPPORTED` (bandingkan dengan `public/i18n/en.json`).
- `README.md` (bahagian Bahasa Melayu), `docs/PANDUAN-PASANG.md` (nota atas, FAQ "Di mana widget waktu solat?", "Adakah CleanTV memadam aplikasi?"),
  `THIRD_PARTY_NOTICES.md` (bahagian "Data waktu solat (JAKIM)"), `scripts/build-portable.js` (`quickStartText`, bahagian BAHASA MELAYU).
- `launcher/patches/0001-waktu-solat.patch`: fail `values-ms/strings.xml` dalam patch (label Imsak/Subuh/Syuruk/Zohor/Asar/Maghrib/Isyak,
  nama bulan Hijrah, "Seterusnya: ... · Masuk waktu dalam ...", mesej tiada data).

Semak: ejaan/istilah rasmi (JAKIM), konsisten "zon", "Negeri", "Kawasan", nada mesra untuk pengguna biasa.
