# CleanTV-Web — Seni Bina

Aplikasi web tempatan untuk *debloat* Android TV / Google TV melalui Wi-Fi ADB
(port 5555), untuk pengguna rumah bukan teknikal di Malaysia / SEA.

## 1. Keputusan seni bina (muktamad untuk v1)

| # | Keputusan | Sebab |
|---|-----------|-------|
| D1 | **Local web app**: Node.js ≥ 22 (ESM JavaScript + JSDoc, tiada build step), Express 5, frontend Vanilla JS + CSS dihidang statik. | Paling sedikit kebergantungan; boleh dibungkus jadi satu `.exe` (Node SEA) pada Fasa 6. Tauri ditangguh — perlu Rust toolchain dan sidecar Node, tiada manfaat untuk v1. |
| D2 | **ADB = binari rasmi `adb` dipanggil melalui `execFile`** (tanpa shell). Tiada `@devicefarmer/adbkit`. | adbkit tetap perlukan adb server yang sama; pembalut nipis lebih mudah diuji (runner boleh disuntik) dan tiada lapisan tambahan. ADB pure-JS (Tango) kurang terbukti untuk auth TCP. |
| D3 | Cari `adb` ikut tertib: env `CLEANTV_ADB` → `vendor/platform-tools/adb(.exe)` → `PATH`. Muat turun platform-tools rasmi dari `dl.google.com` ialah skrip berasingan (Fasa 6). | Pengguna tidak perlu pasang Android SDK. |
| D4 | **Hanya `pm disable-user --user 0` dan `pm enable --user 0`.** Tiada `uninstall`, `pm clear`, `rm`, `settings put` di mana-mana kod. Diuji secara automatik. | Setiap tindakan boleh diundur; factory reset sentiasa memulihkan semua. |
| D5 | **Allowlist, bukan blocklist**: hanya pakej yang ada dalam registry dengan risiko `green`/`yellow` boleh dimatikan. Pakej tidak dikenali tidak boleh disentuh dalam v1. | Pengguna tidak boleh "tersilap" mematikan sesuatu yang kritikal. |
| D6 | Pelayan bind **127.0.0.1 sahaja** + semakan header `Host` + token sesi untuk semua POST. | Laman web lain dalam pelayar tidak boleh menghantar arahan ke TV (CSRF / DNS rebinding). |
| D7 | Kemajuan kerja dihantar melalui **SSE** (Server-Sent Events), bukan WebSocket. | Aliran sehala sudah cukup; tiada pustaka tambahan. |
| D8 | Jurnal tindakan disimpan per peranti (kunci = `ro.serialno`, bukan IP) dalam direktori data pengguna. | IP TV berubah dengan DHCP; Restore mesti tetap berfungsi. |

## 2. Model keselamatan (berlapis)

Setiap permintaan "matikan pakej" mesti lulus **semua** lapisan, dalam tertib ini:

1. **L1 — Allowlist arahan.** `AdbClient` tidak mengeksport fungsi `shell` generik. Ia hanya ada kaedah bernama: `connect`, `disconnect`, `devices`, `getprops`, `listPackages`, `disableUser`, `enableUser`, `resolveHomeActivity`.
2. **L2 — Pengesahan input.** Nama pakej mesti padan `^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$`; serial mesti `IPv4:port`. (Hujah `adb shell` digabung semula oleh shell pada TV — pengesahan ini menghalang suntikan arahan.)
3. **L3 — `NEVER_TOUCH` dalam kod.** Senarai keras pakej teras (systemui, settings, gms, vending, packageinstaller, bluetooth, input method, webview, setup wizard, perkhidmatan alat kawalan jauh, provider, dll.). Menang mengatasi registry.
4. **L4 — Registry allowlist.** Pakej mesti wujud dalam preset yang padan dengan peranti, dan risikonya bukan `red`.
5. **L5 — Pelancar semasa dilindungi.** Aktiviti HOME semasa (`cmd package resolve-activity ... HOME`) tidak boleh dimatikan. Tukar pelancar ialah aliran khas (Fasa 5).
6. **L6 — Jurnal dahulu.** Niat ditulis ke jurnal (`pending`) sebelum arahan; hasil dikemas kini selepasnya.
7. **L7 — Sahkan selepas.** Status pakej dibaca semula; UI memaparkan keadaan sebenar, bukan keadaan yang diandaikan.

