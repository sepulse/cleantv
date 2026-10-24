# Brief — Phase 2b: bilingual text (Bahasa Melayu + English)

Repo: `D:\Project\Deep\cleantv`. Audience: non-technical home users in Malaysia who
are nervous about "breaking" their TV. Read `docs/DESIGN.md` § Language first.

## Your job

1. **`public/i18n/ms.json`** — it currently holds English values copied from
   `public/i18n/en.json`. Replace every value with natural, friendly Bahasa Melayu
   (standard Malaysian Malay, "anda" form, short sentences, warm and calm tone).
2. **`public/i18n/en.json`** — audit the English: plain words, short sentences,
   consistent terms. Improve wording only where it is unclear or awkward.
3. **`presets/*.json`** — for every entry fill `label.ms`, `description.ms`,
   `effect.ms` from the matching `en` text, and lightly improve `en` wording if it is
   unclear.

## Rules (mandatory)

- **Keep established English technical terms unchanged** inside Malay text: Wi-Fi,
  ADB, IP, USB, HDMI, Bluetooth, Play Store, Google TV, Android TV, Chromecast,
  Assistant, launcher, Projectivy, YouTube, Netflix, app names and brand names.
  Do **not** translate brand or app names.
- **Add nothing that is not in the source text.** No new facts, warnings, examples or
  claims. Keep the meaning exactly — especially in `effect` texts (what the user
  loses) and every safety/undo statement.
- **Keep structure:** do not add, remove, rename or reorder JSON keys; keep
  `{placeholders}` exactly as they are; keep the files valid JSON with the same
  formatting style. Only string values change.
- Keys under `tvMenu.*.en` must stay English (they mirror the TV's English menus);
  `tvMenu.*.ms` must be the name Malay-language Android TV menus actually use if you
  know it, otherwise a plain translation.
- Consistent glossary (use these everywhere):
  disable → **matikan** · restore → **pulihkan** · protected → **dilindungi** ·
  safe → **selamat** · optional → **pilihan** · not tested yet → **belum diuji** ·
  connect → **sambung** · allow → **benarkan** · home screen → **skrin utama** ·
  Developer options → **Pilihan pembangun** · USB debugging → **Penyahpepijatan USB**.
- Do not edit any other file.

## Report

List: number of strings changed per file, any `en` wording you changed (old → new),
and any string you were unsure how to translate.
