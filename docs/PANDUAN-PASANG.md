# Panduan pasang CleanTV (langkah demi langkah)

**Bahasa Melayu** | [English](#english)

Panduan ini untuk sesiapa sahaja, walaupun tidak biasa dengan komputer. Ikut langkah satu per satu.
Di bawah setiap langkah ada bahagian **"Jika ada masalah"** dengan cara menyelesaikannya.

> **Mahu waktu solat pada skrin utama TV?** CleanTV boleh memasang launcher pilihan **CleanTV Home**
> dengan panel Waktu Solat JAKIM. Anda memilih zon pada komputer. Lihat [Soalan lazim](#soalan-lazim).
> Tanpa pilihan itu, CleanTV hanya mematikan aplikasi dan tidak memasang apa-apa pada TV.

## Yang anda perlukan

- Komputer **Windows** (Windows 10 atau 11). CleanTV belum ada untuk Mac atau telefon.
- Android TV / Google TV, dengan alat kawalan jauhnya.
- Komputer dan TV mesti menggunakan **Wi-Fi yang sama** (rumah yang sama, router yang sama).
- Internet pada komputer (untuk kali pertama sahaja).

---

## Langkah 1 — Muat turun

1. Buka https://github.com/sepulse/cleantv/releases
2. Di bawah tajuk **Assets**, klik **`CleanTV-win-x64.zip`**. Fail akan masuk ke folder **Downloads**.

**Jika ada masalah**

- *Tidak nampak "Assets"?* Klik perkataan **Assets** untuk membukanya.
- *Pelayar kata fail "tidak biasa dimuat turun" / "could harm your device"?* Klik ikon **⋯** atau
  anak panah pada amaran itu → **Keep** (Simpan) → **Keep anyway**. Ini berlaku kerana CleanTV masih baharu.

## Langkah 2 — "Unblock" dan Extract (WAJIB)

Ini langkah yang paling kerap terlepas. **Jangan buka CleanTV terus dari dalam fail zip.**

1. Buka folder **Downloads**.
2. Klik kanan **`CleanTV-win-x64.zip`** → **Properties**.
3. Di bahagian bawah tab **General**, jika ada kotak **Unblock**, tandakan ✔ → klik **OK**.
   (Jika tiada kotak Unblock, teruskan sahaja.)
4. Klik kanan zip itu sekali lagi → **Extract All...** → **Extract**.
5. Folder baharu **`CleanTV-win-x64`** akan terbuka. Di dalamnya ada `CleanTV.cmd`, `node.exe`
   dan folder `app`. Semua langkah seterusnya dibuat dari folder **ini**.

**Jika ada masalah**

- *Tetingkap hitam terbuka dan terus tertutup, atau ada mesej `'node.exe' is not recognized` /
  `The system cannot find the path specified`?* Anda membuka CleanTV dari dalam zip. Tutup semua,
  kemudian buat **Extract All** seperti di atas dan buka dari folder yang telah diekstrak.
- *`node.exe` tiada dalam folder?* Antivirus mungkin telah mengalihkannya. Buka antivirus anda
  (contohnya Windows Security → **Protection history**), pulihkan (**Restore** / **Allow**) fail itu,
  atau padam folder dan Extract semula.

## Langkah 3 — Sediakan TV (hidupkan Developer options)

Anda hanya perlu buat ini sekali. Ambil alat kawalan jauh TV.

1. Pada TV, buka **Settings** (Tetapan).
2. Pergi ke **System → About** (atau **Device Preferences → About** pada sesetengah TV;
   jika TV dalam Bahasa Melayu: **Sistem → Perihal**).
3. Cari **Android TV OS build** (atau **Build**). Tekan butang **OK** pada alat kawalan jauh
   **7 kali** berturut-turut sehingga muncul mesej *"You are now a developer"*.
4. Kembali satu langkah. Kini ada menu baharu **Developer options** (Pilihan pembangun).
5. Buka **Developer options** dan hidupkan **USB debugging** (Penyahpepijatan USB).
   Jika ada juga **Network debugging** / **ADB debugging**, hidupkan juga.

Aplikasi CleanTV juga menunjukkan langkah ini mengikut jenama TV anda (skrin **Sediakan TV**).

**Jika ada masalah**

- *Tiada "Developer options" selepas 7 kali tekan?* Pastikan anda menekan pada **Android TV OS build**,
  bukan pada baris lain. Tekan lagi sehingga keluar mesej.
- *TV hanya ada **Wireless debugging** (Penyahpepijatan wayarles) yang meminta kod pairing?*
  Versi CleanTV ini belum menyokong kod pairing. Hidupkan **USB debugging** juga, dan biarkan ia
  hidup. Jika masih tidak dapat bersambung pada Langkah 5, TV anda belum disokong oleh versi ini.

## Langkah 4 — Buka CleanTV

1. Pastikan komputer **ada internet** (kali pertama sahaja).
2. Dalam folder `CleanTV-win-x64`, klik dua kali **`CleanTV.cmd`**
   (jika sambungan fail disembunyikan, ia kelihatan sebagai **CleanTV**, jenis *Windows Command Script*).
3. Tetingkap hitam akan terbuka. **Jangan tutup tetingkap hitam ini** sepanjang anda menggunakan CleanTV.
4. Kali pertama, CleanTV memuat turun alat sambungan TV daripada Google (kira-kira 7 MB). Tunggu sebentar.
5. Pelayar web akan terbuka sendiri dan menunjukkan CleanTV.

**Jika ada masalah**

- *Skrin biru **"Windows protected your PC"**?* Klik **More info** → **Run anyway**.
  Ini kerana CleanTV masih baharu dan belum ada tandatangan digital (code signing).
- *Tetingkap hitam menunjukkan **"Muat turun atau semakan gagal"** / `fetch-adb: Download failed`?*
  Komputer tiada internet, atau rangkaian (pejabat/sekolah) menyekat `dl.google.com`.
  Tutup tetingkap hitam, sambung ke Wi-Fi rumah atau hotspot telefon, kemudian klik dua kali
  `CleanTV.cmd` semula.
- *Dalam CleanTV tertulis **"Alat sambungan TV tiada"**?* Ini akibat muat turun di atas gagal.
  Tutup tetingkap hitam, pastikan ada internet, dan buka `CleanTV.cmd` semula.
- *Pelayar tidak terbuka sendiri?* Lihat tetingkap hitam: ada alamat seperti
  `http://127.0.0.1:8765/`. Taip alamat itu (nombornya mungkin berbeza) dalam Chrome atau Edge.
- *Tertulis **"CleanTV telah berhenti"**?* Tetingkap hitam atau CleanTV telah ditutup.
  Klik dua kali `CleanTV.cmd` semula.
- *Mahu cuba dahulu tanpa TV?* Klik dua kali **`CleanTV-Demo.cmd`**. Ia tidak mengubah apa-apa.

## Langkah 5 — Sambung ke TV

1. Pastikan TV **hidup** dan menggunakan **Wi-Fi yang sama** dengan komputer.
2. Dalam CleanTV, tekan **Cari TV saya** → **Pilih** TV anda.
3. **Lihat skrin TV.** Akan muncul soalan *"Allow USB debugging?"*. Dengan alat kawalan jauh,
   tandakan **Always allow from this computer** (Sentiasa benarkan), kemudian pilih **Allow** (Benarkan).
   Tekan pada **TV**, bukan pada komputer.

**Jika ada masalah**

- *"Belum ada TV dijumpai"?*
  - Semak TV dan komputer pada Wi-Fi yang **sama**. Wi-Fi "Guest" atau "Tetamu" biasanya tidak boleh.
  - Masukkan alamat IP TV secara manual. Pada TV: **Settings → Network & Internet** → pilih Wi-Fi
    yang sedang digunakan → lihat **IP address** (contoh `192.168.1.50`). Taip nombor itu dalam
    CleanTV → **Sambung**.
  - Matikan dan hidupkan semula **USB debugging** pada TV, kemudian cuba lagi.
- *"Kebenaran tidak diterima dalam masa dua minit"?* Soalan pada TV terlepas atau tertutup.
  Tekan **Cuba lagi** dan terus lihat skrin TV. Jika soalan tidak muncul langsung, matikan dan hidupkan
  semula **USB debugging**, kemudian cuba lagi.
- *"Kami tidak dapat berhubung dengan TV anda" / "TV anda berada di luar talian"?* Pastikan TV hidup
  (bukan mod tidur) dan bersambung ke Wi-Fi. Mulakan semula TV jika perlu.

## Langkah 6 — Bersihkan dan mulakan semula TV

1. Semak senarai aplikasi. Aplikasi bertanda **Selamat** sudah dipilih untuk anda.
   Baca kesan setiap aplikasi sebelum memilih yang bertanda **Pilihan**.
2. Tekan **Bersihkan** dan tunggu sehingga siap.
3. **Mulakan semula (restart) TV.**

Tidak puas hati? Tekan **Pulihkan semua** bila-bila masa. Factory reset pada TV juga memulihkan semuanya.

---

## Soalan lazim

**Di mana widget waktu solat?**
Pada skrin pilihan, tepat di bawah maklumat TV anda, tekan **Tetapkan waktu solat** (kad *Waktu solat pada TV
anda*). Ia membuka launcher **CleanTV Home** (bahagian *Buang iklan skrin utama (lanjutan)*) dengan pilihan
**Negeri** dan **Kawasan** (zon JAKIM) yang sedia untuk dipilih; kemudian tekan **Pasang & tukar**. Panel Waktu Solat akan muncul pada
skrin utama TV, dengan waktu seterusnya diserlahkan. Anda boleh menukar zon kemudian dengan **Hantar zon
ke TV**, atau menyembunyikan panel dalam tetapan launcher pada TV. CleanTV Home berdasarkan launcher
"Clean Your TV" oleh Gathin. Ia menghubungi e-solat.gov.my (JAKIM) untuk waktu solat zon anda; hanya kod
zon dihantar dan tiada kebenaran lokasi diperlukan. **Pulihkan semua** mengembalikan skrin utama asal dan
membuang CleanTV Home yang CleanTV sendiri pasang (aplikasi TV lain tidak dipadam).

**Selepas tukar launcher, widget atau ikon saya hilang.**
Widget itu milik skrin utama asal TV. Dalam CleanTV, pilih **Pulihkan skrin utama asal** atau
**Pulihkan semua**.

**Adakah CleanTV memadam aplikasi?**
Tidak. Ia hanya mematikan aplikasi; satu-satunya yang dibuang ialah launcher CleanTV Home jika CleanTV sendiri yang memasangnya. Semuanya boleh dipulihkan.

**Masih ada masalah?**
Hantarkan kepada kami: (1) gambar skrin tetingkap hitam, (2) gambar skrin CleanTV dalam pelayar,
dan (3) jenama dan model TV anda.

---

## English

**Prayer times on the TV home screen?** On the choose screen, right under your TV's details, press
**Set up prayer times** (the *Prayer times on your TV* card). It opens the optional **CleanTV Home** launcher
with the JAKIM **State** and **Area** choice ready; pick them, then press **Install & switch**. A Prayer Times panel then shows on the TV
home screen with the next time highlighted. CleanTV Home is based on the "Clean Your TV" launcher by
Gathin; it contacts e-solat.gov.my (JAKIM) with the zone code only, and needs no location permission.
**Restore all** brings back the original home screen and removes only the CleanTV Home that CleanTV
installed. Without this option CleanTV installs nothing on the TV.

You need: a **Windows** 10/11 computer, an Android TV / Google TV, both on the **same Wi-Fi**, and
internet on the computer the first time.

1. **Download** `CleanTV-win-x64.zip` from https://github.com/sepulse/cleantv/releases (under **Assets**).
   If the browser warns about the file, choose **Keep → Keep anyway**.
2. **Unblock and extract (required).** Right-click the zip → **Properties** → tick **Unblock** (if shown)
   → **OK**. Right-click again → **Extract All** → **Extract**. Never run CleanTV from inside the zip:
   that is why the black window closes at once or says `'node.exe' is not recognized`.
   If `node.exe` is missing, your antivirus removed it; restore it or extract again.
3. **Prepare the TV.** Settings → System → About → press OK on **Android TV OS build** 7 times →
   back → **Developer options** → turn on **USB debugging** (and **Network debugging** if present).
   If the TV only offers **Wireless debugging** with a pairing code, this version cannot pair yet;
   turn on USB debugging as well.
4. **Open CleanTV.** Double-click **`CleanTV.cmd`** in the extracted folder and keep the black window
   open. On **"Windows protected your PC"** choose **More info → Run anyway**. If it says the download
   or check failed, or the app says the TV tool is missing, connect to home Wi-Fi or a phone hotspot
   and open `CleanTV.cmd` again. If the browser does not open, type the address shown in the black
   window (for example `http://127.0.0.1:8765/`) into Chrome or Edge.
5. **Connect.** Press **Find my TV** → **Choose**. On the **TV**, tick **Always allow from this
   computer** and press **Allow**. Not found? Use the same Wi-Fi (not a guest network) or type the
   TV's IP address (TV Settings → Network & Internet → your Wi-Fi → IP address). If the prompt never
   appears, switch USB debugging off and on again.
6. **Clean, then restart the TV.** **Restore all** is always available.

Still stuck? Send a screenshot of the black window, a screenshot of CleanTV in the browser, and your
TV brand and model.