**Restore:** gabungan (jurnal peranti) ∪ (`pm list packages -d` ∩ registry). Jadi Restore tetap berfungsi walaupun jurnal hilang.

## 3. Struktur folder

```
cleantv/
├─ package.json            # "type": "module", engines node >= 22
├─ README.md
├─ docs/
│  ├─ ARCHITECTURE.md      # dokumen ini
│  ├─ PLAN.md              # pelan fasa
│  └─ brief/               # brief untuk agen (Codex / Gemini)
├─ presets/                # registry JSON (data, bukan kod)
│  ├─ SCHEMA.md
│  ├─ common-android-tv.json
│  ├─ google-tv.json       # Fasa 2
│  └─ xiaomi.json, tcl.json, sony.json, hisense.json   # Fasa 2
├─ src/
│  ├─ core/                # Fasa 1 — tiada kebergantungan HTTP
│  │  ├─ errors.js         # CleanTvError + kod ralat
│  │  ├─ adb/
│  │  │  ├─ locate.js      # cari binari adb (D3)
│  │  │  ├─ runner.js      # execFile + timeout (boleh disuntik untuk ujian)
│  │  │  └─ client.js      # AdbClient: kaedah bernama sahaja (L1)
│  │  ├─ safety.js         # validator, NEVER_TOUCH, assertCanDisable (L2–L5)
│  │  ├─ device.js         # getprop → DeviceInfo, identiti peranti, HOME
│  │  ├─ packages.js       # senarai pakej + status enabled/disabled
│  │  ├─ registry.js       # muat + sahkan preset, padankan dengan peranti
│  │  ├─ journal.js        # jurnal JSON per peranti, tulis atomik
│  │  ├─ discovery.js      # imbas subnet /24 untuk port 5555
│  │  └─ engine.js         # fasad: getPackageStates / disable / restore
│  ├─ server/              # Fasa 3
│  │  ├─ index.js          # bootstrap Express, bind 127.0.0.1
│  │  ├─ security.js       # semakan Host + token sesi (D6)
│  │  ├─ jobs.js           # baris gilir kerja per peranti + SSE
│  │  └─ routes/           # discover, devices, packages, jobs
│  └─ cli/smoke.js         # ujian baca-sahaja pada TV sebenar
├─ public/                 # Fasa 4 — dashboard
│  ├─ index.html
│  ├─ css/
│  └─ js/
└─ test/                   # node:test, runner palsu, tiada TV diperlukan
```

## 4. Skema registry (ringkas)

```json
{
  "id": "common-android-tv",
  "match": { "any": true },
  "packages": [
    {
      "package": "com.google.android.feedback",
      "risk": "green",
      "category": "telemetry",
      "label": { "en": "Feedback reporter", "ms": "" },
      "description": { "en": "Sends crash reports to Google.", "ms": "" },
      "effect": { "en": "Nothing visible changes.", "ms": "" },
      "sources": ["https://..."],
      "verified": false
    }
  ]
}
```

- `match`: `{ "any": true }` atau `{ "brand": ["xiaomi"], "manufacturer": [...], "feature": "google-tv" }` (padanan tidak sensitif huruf).
- `risk`: `green` = selamat, `yellow` = pilihan (ada kesan yang dijelaskan dalam `effect`), `red` = dilindungi, papar sahaja.
- `category`: `ads | telemetry | bloat | store | launcher | assistant | system`.
- `verified`: `true` hanya selepas diuji pada TV sebenar (Fasa 6). UI memaparkan entri `verified: false` dengan tanda "belum diuji".
- Teks `ms` diisi oleh Gemini (Fasa 2b), bukan oleh pembina kod.

