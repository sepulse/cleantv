# Fasa 14 — CleanTV Home dengan panel Waktu Solat (JAKIM)

Keputusan pemilik (28 Okt 2026): ramai pengguna Malaysia mahu waktu solat pada skrin utama TV,
seperti fork "Akhter & Ruby TV" (cleanyourtv SHOWCASE). Pilihan pemilik:

1. **Hidupkan semula Fasa 10**: launcher cleanyourtv (MIT, Gathin) dibina dalam CI kita dan
   dipasang secara pilihan sebagai "CleanTV Home". Asas kerja: patch WIP
   `D:\Project\Deep\_cyt\fasa10-launcher-wip.patch` (28 fail, +871) dan brief
   [FASA10-launcher-terbina.md](FASA10-launcher-terbina.md). Semua peraturan Fasa 10 kekal,
   kecuali "jangan ubah kod launcher": kini kita menambah **satu tampalan kecil** (B).
2. **Tampalan kita sendiri**: panel Waktu Solat di Home. Bukan fork Akhter (terlalu banyak kebenaran),
   dan bukan kad modul sahaja (kad hanya ikon, tiada waktu di Home).
3. **Zon JAKIM dipilih dalam CleanTV** (aplikasi Windows) semasa memasang, kemudian dihantar ke TV.
   Tiada kebenaran lokasi.

**Jangan pack atau buat release** sehingga pemilik minta. Release v0.2.1-beta yang tular kekal.

## Peraturan kerja

- Surgical, kod minimum, ikut gaya sedia ada (CleanTV: JS tanpa dependency; launcher: Java,
  gaya fail upstream). Tiada ciri spekulatif.
- Model keselamatan L1–L7 dan guard Fasa 8 kekal. AdbClient hanya kaedah bernama; `execFile` sahaja.
- Bacaan rujukan: upstream yang diklon di `D:\Project\Deep\_cyt\src` (commit `2041430`).
  Pin baharu: pilih SHA terkini `main` upstream pada hari kerja, catat dalam `launcher/UPSTREAM.txt`,
  dan pastikan patch WIP masih terpakai.

## A. Hidupkan semula Fasa 10

1. Terapkan `fasa10-launcher-wip.patch` pada `main`, selesaikan konflik dengan Fasa 11–13
   (baseline, semakan reboot, DNS, tutup ADB) dan perubahan docs terkini (`docs/PANDUAN-PASANG.md`).
2. Lengkapkan apa yang belum siap dalam patch WIP mengikut bahagian A–D brief Fasa 10.
3. Penandatanganan CI: empat GitHub Secrets pemilik (brief Fasa 10 A.3). **Jangan cipta kunci.**
   Untuk ujian tempatan pada TV, build debug tempatan dibenarkan, tetapi tidak pernah masuk zip.

## B. Tampalan launcher: panel Waktu Solat

Simpan sebagai fail patch dalam repo kita (contoh `launcher/patches/0001-waktu-solat.patch`),
diterapkan oleh CI selepas checkout SHA yang dipin. CI gagal dengan mesej jelas jika patch
tidak terpakai.

- **Templat:** ikut corak `RaceWeekend.java` (panel kecil di Home + kiraan masa), bukan reka baharu.
  Rupa sasaran: gambar 1 aduan pengguna. Kepala "WAKTU SOLAT", nama zon dan negeri, tarikh Masihi
  dan Hijrah, "Seterusnya: Asar 16:24 · Masuk waktu dalam 2j 58m", baris Imsak/Subuh/Syuruk/Zohor/
  Asar/Maghrib/Isyak, dan "Zon KDH01 · JAKIM e-Solat". Waktu seterusnya diserlahkan.
  Tiada ayat al-Quran/hiasan tambahan melainkan pemilik minta.
- **Sumber data:** API rasmi JAKIM e-Solat
  (`https://www.e-solat.gov.my/index.php?r=esolatApi/takwimsolat&period=…&zone=<ZON>`).
  Sahkan bentuk respons sebenar sebelum menulis parser; jangan meneka medan. Tiada sandaran
  pihak ketiga melainkan pemilik setuju.
- **Cache:** ambil sebulan (atau setahun) sekali gus, simpan dalam storan aplikasi. Luar talian:
  terus papar cache. Cuba semula secara berkala (bukan gelung ketat). Jika tiada data langsung:
  panel menunjukkan mesej ringkas dalam BM, bukan ruang kosong.
- **Kebenaran:** tambah `INTERNET` sahaja, digunakan **hanya** untuk e-solat.gov.my.
  Tiada lokasi, tiada perkhidmatan latar belakang baharu.
- **Bahasa:** label BM (Imsak, Subuh, Syuruk, Zohor, Asar, Maghrib, Isyak) dalam `values-ms`,
  EN dalam `values`. Waktu 24 jam atau 12 jam ikut tetapan TV.
- **Matikan:** panel boleh disembunyikan dalam tetapan launcher. Jika tiada zon ditetapkan,
  panel tidak dipaparkan.

## C. Zon dalam CleanTV

1. Senarai zon JAKIM statik dalam repo (contoh `presets/jakim-zones.json`: kod, negeri, kawasan),
   **disalin daripada sumber rasmi JAKIM**, bukan ditulis dari ingatan. Catat sumber dan tarikh.
2. Dalam aliran "Pasang & tukar" CleanTV Home: langkah pilih **Negeri → Kawasan** (BM/EN).
   Disimpan dalam jurnal supaya boleh dipilih semula.
3. Hantar zon ke launcher melalui **kaedah AdbClient bernama** (contoh `setPrayerZone(serial, zone)`).
   Zon disahkan terhadap senarai statik sebelum dihantar; tiada input bebas sampai ke shell.
   Gunakan mekanisme konfigurasi yang sudah ada dalam launcher (cara konfigurasi tema /
   `race_calendar` ditolak oleh pemilik), atau satu pintu masuk kecil dalam tampalan B.
4. "Pulihkan semua" kekal: memulihkan HOME asal dan menyahpasang hanya CleanTV Home yang dipasang
   oleh CleanTV (jurnal).

## D. Dokumen dan janji keselamatan

- README (BM/EN), `BACA-SAYA.txt`, UI, `docs/ARCHITECTURE.md`, `docs/PANDUAN-PASANG.md` (FAQ
  "Di mana widget waktu solat?" ditulis semula):
  - "Tidak memadam aplikasi TV; hanya membuang launcher yang CleanTV sendiri pasang."
  - Privasi: CleanTV Home menghubungi e-solat.gov.my untuk waktu solat zon anda (kod zon sahaja).
- `THIRD_PARTY_NOTICES.md`: cleanyourtv (MIT), Outfit (OFL). Data waktu solat: JAKIM.
- Teks BM baharu: semakan Gemini (BM) dan semakan nada Sonnet sebelum commit.

## E. Pengesahan

- `node --test`: senarai zon (format, tiada pendua), pengesahan zon, kaedah AdbClient (argumen tetap),
  jurnal zon, mod demo menyokong pilihan zon, ujian Fasa 10 dalam patch WIP.
- Launcher: build debug tempatan berjaya; parser e-Solat diuji dengan respons sebenar yang disimpan
  sebagai fixture.
- **TV sebenar (pemilik):** pasang, pilih zon, panel betul berbanding laman e-Solat, butang Home,
  "Pulihkan semua" mengembalikan launcher asal dan menyahpasang CleanTV Home.
- Semakan diff oleh subagent baharu (Sonnet, high) sebelum commit; maksimum 3 pusingan.
