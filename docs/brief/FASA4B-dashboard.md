# Brief — Phase 4b: Web dashboard

Repo: `D:\Project\Deep\cleantv`. Read first: `docs/DESIGN.md` (approved visual + UX
direction — follow it faithfully, do not redesign), `docs/ARCHITECTURE.md` §5 (API
contract), and `src/server/*` (Phase 3, the real API you call).

## Rules (mandatory)

- **Implement the approved design faithfully.** Preserve flow, layout, hierarchy,
  spacing, tokens and copy intent from DESIGN.md. No extra screens or features.
- **Surgical / in-scope:** create only files under `public/` listed in DESIGN.md
  "Front-end structure", plus `test/public.test.js`. Replace the Phase 3 placeholder
  `public/index.html`, keeping the `{{CLEANTV_TOKEN}}` meta tag. In `src/` only add
  the demo mode below (`src/server/demo-client.js` + the `--demo` switch in
  `src/server/index.js` + `demo: true` in `/api/health`); touch nothing else in `src/`
  unless an API bug blocks you — then fix it minimally and say so.
- **Simplicity first.** Vanilla ES modules, no framework, no build step, no npm deps.
- **Security:** never assign unescaped data to `innerHTML`; build DOM with
  `document.createElement`/`textContent` (a tiny `h()` helper is fine). No inline
  scripts or inline event handlers (CSP is `default-src 'self'`). No external URLs.
- **Strings:** every user-visible string comes from `public/i18n/en.json` via `t()`.
  Write complete, plain English in `en.json`. Create `public/i18n/ms.json` with the
  same keys and the **English values copied** — Gemini replaces them with Malay in
  Phase 2b. TV menu names that DESIGN.md says must appear in both languages get their
  own keys (`tvMenu.developerOptions.ms` / `.en` etc.) and are always rendered as
  "**ms** (*en*)". Registry texts: use `entry.label[lang] || entry.label.en`.
- Font: download Plus Jakarta Sans (variable or 400/600/700) woff2 from the official
  repo `https://github.com/tokotype/PlusJakartaSans` (OFL) into `public/fonts/` with
  `OFL.txt`. If download is impossible, fall back to the system stack and say so.

## Behaviour

- Screens exactly as DESIGN.md "Flow". State machine in `app.js`; API calls in
  `api.js` (adds `X-CleanTV-Token` from the meta tag and JSON content-type on POST;
  turns `{ error }` into a thrown error with `code`); SSE via `EventSource` on
  `/api/jobs/:id/events`.
- Unauthorized: poll `POST /api/devices/connect` every 2 s (max 2 min) until `device`.
- Error codes map to friendly i18n messages (one key per code in §5), with a
  "Cuba lagi / Try again" action where it makes sense.
- "Pulihkan semua" uses `POST .../restore { all: true }` after a confirm modal.
- Language toggle `BM | EN` in the header; default `ms`; persisted in localStorage
  inside try/catch; switching re-renders the current screen without losing state.
- Responsive down to 360 px wide; no horizontal scroll.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.

## Tests

`test/public.test.js` (node:test, no browser): `en.json` and `ms.json` have identical
key sets; every `t('...')` key used in `public/js/**` exists in `en.json`; no
`innerHTML =` with a non-literal right side in `public/js/**`; no `http://` or
`https://` URLs in `public/js/**` or `public/css/**`; `index.html` keeps the token
placeholder and has no inline `<script>` body.

## Done when

## Demo mode (needed for visual QA without a TV)

Add `src/server/demo-client.js`: an in-memory object with the same methods as
`createAdbClient` that simulates one Google TV at `192.168.1.50:5555` (brand
`google`, model `Chromecast`, sdk 34, HOME `com.google.android.apps.tv.launcherx`,
installed = every package in `presets/common-android-tv.json` and
`presets/google-tv.json` plus the NEVER_TOUCH core set; `connect` returns
`unauthorized` for the first 2 calls then `device`; disable/enable mutate state with
a 300 ms delay). `node src/server/index.js --demo` uses it, plus a `scan` that
returns that one IP after 1.5 s, and a journal in a temp dir. Add
`"demo": "node src/server/index.js --demo --open"` to package.json. Demo mode prints
a clear "DEMO MODE — no real TV" banner and the UI shows a small "Demo" pill
(when `/api/health` returns `demo: true`).

## Done when

`cmd /c npm test` green and `npm run demo` serves the full flow end to end. The
orchestrator runs visual QA. Report files created, test summary line, and any
DESIGN.md point you could not implement exactly.