## 5. Kontrak API (Fasa 3)

Asas: `http://127.0.0.1:<port>/api`. Semua respons JSON. Semua `POST` wajib:
`Content-Type: application/json` dan header `X-CleanTV-Token: <token>` (token
disuntik ke `index.html` sebagai `<meta name="cleantv-token">` semasa permulaan).

Bentuk ralat: `{ "error": { "code": "DEVICE_UNAUTHORIZED", "message": "..." } }`.

| Kaedah | Laluan | Badan | Respons |
|--------|--------|-------|---------|
| GET | `/health` | — | `{ ok, adb: { found, path, version } }` |
| POST | `/discover` | `{}` | `{ candidates: [{ ip, port }] }` (imbas ~2–5 s) |
| POST | `/devices/connect` | `{ ip, port? = 5555 }` | `{ serial, state: "device" \| "unauthorized" \| "offline" \| "unreachable" }` |
| GET | `/devices` | — | `{ devices: [{ serial, state }] }` |
| GET | `/devices/:serial` | — | `{ serial, deviceId, brand, manufacturer, model, androidVersion, sdk, isGoogleTv, homePackage, presets: [id] }` |
| GET | `/devices/:serial/packages` | — | `{ packages: [{ package, risk, category, label, description, effect, verified, installed, enabled, canDisable, blockedReason? }] }` |
| POST | `/devices/:serial/disable` | `{ packages: [string] }` | `202 { jobId }` |
| POST | `/devices/:serial/restore` | `{ packages: [string] }` atau `{ all: true }` | `202 { jobId }` |
| GET | `/devices/:serial/history` | — | `{ entries: [{ at, action, package, result }] }` |
| POST | `/devices/:serial/disconnect` | `{}` | `{ ok: true }` |
| GET | `/jobs/:jobId/events` | — | SSE (lihat bawah) |

`:serial` = `ip:port`, di-*URL-encode*. Satu peranti hanya menjalankan satu kerja
pada satu masa; kerja kedua → `409 DEVICE_BUSY`.

**Acara SSE:**

```
event: progress
data: { "done": 3, "total": 8, "package": "com.x", "result": "disabled" | "enabled" | "skipped" | "failed", "reason"?: "PACKAGE_PROTECTED" }

event: complete
data: { "succeeded": 7, "failed": 1, "results": [ ... ] }

event: error
data: { "code": "DEVICE_OFFLINE", "message": "..." }
```

**Kod ralat:** `ADB_NOT_FOUND`, `INVALID_INPUT`, `DEVICE_UNREACHABLE`,
`DEVICE_UNAUTHORIZED`, `DEVICE_OFFLINE`, `DEVICE_BUSY`, `PACKAGE_PROTECTED`,
`PACKAGE_NOT_IN_REGISTRY`, `PACKAGE_IS_LAUNCHER`, `COMMAND_FAILED`, `TIMEOUT`,
`FORBIDDEN` (token/Host salah).

## 6. Aliran pengguna (sasaran UX)

1. Buka aplikasi → semak `adb` → panduan bergambar: "Hidupkan *Developer options* dan *USB debugging* pada TV".
2. "Cari TV saya" → senarai TV di rangkaian → pilih → "Tekan **Benarkan** pada skrin TV" (poll sehingga `device`).
3. Halaman TV: jenama/model dikesan, preset dipadankan, pakej dikumpulkan ikut kategori dan warna risiko. Pilihan `green` ditanda secara lalai; `yellow` tidak.
4. "Bersihkan" → bar kemajuan langsung (SSE) → ringkasan.
5. "Pulihkan semua" sentiasa kelihatan, satu klik.
