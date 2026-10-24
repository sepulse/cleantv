# CleanTV

**Bahasa Melayu** | [English](#english)

## Bahasa Melayu

CleanTV ialah aplikasi yang berjalan di komputer anda untuk membantu TV Android /
Google TV anda menjadi lebih laju dan kurang iklan. Anda sambungkan ke TV melalui
rangkaian Wi-Fi yang sama, pilih aplikasi yang tidak diperlukan, dan CleanTV
mematikannya untuk anda.

### Janji keselamatan

- **Matikan, bukan padam.** CleanTV hanya mematikan aplikasi. Ia tidak
  menyahpasang atau memadam apa-apa.
- **Pulihkan dengan satu klik.** Butang "Pulihkan semua" sentiasa ada selepas
  anda bersambung ke TV.
- **Factory reset memulihkan semuanya.** Jika berlaku sesuatu yang aneh, set semula
  kilang TV mengembalikan semua aplikasi.
- **Hanya aplikasi dalam senarai.** Aplikasi teras TV dilindungi dan tidak boleh
  disentuh. Anda tidak boleh tersilap mematikan sesuatu yang kritikal.
- **Hanya pada komputer anda.** Aplikasi ini hanya boleh dicapai daripada komputer
  anda sendiri (127.0.0.1) dan tidak menghantar data ke mana-mana.

### Perkara yang perlu diketahui

- Senarai aplikasi untuk Google TV, Xiaomi, TCL, Sony dan Hisense **belum diuji
  pada TV sebenar** (`verified: false`). Ia disusun daripada sumber awam. Aplikasi
  ini menandakannya sebagai "belum diuji". Cuba pada satu TV dahulu, dan ingat
  bahawa anda boleh memulihkannya.
- Anda boleh menukar skrin utama (launcher) kepada Projectivy secara pilihan.
  CleanTV menyemak Projectivy sudah dipasang, dihidupkan dan tersedia sebagai
  home app sebelum menukar launcher. Kemudian CleanTV mematikan home app asal,
  menyemak butang Home dan cuba kembali ke skrin utama asal secara automatik
  jika semakan gagal. Jika sambungan terputus semasa penukaran, CleanTV
  memulihkannya apabila anda bersambung semula, atau anda boleh pilih
  "Pulihkan skrin utama asal" / "Pulihkan semua". Factory reset sentiasa
  memulihkan semuanya.
- Ada **mod demo** untuk mencuba aplikasi tanpa TV.

### Mula pantas (pengguna)

1. Muat turun `CleanTV-win-x64.zip` dan nyahzip (klik kanan > Extract All).
2. Pada TV, hidupkan **Pilihan pembangun** dan **Penyahpepijatan USB / rangkaian**
   (aplikasi menunjukkan langkah mengikut jenama TV).
3. Sambung ke internet dan klik dua kali **`CleanTV.cmd`**. Kali pertama, ia memuat
   turun Android platform-tools rasmi Google dan menyemak tandatangan Google pada
   `adb.exe`. Pelayar akan terbuka. Mod demo tidak memuat turun apa-apa.
4. Ikut langkah di skrin. Tekan **Benarkan** pada skrin TV apabila diminta.

Jangan tutup tetingkap hitam semasa menggunakan CleanTV. Klik dua kali
**`CleanTV-Demo.cmd`** untuk mencuba tanpa TV. Windows mungkin memberi amaran kerana
CleanTV masih baharu dan tiada code signing. Jika anda memilih untuk teruskan,
pilih **More info → Run anyway**, atau sebelum nyahzip: klik kanan zip →
**Properties → Unblock → OK**. `node.exe` ditandatangani oleh OpenJS Foundation;
`adb.exe` yang dimuat turun pada kali pertama ditandatangani oleh Google. Fail
selebihnya ialah teks JavaScript/HTML dan data yang boleh dibaca.

### Pembangun

Perlu Node.js 22 atau lebih baharu. Tiada kebergantungan npm.

```
npm test          # jalankan ujian (tiada TV diperlukan)
npm run demo      # mod demo tanpa TV
npm start         # mula aplikasi (perlu adb)
npm run fetch-adb # muat turun platform-tools rasmi ke vendor/platform-tools
npm run build:win # bina dist/CleanTV-win-x64/ dan dist/CleanTV-win-x64.zip
```

`npm run build:win` menyalin `node.exe` semasa (hanya pada Windows x64; di tempat lain
guna `--node <laluan>`), `app/`, dan skrip muat turun ke dalam folder mudah alih, kemudian
memampatkannya tanpa adb (zip hanya dibuat pada Windows) dan menghasilkan
`dist/SHA256SUMS.txt`. Lihat [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
dan [docs/PLAN.md](docs/PLAN.md).

### Lesen platform-tools

Binaan lite tidak menyertakan adb. `CleanTV.cmd` memuat turun binari rasmi Android
platform-tools (termasuk `adb`) terus daripada Google (`dl.google.com`) apabila adb
belum ada. Ia perisian Google di bawah [terma Google](https://developer.android.com/studio/releases/platform-tools)
dan bukan sebahagian daripada kod CleanTV. Binari itu tidak disimpan dalam repositori.

---

## English

CleanTV is an app that runs on your computer to help your Android / Google TV
become faster and show fewer ads. You connect to the TV over the same Wi-Fi network,
choose the apps you do not need, and CleanTV turns them off for you.

### Safety promise

- **Disable, not delete.** CleanTV only turns apps off. It never uninstalls or
  deletes anything.
- **One-click restore.** A "Restore all" button is always available once you are
  connected to the TV.
- **A factory reset restores everything.** If anything feels wrong, resetting the TV
  to factory settings brings back every app.
- **Listed apps only.** Core TV apps are protected and cannot be touched, so you
  cannot accidentally switch off something critical.
- **Stays on your computer.** The app can only be reached from your own computer
  (127.0.0.1) and does not send data anywhere.

### Good to know

- The app lists for Google TV, Xiaomi, TCL, Sony and Hisense are **not yet tested on
  a real TV** (`verified: false`). They were compiled from public sources, and the
  app labels them "not tested yet". Try one TV first, and remember you can restore.
- You can optionally switch the home screen (launcher) to Projectivy.
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
signed by Google. The remaining files are plain, readable JavaScript/HTML text and data.

### Developers

Needs Node.js 22 or newer. There are no npm dependencies.

```
npm test          # run the tests (no TV needed)
npm run demo      # demo mode without a TV
npm start         # start the app (needs adb)
npm run fetch-adb # download official platform-tools into vendor/platform-tools
npm run build:win # build dist/CleanTV-win-x64/ and dist/CleanTV-win-x64.zip
```

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

**Bahasa Melayu.** Kod CleanTV terbuka untuk dibaca: [PAUTAN REPO]. Aplikasi
berjalan hanya pada komputer anda, dengan server di `127.0.0.1`. Tiada akaun atau
telemetry. CleanTV tidak menghantar data ke perkhidmatan luar; ia berhubung dengan
TV anda melalui rangkaian tempatan. Satu-satunya muat turun internet oleh CleanTV
ialah adb daripada Google pada kali pertama. Ia hanya mematikan aplikasi yang
dipilih; setiap tindakan boleh dipulihkan, termasuk pertukaran launcher pilihan.

Semak muat turun dengan membandingkan hasil arahan ini dengan `SHA256SUMS.txt`
daripada release yang sama:

```powershell
certutil -hashfile CleanTV-win-x64.zip SHA256
```

Semak juga build attestation GitHub (gantikan `<owner>/<repo>` dengan repositori
sebenar):

```powershell
gh attestation verify CleanTV-win-x64.zip --repo <owner>/<repo>
```

Lihat laporan VirusTotal dalam nota setiap release: [PAUTAN LAPORAN VIRUSTOTAL].
Checksum mengesan fail yang berbeza; attestation mengaitkannya dengan build GitHub.
Kedua-duanya dan laporan antivirus bukan jaminan bahawa perisian bebas risiko.

**English.** CleanTV's source code is available to read: [PAUTAN REPO]. The app runs only on this
computer, with its server on `127.0.0.1`. There is no account or telemetry.
CleanTV sends no data to outside services; it communicates with your TV over your
local network. Its only internet download is the first-run adb download from Google.
It only turns selected apps off, and every action can be undone, including an
optional launcher switch.

Compare the output of `certutil -hashfile CleanTV-win-x64.zip SHA256` with
`SHA256SUMS.txt` from the same release. Check the GitHub build attestation with
`gh attestation verify CleanTV-win-x64.zip --repo <owner>/<repo>` (replace
`<owner>/<repo>` with the actual repository). See the VirusTotal report linked in
each release's notes: [PAUTAN LAPORAN VIRUSTOTAL]. A checksum detects a different
file; an attestation links it to the GitHub build. Neither these checks nor an
antivirus report guarantees that software is risk-free. Release steps:
[docs/RELEASE.md](docs/RELEASE.md).
