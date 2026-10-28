# CleanTV

**Bahasa Melayu** | [English](#english)

## Bahasa Melayu

> **Ada masalah semasa memasang?** Ikut [panduan pasang langkah demi langkah](docs/PANDUAN-PASANG.md) — setiap langkah ada cara menyelesaikan masalah.
> **Waktu solat pada TV?** Pilih launcher **CleanTV Home** dan zon JAKIM anda ([butiran](docs/PANDUAN-PASANG.md#soalan-lazim)). Ia pilihan; tanpa itu CleanTV tidak memasang apa-apa pada TV.

CleanTV ialah aplikasi pada komputer yang membantu Android TV / Google TV anda menjadi lebih laju dan kurang iklan. Anda hanya perlu sambungkan komputer ke TV melalui rangkaian Wi-Fi yang sama, pilih aplikasi yang tidak diperlukan, dan CleanTV akan matikannya untuk anda.

### Janji keselamatan

- **Matikan, bukan padam.** CleanTV tidak memadam aplikasi TV; hanya membuang launcher yang CleanTV sendiri pasang.
- **Pulihkan dengan satu klik.** Butang "Pulihkan semua" sentiasa ada sebaik sahaja anda bersambung ke TV.
- **Factory reset memulihkan semuanya.** Jika berlaku apa-apa masalah yang pelik, factory reset (set semula kilang) pada TV akan mengembalikan semula semua aplikasi asal.
- **Hanya aplikasi dalam senarai.** Aplikasi sistem TV dilindungi dan tidak boleh disentuh. Anda tidak akan tersilap mematikan aplikasi yang penting.
- **Hanya pada komputer anda.** Aplikasi ini hanya boleh diakses dari komputer anda sendiri (127.0.0.1) dan tidak menghantar data ke mana-mana.
- **Privasi waktu solat.** Jika anda memasang CleanTV Home dan memilih zon, launcher itu pada TV menghubungi e-solat.gov.my (JAKIM) untuk waktu solat zon anda. Hanya kod zon dihantar; tiada kebenaran lokasi.

CleanTV Home berdasarkan Clean Your TV oleh Gathin (MIT), dengan fon Outfit (OFL 1.1). Ia dibina daripada sumber upstream yang dipin, dengan identiti aplikasi dan kunci tandatangan keluaran CleanTV sendiri, ditambah panel Waktu Solat JAKIM. Pilih "Pasang & tukar" untuk memasang APK terbina (Android 8.0 / SDK 26 atau lebih baharu). "Pulihkan semua" memulihkan HOME asal dahulu, kemudian membuang launcher yang direkodkan sebagai dipasang oleh CleanTV; launcher yang sudah ada sebelum itu kekal dipasang.

### Perkara yang perlu diketahui

- Senarai aplikasi untuk Google TV, Xiaomi, TCL, Sony, Hisense dan Amazon Fire TV **belum diuji pada TV sebenar** (`verified: false`). Senarai ini disusun daripada sumber awam, jadi aplikasi ini melabelkannya sebagai "belum diuji". Cuba pada satu TV dahulu, dan ingat bahawa anda sentiasa boleh memulihkannya semula.
- Lihat [notis pihak ketiga](THIRD_PARTY_NOTICES.md) untuk sumber data dan lesen.
- Anda boleh menukar skrin utama (launcher) kepada Projectivy atau CleanTV Home (dengan panel Waktu Solat JAKIM) jika mahu. CleanTV akan menyemak sama ada Projectivy sudah dipasang, dihidupkan dan sedia digunakan sebagai home app sebelum menukar launcher. Kemudian, CleanTV mematikan home app asal, menyemak fungsi butang Home, dan cuba kembali ke skrin utama asal secara automatik jika semakan gagal. Jika sambungan terputus semasa pertukaran, CleanTV akan memulihkannya sebaik sahaja anda bersambung semula, atau anda boleh pilih "Pulihkan skrin utama asal" / "Pulihkan semua". Factory reset juga sentiasa memulihkan semuanya.
- Ada **mod demo** untuk mencuba aplikasi ini tanpa perlukan TV.

### Mula pantas (pengguna)

1. Muat turun `CleanTV-win-x64.zip` dan unzip fail (klik kanan > Extract All).
2. Pada TV, hidupkan **Developer options** (Pilihan pembangun) dan **USB debugging** atau **Network debugging** (aplikasi ada menunjukkan panduan langkah mengikut jenama TV anda).
3. Sambungkan komputer ke internet dan klik dua kali **`CleanTV.cmd`**. Untuk kali pertama, ia akan memuat turun Android platform-tools rasmi Google dan menyemak tandatangan Google pada `adb.exe`. Pelayar web akan dibuka secara automatik. Mod demo tidak memuat turun apa-apa.
4. Ikut arahan pada skrin. Tekan **Benarkan** pada skrin TV apabila diminta.

Jangan tutup tetingkap hitam semasa menggunakan CleanTV. Klik dua kali **`CleanTV-Demo.cmd`** untuk mencuba tanpa TV. Windows mungkin memaparkan amaran kerana CleanTV masih baharu dan belum ada code signing. Jika anda mahu teruskan, pilih **More info → Run anyway**, atau sebelum unzip: klik kanan fail zip → **Properties → Unblock → OK**. Fail `node.exe` ditandatangani oleh OpenJS Foundation; `adb.exe` yang dimuat turun kali pertama ditandatangani oleh Google. The zip also includes the signed CleanTV Home APK. <!-- BM-TODO -->

### Pembangun

Perlu Node.js 22 atau lebih baharu. Tiada dependency npm.

```
npm test          # jalankan ujian (tiada TV diperlukan)
npm run demo      # mod demo tanpa TV
npm start         # mula aplikasi (perlu adb)
npm run fetch-adb # muat turun platform-tools rasmi ke vendor/platform-tools
npm run build:win # bina dist/CleanTV-win-x64/ dan dist/CleanTV-win-x64.zip
```

`launcher/cleantv-home.apk` yang ditandatangani oleh workflow keluaran diperlukan sebelum pakej dibina. Lihat [arahan keluaran](docs/RELEASE.md).

`npm run build:win` menyalin `node.exe` semasa (hanya pada Windows x64; di tempat lain guna `--node <laluan>`), `app/`, dan skrip muat turun ke dalam folder portable, kemudian memampatkannya tanpa adb (zip hanya dibuat pada Windows) dan menghasilkan `dist/SHA256SUMS.txt`. Lihat [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) dan [docs/PLAN.md](docs/PLAN.md).

### Lesen platform-tools

Build lite tidak menyertakan adb. `CleanTV.cmd` memuat turun fail binari rasmi Android platform-tools (termasuk `adb`) terus daripada Google (`dl.google.com`) jika adb belum ada. Ia perisian Google di bawah [terma Google](https://developer.android.com/studio/releases/platform-tools) dan bukan sebahagian daripada kod CleanTV. Fail binari itu tidak disimpan dalam repositori.

---

## English

> **Trouble installing?** Follow the [step-by-step install guide](docs/PANDUAN-PASANG.md#english).
> **Prayer times on the TV?** Choose the **CleanTV Home** launcher and your JAKIM zone ([details](docs/PANDUAN-PASANG.md#english)). It is optional; without it CleanTV installs nothing on the TV.

CleanTV is an app that runs on your computer to help your Android / Google TV
become faster and show fewer ads. You connect to the TV over the same Wi-Fi network,
choose the apps you do not need, and CleanTV turns them off for you.

### Safety promise

- **TV apps stay safe.** CleanTV does not delete TV apps; it only removes the launcher CleanTV itself installed.
- **One-click restore.** A "Restore all" button is always available once you are
  connected to the TV.
- **A factory reset restores everything.** If anything feels wrong, resetting the TV
  to factory settings brings back every app.
- **Listed apps only.** Core TV apps are protected and cannot be touched, so you
  cannot accidentally switch off something critical.
- **Stays on your computer.** The app can only be reached from your own computer
  (127.0.0.1) and does not send data anywhere.
- **Prayer-times privacy.** If you install CleanTV Home and choose a zone, that launcher on the TV
  contacts e-solat.gov.my (JAKIM) for your zone's prayer times. Only the zone code is sent; there is
  no location permission.

### Good to know

- The app lists for Google TV, Xiaomi, TCL, Sony, Hisense and Amazon Fire TV are **not yet tested on
  a real TV** (`verified: false`). They were compiled from public sources, and the
  app labels them "not tested yet". Try one TV first, and remember you can restore.
- See [third-party notices](THIRD_PARTY_NOTICES.md) for data sources and licensing.
- You can optionally switch the home screen (launcher) to Projectivy or CleanTV Home (with a JAKIM prayer-times panel).
  CleanTV checks Projectivy is installed, enabled and offered as a home app
  before switching. It then turns off the original home apps, checks the Home
  button, and tries to switch back automatically if the check fails. If the
  connection drops mid-switch, CleanTV repairs it the next time it connects,
  or you can choose "Restore the original home screen" / "Restore all".
  A factory reset always restores everything.
- There is a **demo mode** so you can try the app without a TV.

### Quick start (users)

1. Download `CleanTV-win-x64.zip` and unzip it (right-click > Extract All).
2. On the TV, switch on **Developer options** and **USB / network debugging**
   (the app shows the steps for your TV brand).
3. Connect to the internet and double-click **`CleanTV.cmd`**. On first run it
   downloads Google's official Android platform-tools and checks Google's signature
   on `adb.exe`. Your browser will open. Demo mode downloads nothing.
4. Follow the steps on screen. Press **Allow** on the TV when asked.

Do not close the black window while you use CleanTV. Double-click
**`CleanTV-Demo.cmd`** to try it without a TV. Windows may warn because CleanTV is
new and not code-signed. If you choose to continue, select **More info → Run anyway**,
or before extracting: right-click the zip → **Properties → Unblock → OK**.
`node.exe` is signed by the OpenJS Foundation; `adb.exe` downloaded on first run is
signed by Google. The zip also includes the signed CleanTV Home APK.

### Developers

Needs Node.js 22 or newer. There are no npm dependencies.

```
npm test          # run the tests (no TV needed)
npm run demo      # demo mode without a TV
npm start         # start the app (needs adb)
npm run fetch-adb # download official platform-tools into vendor/platform-tools
npm run build:win # build dist/CleanTV-win-x64/ and dist/CleanTV-win-x64.zip
```

A signed `launcher/cleantv-home.apk` from the release workflow is required before packaging. See [release instructions](docs/RELEASE.md).

`npm run build:win` copies the current `node.exe` (Windows x64 only; elsewhere pass
`--node <path>`), `app/`, and the download script into the portable folder, then zips
it without adb (the zip is only made on Windows) and writes `dist/SHA256SUMS.txt`.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
and [docs/PLAN.md](docs/PLAN.md).

### platform-tools licence

The lite build does not bundle adb. `CleanTV.cmd` downloads the official Android
platform-tools binaries (including `adb`) directly from Google (`dl.google.com`)
when adb is missing. This is Google's software under [Google's terms](https://developer.android.com/studio/releases/platform-tools)
and is not part of the CleanTV code. The binaries are not stored in this repository.

## Keselamatan & privasi / Security & privacy

**Bahasa Melayu.** Kod CleanTV ialah sumber terbuka (lesen MIT) dan boleh dibaca di https://github.com/sepulse/cleantv. Aplikasi ini berjalan hanya pada komputer anda, dengan server di `127.0.0.1`. Tiada pendaftaran akaun atau telemetry. CleanTV tidak menghantar data ke perkhidmatan luar; ia berhubung dengan TV anda melalui rangkaian tempatan sahaja. Satu-satunya muat turun internet oleh CleanTV ialah adb daripada Google pada kali pertama. CleanTV does not delete TV apps; it only removes the launcher CleanTV itself installed. <!-- BM-TODO -->

Semak muat turun anda dengan membandingkan hasil arahan ini dengan `SHA256SUMS.txt` daripada release yang sama:

```powershell
certutil -hashfile CleanTV-win-x64.zip SHA256
```

Semak juga build attestation GitHub:

```powershell
gh attestation verify CleanTV-win-x64.zip --repo sepulse/cleantv
```

Laporan VirusTotal dipautkan dalam nota setiap release.
Checksum mengesan jika fail berbeza; attestation mengaitkannya terus dengan build GitHub.
Kedua-dua semakan ini serta laporan antivirus bukan jaminan bahawa perisian bebas risiko.

**English.** CleanTV is open source (MIT licence); read the code at https://github.com/sepulse/cleantv. The app runs only on this
computer, with its server on `127.0.0.1`. There is no account or telemetry.
CleanTV sends no data to outside services; it communicates with your TV over your
local network. Its only internet download is the first-run adb download from Google.
CleanTV does not delete TV apps; it only removes the launcher CleanTV itself installed. Restore all restores the original HOME before removing that launcher.

Compare the output of `certutil -hashfile CleanTV-win-x64.zip SHA256` with
`SHA256SUMS.txt` from the same release. Check the GitHub build attestation with
`gh attestation verify CleanTV-win-x64.zip --repo sepulse/cleantv`. The VirusTotal report is linked in
each release's notes. A checksum detects a different
file; an attestation links it to the GitHub build. Neither these checks nor an
antivirus report guarantees that software is risk-free. Release steps:
[docs/RELEASE.md](docs/RELEASE.md).
