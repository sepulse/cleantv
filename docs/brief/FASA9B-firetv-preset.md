# Fasa 9b — Preset Amazon Fire TV (data sahaja)

Sambungan Fasa 9 (`docs/brief/FASA9-preset-import.md`). **Semua peraturan Fasa 9 terpakai**:
bahagian A (skema), B (risk / tolak), D tidak perlu (notis sudah ada), E (ujian). Kod enjin, launcher, UI
dan `safety.js` tidak diubah. Swap launcher pada Fire OS kekal ditolak (`src/core/launchers.js`, Fasa 8).

## Sumber

- Clone baca-sahaja: `D:\Project\Deep\_cyt\src` (commit `204143007f0bebfb14d6ef001a32e5836b1c90b5`).
  Folder Fire TV: `examples/amazon-*`, `hisense-fire-tv-aftcibfbd1`, `tcl-58s571f-fire-tv`,
  `toshiba-fire-tv-aftha004` (10 model). Baca header setiap fail — blok "DO NOT DISABLE"/"Keep" dan nota
  "comes back at every boot" / "re-enabled".
- Calon dikira (skrip tempatan): `D:\Project\Deep\_cyt\cand-fire.json` (`active`, `kept`, `guard`, `notes`,
  `models`). Ambang: `active` ≥3 daripada 10.

## Kerja

1. Cipta `presets/amazon-fire-tv.json`: `"id": "amazon-fire-tv"`, `"match": { "manufacturer": ["amazon"] }`
   (Fire TV keluaran jenama lain melaporkan manufacturer jenama itu — di luar skop; laporkan sahaja).
2. Entri `green`/`yellow` (kira-kira 20–30), keutamaan: telemetry/metrics/log, iklan & baris tajaan, ACR,
   ID iklan, demo kedai, tutorial, aplikasi pra-pasang Amazon (Music, Photos, Shopping, games hub, Kids,
   miniTV) sebagai `yellow`. `ms` kosong (Gemini mengisinya). `sources` 1–3 URL raw cleanyourtv.
3. **Tolak**: Alexa/suara (`com.amazon.vizzini`, `com.amazon.aca`, alerts, external media player, dll.), Live
   tab/TV input, `com.amazon.cast.sink`, Silk/`cloud9`, OTA/update, setup/OOBE, `com.amazon.providers.*`,
   apa-apa yang "comes back at every boot", apa-apa yang ada amaran, aplikasi penstriman pihak ketiga
   (Tubi, Hulu, Max, Peacock, Pluto, Freevee), dan `com.amazon.wifilocker` jika komennya memberi sebarang
   amaran tentang Wi-Fi. Jika ragu → tolak.
4. Entri `red` (papar sahaja, dilindungi): `com.amazon.tv.launcher` (category `launcher`), dan
   `com.amazon.imp`, `com.amazon.tv.oobe` (sudah dalam `NEVER_TOUCH`, mesti `red`), dengan teks yang
   menyatakan ia penting untuk Fire OS.
5. Ujian (`test/registry.test.js`): kemas kini senarai id preset yang dijangka; ujian import komuniti sedia ada
   mesti meliputi preset ini juga (tambah pengecualian red hanya untuk tiga pakej di langkah 4).

## Siap bila

- `presets/amazon-fire-tv.json` sah, `npm test` hijau, tiada perubahan lain selain ujian.
- Laporan ke `D:\Project\Deep\_cyt\laporan-firetv.md`: bilangan ditambah, ditolak + sebab, jadual
  `pakej | sebab tolak`.
