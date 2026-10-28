# Senarai semak release

## CleanTV Home signing (owner setup, once)

The owner must create and back up the signing key. No agent creates or uploads it.
Every release must use the same key so Android accepts future updates. Missing
secrets fail the build; the upstream debug signing configuration is replaced.

1. On your own trusted computer with a JDK, create the key outside this repository.
   Run the following command yourself and answer its password and identity prompts:

   ```powershell
   keytool -genkeypair -keystore "$env:USERPROFILE/cleantv-home-release.jks" -storetype JKS -alias cleantv-home -keyalg RSA -keysize 3072 -validity 10000
   ```

2. Keep an offline backup of the keystore, alias, keystore password and key password.
   Do not commit them, put them in release assets, or regenerate them per release.
3. In GitHub, open this repository's **Settings → Secrets and variables → Actions →
   New repository secret**. Create these four repository secrets:

   | Secret | Value |
   | --- | --- |
   | `LAUNCHER_KEYSTORE_B64` | Base64 of the keystore bytes |
   | `LAUNCHER_KEYSTORE_PASSWORD` | Password entered for the keystore |
   | `LAUNCHER_KEY_ALIAS` | `cleantv-home` (or the alias you created) |
   | `LAUNCHER_KEY_PASSWORD` | Password for that key (may equal the keystore password) |

   To copy the base64 value without writing another key file, run this yourself:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE/cleantv-home-release.jks")) | Set-Clipboard
   ```

   Paste it into the secret value, save, and clear your clipboard. Enter the other
   three values directly in GitHub. Never paste signing material into a chat or log.
4. Review `launcher/UPSTREAM.txt`: URL, pinned SHA
   `d6410ab3514506db666279e7ee17d4933f835776`, date `2026-10-28`.
   The workflow checks out only the `launcher/` folder of that SHA, applies every
   `launcher/patches/*.patch` (the Waktu Solat panel; the build stops with a clear
   message if a patch no longer applies, so a new pin and its patch change together),
   runs the patch's JVM unit test, uses the pinned official `actions/setup-java`
   action for JDK 17 and Google's SDK from the official GitHub Windows runner,
   and installs Android platform 34 / build-tools 34.0.0 with Google's sdkmanager.
   Only app identity, display name and release signing are patched. The Java
   namespace stays upstream's so component class names remain valid. No upstream
   install scripts, key helpers, extra permissions or compilation commands run on TVs.
5. After review and tests, the owner commits, pushes and tags a new `v*` release.
   CI runs `assembleRelease` with applicationId `io.github.sepulse.cleantv.home`,
   name **CleanTV Home**, and the secret-backed signing configuration. The decoded
   key lives in the runner's temporary directory and is deleted in `finally`.
   No key is uploaded; only the APK, portable zip and checksums become assets.
6. Download `CleanTV-win-x64.zip`, `cleantv-home.apk` and `SHA256SUMS.txt`. Compare
   both asset hashes with the sums and verify both attestations:

   ```powershell
   certutil -hashfile cleantv-home.apk SHA256
   gh attestation verify cleantv-home.apk --repo sepulse/cleantv
   ```

The zip includes `app/launcher/cleantv-home.apk` and
`app/launcher/SHA256SUMS.txt` (the exact APK digest). The runtime verifies that
fixed asset before installing; it never accepts an APK path from an API request.
The manifest is an integrity check; use GitHub attestations to verify build origin.
`LICENSE`, `THIRD_PARTY_NOTICES.md` (MIT + Outfit OFL) and `UPSTREAM.txt` ship too.
Local packaging requires the signed APK at `launcher/cleantv-home.apk`; there is
no local debug-key fallback. Copy the release APK there if repackaging locally.

Signing is **untested until CI runs** with the owner's secrets. The Gradle APK
build of the patched launcher has **not** been run locally yet (the Android build
was not permitted in the implementation session); the new Java was compiled with
`javac` against the Android 34 `android.jar` and `PrayerTimesTest` passed on the
JVM, but resources, manifest merge and R8 are unverified until a Gradle build.
See STATUS.md for what was and was not verified on a real TV.

## Existing release checks

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
5. Templat dalam `docs/marketing/posting-media-sosial.md` memaut ke
   https://github.com/sepulse/cleantv/releases, jadi ia tidak perlu ditukar untuk
   setiap versi. Semak sahaja bahawa kenyataannya masih tepat untuk versi baharu.

