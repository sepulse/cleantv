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
3. Klik dua kali **`CleanTV.cmd`**. Pelayar akan terbuka.
4. Ikut langkah di skrin. Tekan **Benarkan** pada skrin TV apabila diminta.

Jangan tutup tetingkap hitam semasa menggunakan CleanTV. Klik dua kali
**`CleanTV-Demo.cmd`** untuk mencuba tanpa TV. Jika Windows memberi amaran,
pilih "More info" > "Run anyway".

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
guna `--node <laluan>`), `app/`, dan platform-tools ke dalam folder mudah alih, kemudian
memampatkannya (zip hanya dibuat pada Windows). Lihat [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
dan [docs/PLAN.md](docs/PLAN.md).

### Lesen platform-tools

Binaan mudah alih memuat turun binari rasmi Android platform-tools (termasuk `adb`)
terus daripada Google (`dl.google.com`). Ia tertakluk kepada terma Android SDK
Google dan bukan sebahagian daripada kod CleanTV. Binari itu tidak disimpan dalam repositori.

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
3. Double-click **`CleanTV.cmd`**. Your browser will open.
4. Follow the steps on screen. Press **Allow** on the TV when asked.

Do not close the black window while you use CleanTV. Double-click
**`CleanTV-Demo.cmd`** to try it without a TV. If Windows shows a warning, choose
"More info" > "Run anyway".

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
`--node <path>`), `app/`, and platform-tools into the portable folder, then zips it
(the zip is only made on Windows). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
and [docs/PLAN.md](docs/PLAN.md).

### platform-tools licence

The portable build downloads the official Android platform-tools binaries (including
`adb`) directly from Google (`dl.google.com`). They are covered by Google's Android
SDK terms and are not part of the CleanTV code. The binaries are not stored in this
repository.
