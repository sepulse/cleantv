# STATUS

| Item | Worker | Branch | State | Next action |
|------|--------|--------|-------|-------------|
| Fasa 0 seni bina | Claude Opus | master | done | — |
| Fasa 1 Core ADB Engine | Codex Sol | master | done (cd2fe96) | — |
| Fasa 2a preset jenama | Codex Sol + semakan Sol | master | done (b9b2a92) | — |
| Fasa 3 API + SSE | Codex Sol | master | done (56316ad) | — |
| Fasa 4a hala tuju visual | Claude Opus | master | done (docs/DESIGN.md) | — |
| Fasa 4b dashboard + demo | Codex Sol | master | done (d2a8f91) | — |
| Fasa 5 tukar pelancar | Codex Sol + Sonnet (kuota Sol habis) | master | done (5c25343) | — |
| Fasa 6 pembungkusan | Sonnet | master | done (bdfa193) | — |
| Fasa 2b teks BM/EN | Gemini Flash + semakan Sonnet | master | done (eebf05f) | — |
| Semakan akhir keseluruhan repo | Codex Sol (2 pusingan) + Sonnet | master | done (RELEASE-OK selepas pembaikan) | — |
| Pakej portable | build-portable | — | dist/CleanTV-win-x64.zip | uji pada Windows bersih |
| Ujian TV sebenar, `verified: true` | Pemilik | — | blocked (perlu TV) | jalankan `npm run smoke -- <ip>` dahulu (baca sahaja) |
| Fasa 8 guard launcher + NEVER_TOUCH + pemilih launcher | Codex (bina) + semakan Sol (A+B, 2 pusingan) + Sonnet (C) + Gemini (BM) | main | done | Wolf Launcher tidak ditambah (tiada di Play Store, pakej tidak dapat disahkan); ujian TV sebenar: guard HOME / pengesanan Xiaomi |
| Fasa 9 import preset cleanyourtv (+58 pakej) | Codex + semakan Claude/Sol + Gemini (BM) | main | done (b4a759b) | — |
| Fasa 9b preset Amazon Fire TV | Codex + Sol + Gemini | main | done (e5dff8a) | Fire TV jenama lain (Hisense/TCL/Toshiba) belum diliputi |
| Fasa 11 keadaan asal TV (baseline) | Codex + Sol (3 pusingan) | main | done (8862052) | — |
| Fasa 12 semakan selepas reboot | Codex + Sol | main | done (34ed503) | — |
| Fasa 13a Private DNS (AdGuard, pilihan) | Codex + Sol (2) + Gemini | main | done (cc6df64) | — |
| Fasa 13b tutup ADB rangkaian | Codex + Sol (3) + Gemini | main | done (1710345) | — |
| Fasa 13c audit privasi (baca sahaja) | Codex + Sonnet + Gemini | main | done (d9bcf4b) | — |
| Fasa 10 launcher CleanTV Home | Codex | — | dihidupkan semula dalam Fasa 14 (28 Okt) | patch WIP: `D:/Project/Deep/_cyt/fasa10-launcher-wip.patch` |
| Panduan pasang + FAQ widget solat | Claude Opus + semakan Sonnet | main | done (2d4b241, belum push) | push; isi nota release v0.2.1-beta (perlu izin) |
| Fasa 14 CleanTV Home + panel Waktu Solat JAKIM | Sonnet (bina) + semakan subagent | claude/optimistic-hopper-421765 | dibina pada cawangan, belum ke main/pack/release; build debug + JUnit + lintVitalRelease berjaya secara tempatan (28 Okt), release/R8/tandatangan hanya diuji oleh CI | pemilik: 4 GitHub Secrets keystore, ujian TV sebenar, semakan BM Gemini (`docs/brief/AKTIF-semakan-bm-fasa14.md`) |
