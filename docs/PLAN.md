# CleanTV-Web — Pelan Fasa

Setiap fasa: dibina oleh pembina yang ditetapkan → disemak dalam sesi berasingan →
ujian hijau → commit. Seni bina rujuk [ARCHITECTURE.md](ARCHITECTURE.md).

| Fasa | Skop | Pembina | Semakan | Siap apabila |
|------|------|---------|---------|--------------|
| 0 | Seni bina, kontrak API, pelan | Claude Opus | — | Dokumen ini + ARCHITECTURE.md |
| 1 | **Core ADB Engine** (`src/core/*`), skema registry + `common-android-tv.json`, ujian dengan runner palsu, `src/cli/smoke.js` | Codex GPT-6 high | Subagent berasingan | `npm test` hijau; tiada arahan terlarang dalam `src/` |
| 2a | Kandungan registry jenama: Google TV, Xiaomi (PatchWall), TCL, Sony, Hisense — setiap entri ada `sources`, `verified: false` | Codex GPT-6 high | Codex Sol (risiko brick) | Setiap preset lulus validator; tiada pakej NEVER_TOUCH bertanda green/yellow |
| 2b | Teks Bahasa Melayu (`label.ms`, `description.ms`, `effect.ms`) | Gemini Flash | Sonnet (nada) | Semua medan `ms` terisi; istilah teknikal Inggeris dikekalkan |
| 3 | HTTP API + SSE + keselamatan localhost (`src/server/*`) | Codex GPT-6 high | Subagent berasingan | Ujian API (supertest-less, `fetch` ke pelayan sebenar dengan runner palsu) hijau |
| 4a | Hala tuju visual dashboard (wireframe + token warna/tipografi) | Claude Opus | Pemilik | Pemilik lulus reka bentuk |
| 4b | Dashboard (`public/*`) ikut reka bentuk yang dilulus | Codex GPT-6 high | Subagent + semakan visual (satu grid tangkapan skrin) | Aliran §6 boleh dijalankan hujung ke hujung dengan runner palsu |
| 5 | Aliran pelancar (Projectivy via Play Store `market://`, kemudian baru pelancar asal boleh dimatikan) + modul iklan skrin utama | Codex GPT-6.1 Sol | Sol sesi baharu | Pelancar asal tidak boleh dimatikan tanpa pengganti yang disahkan berjalan |
| 6 | Pembungkusan (Node SEA `.exe`, muat turun platform-tools), ujian pada TV sebenar, set `verified: true` | Codex GPT-6 high + pemilik (TV sebenar) | Sol (diff akhir) | Pemasang satu-klik berfungsi pada Windows bersih |

## Risiko terbuka

- **Google TV Android 12+ dengan "Wireless debugging"** mungkin perlukan `adb pair <ip>:<port> <kod>` dan bukan port 5555. Sokongan *pairing* dirancang dalam Fasa 3 (endpoint `POST /devices/pair`) jika ujian Fasa 6 menunjukkan ia perlu.
- **Nama pakej jenama** berbeza ikut model dan firmware. Sebab itu setiap entri bermula `verified: false` dan hanya pakej dalam registry boleh disentuh.
- **Pelancar asal Google TV** (`com.google.android.apps.tv.launcherx`) ialah sumber utama iklan, tetapi mematikannya tanpa pengganti menjadikan butang Home "mati". Hanya Fasa 5 dibenarkan menyentuhnya.
