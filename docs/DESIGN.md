# CleanTV-Web — Visual & UX direction (Phase 4a, approved)

Audience: non-technical home users in Malaysia / SEA, usually on a laptop next to the
TV, often nervous about "breaking" the TV. The interface must feel like a calm,
competent friend walking them through it — not a hacker tool.

## Principles

1. **One thing per screen.** A guided, linear flow with a step indicator. Never show
   ADB, package names or terminal output by default.
2. **Safety is visible.** "Pulihkan semua" (Restore all) is reachable on every
   screen after connecting. Protected apps are shown with a lock, framed as a good thing.
3. **Plain words, honest effects.** Every app row says what it is and what you lose.
4. **Calm motion, warm light palette.** No alarm colours except for real errors.

## Flow (screens)

`Sediakan TV` → `Sambung` → `Pilih` → `Bersihkan` → `Siap`

| Screen | Content |
|--------|---------|
| 0. Start / adb check | Logo wordmark "CleanTV", one-line promise ("Jadikan TV anda laju semula, tanpa iklan — dan boleh dipulihkan bila-bila masa"), primary button. If `/health` says adb missing: a card explaining what to do. |
| 1. Sediakan TV | Brand tabs (Google TV · Xiaomi · TCL · Sony · Hisense · Lain-lain). Numbered steps to enable Developer options and USB / Network debugging, each step one line with a small inline SVG icon (settings gear, "tap 7×" counter, toggle). Checkbox "Saya sudah buat" enables Next. |
| 2. Sambung | "Cari TV saya" primary → scanning state (radar-pulse animation, ~5 s) → list of TV cards (TV icon, IP, "Pilih"). Empty state: tips (same Wi-Fi, TV switched on) + manual IP field. After pick, if `unauthorized`: large card with a CSS-drawn mock of the TV's "Allow USB debugging?" dialog, the "Always allow" checkbox and "Allow/Benarkan" button highlighted; poll every 2 s with a quiet spinner; "Cuba lagi" link. |
| 3. Pilih | Header card: brand + model + Android version, "Disambungkan" pill. Summary chips: "N selamat · N pilihan · N dilindungi". Groups by category (Iklan, Telemetri, Aplikasi pra-pasang, Kedai, Pembantu suara, Sistem), each collapsible. Row: checkbox · app label · one-line description · "Kesan: …" in muted text · risk chip · "belum diuji" micro-tag when `verified:false`. Green rows pre-checked, yellow unchecked, protected rows show a lock instead of a checkbox plus the reason on hover/focus. Not-installed rows hidden behind "Tunjuk aplikasi yang tiada". Sticky bottom bar: secondary "Pulihkan semua", primary "Bersihkan N aplikasi". |
| 3b. Confirm | Modal: "Kami akan mematikan N aplikasi. Tiada apa yang dipadam. Anda boleh pulihkan semuanya dengan satu klik." Buttons: "Ya, bersihkan" / "Batal". |
| 4. Bersihkan | Progress card: big percentage, smooth bar, current app label, live result list (✓ dimatikan / ↷ dilangkau + reason / ✕ gagal). `aria-live="polite"`. Note: "Jangan matikan TV". |
| 5. Siap | Summary (done / skipped / failed), tip "Mulakan semula TV untuk kesan penuh", buttons "Kembali ke senarai" and "Pulihkan semua". History link shows the journal. |

## Visual tokens

```css
:root {
  --bg: #FBFAF7;           /* warm paper */
  --surface: #FFFFFF;
  --surface-2: #F3F1EC;
  --ink: #1C1B19;
  --ink-muted: #5F5B53;
  --line: #E4E0D8;
  --primary: #0F6B5C;      /* deep teal: trust, "clean" */
  --primary-ink: #FFFFFF;
  --primary-soft: #E3F1EE;
  --safe: #2E7D4F;   --safe-soft: #E6F3EA;      /* Selamat */
  --optional: #9A6A12; --optional-soft: #FBF1DC; /* Pilihan */
  --protected: #475569; --protected-soft: #EEF1F5; /* Dilindungi (lock) */
  --danger: #B42318; --danger-soft: #FDECEA;   /* real errors only */
  --radius: 14px; --radius-sm: 8px;
  --shadow: 0 1px 2px rgb(28 27 25 / .06), 0 4px 16px rgb(28 27 25 / .06);
  --font: "Plus Jakarta Sans", system-ui, "Segoe UI", sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #141412; --surface: #1C1C19; --surface-2: #24241F; --ink: #F2F0EA;
    --ink-muted: #A8A399; --line: #34332D; --primary: #3FB39C; --primary-ink: #0B1F1B;
    --primary-soft: #16302A; --safe: #5CC08A; --safe-soft: #17291F; --optional: #E0B04F;
    --optional-soft: #2E2615; --protected: #A3B1C4; --protected-soft: #222831;
    --danger: #F2796E; --danger-soft: #331A17;
  }
}
```

- **Type:** Plus Jakarta Sans (designed in Indonesia — fits the region), bundled
  locally as woff2 with its OFL licence (CSP is `default-src 'self'`; app must work
  offline). Scale: 32/24/18/16/14 px; body 16 px, line-height 1.5; weights 400/600/700.
- **Layout:** single column, max-width 760 px, 24 px page gutter (16 px < 480 px wide),
  cards with 24 px padding, 12 px gap between rows. Buttons ≥ 48 px tall.
- **Icons:** inline SVG, 1.75 px stroke, rounded caps, `currentColor`. No icon fonts,
  no images required.
- **Motion:** 160–220 ms ease-out for screen changes (fade + 8 px rise), progress bar
  width transitions, check-mark pop on success. All disabled under
  `prefers-reduced-motion`.
- **Accessibility:** WCAG AA contrast with the tokens above, visible 3 px focus ring
  in `--primary`, full keyboard flow, labels on every control, `aria-live` for
  progress and connection state, risk communicated by text + icon, never colour alone.

## Language (bilingual — owner requirement)

The app is fully bilingual so every user can follow it. Malay is the default;
English toggle in the header (`BM | EN`), remembered in `localStorage` (wrapped in
try/catch). Because the TV's own menus may be in either language, **every TV menu
name in the setup steps is shown in both languages** regardless of the toggle, e.g.
"**Pilihan pembangun** (*Developer options*)", "**Penyahpepijatan USB** (*USB debugging*)".
Same for the TV's permission dialog mock ("Benarkan" / "Allow"). All UI strings live in `public/i18n/en.json`
and `public/i18n/ms.json` (same keys). The builder writes `en.json`; Gemini (Phase 2b)
writes `ms.json` and does a wording/plain-language audit of both files, then a fresh
reviewer checks tone. Registry texts use the
entry's `ms` field with fallback to `en`.

## Front-end structure (no framework, no build)

```
public/index.html          shell + token meta + <main id="app">
public/css/tokens.css      the tokens above
public/css/app.css         components
public/fonts/              Plus Jakarta Sans woff2 + OFL.txt
public/i18n/en.json, ms.json
public/js/app.js           screen state machine + router (hash-less)
public/js/api.js           fetch wrapper (token header, JSON, error shape) + SSE helper
public/js/i18n.js          t(key, vars), language switch
public/js/dom.js           h()/escape helpers — never assign unescaped data to innerHTML
public/js/screens/*.js     one module per screen
public/js/icons.js         inline SVG strings
```
