# Senarai semak release

1. Pastikan ujian lulus dan perubahan sudah disemak. Cipta tag versi `v*`
   (contohnya `v1.0.0`) pada commit yang hendak dikeluarkan, kemudian push tag.
2. Tunggu workflow **Release** di GitHub selesai: Node 24 pada Windows menjalankan
   ujian, membina zip lite tanpa adb, menghasilkan build attestation dan memuat naik
   `CleanTV-win-x64.zip` serta `SHA256SUMS.txt` ke GitHub Release.
3. Muat turun kedua-dua fail daripada release. Jalankan
   `certutil -hashfile CleanTV-win-x64.zip SHA256` dan bandingkan dengan
   `SHA256SUMS.txt`. Semak juga
   `gh attestation verify CleanTV-win-x64.zip --repo sepulse/cleantv`
   dengan nama repositori sebenar.
4. Muat naik zip release itu ke VirusTotal. Tampal pautan laporan sebenar dalam
   nota release; jangan dakwa imbasan bersih sebelum membaca hasilnya. Attestation
   membuktikan asal build, bukan jaminan keselamatan.
5. Kemas kini `[PAUTAN MUAT TURUN]` dalam
   `docs/marketing/posting-media-sosial.md` kepada pautan release sebenar.

