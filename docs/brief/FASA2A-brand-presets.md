# Brief — Phase 2a: brand preset registry

Repo: `D:\Project\Deep\cleantv`. Read `docs/ARCHITECTURE.md` §2 + §4,
`presets/SCHEMA.md`, `presets/common-android-tv.json`, and `src/core/registry.js`
(validator) / `src/core/safety.js` (`NEVER_TOUCH`).

This is **data, not code**, and it is safety-critical: a wrong entry can leave a
non-technical user's TV without a working remote, input, network or home screen.
Precision beats volume.

## Rules (mandatory)

- **Only create** `presets/google-tv.json`, `presets/android-tv.json`,
  `presets/xiaomi.json`, `presets/tcl.json`, `presets/sony.json`,
  `presets/hisense.json`, and add one test in `test/registry.test.js` (see below).
  Do not touch `src/` or `docs/`.
- **Include a package only if you are confident it exists** on that brand's TVs
  and you can cite a real, specific source (official vendor/Google page, XDA thread,
  AOSP/vendor repo, well-known debloat list on GitHub). Search the web if your
  tools allow. If unsure → leave it out. 8–25 entries per preset is plenty.
- Every entry: `verified: false`; `ms` text fields are empty strings (Gemini fills
  them in Phase 2b); `en` texts are plain language for non-technical users (no
  jargon, ≤ 120 chars each). `effect.en` must say what the user loses, honestly.
- **Risk levels — be conservative:**
  - `green`: telemetry, feedback/crash reporters, vendor ad/analytics services,
    promo/demo/store-mode apps, preinstalled games/streaming apps the user can
    reinstall from Play Store.
  - `yellow`: anything with a visible effect the user might want (voice assistant,
    screensaver/ambient, vendor app store, vendor cast/screen-mirroring, vendor
    "smart" features, vendor updater apps).
  - `red` (display-only): every launcher / home app (PatchWall, stock launchers),
    system updater for firmware/OTA, setup wizards, remote/Bluetooth pairing,
    input/TV tuner/HDMI-CEC/TV input framework packages, settings, anything that
    the vendor home screen or remote depends on, and anything you are not sure is
    safe. Listing these as `red` is useful: the UI explains why they are protected.
  - Any package in `NEVER_TOUCH` must be `red` (the validator enforces this).
- `match`: `google-tv.json` → `{ "feature": "google-tv" }`; `android-tv.json` →
  classic Android TV (Leanback launcher) — add a `"feature": "android-tv"` only if
  the validator/matcher already supports it, otherwise use `{ "any": true }` and
  include only packages that are harmless when absent; brand files →
  `{ "brand": [...], "manufacturer": [...] }` with the lowercase values those TVs
  report in `ro.product.brand` / `ro.product.manufacturer` (e.g. Xiaomi: `xiaomi`,
  `mitv`; TCL: `tcl`; Sony: `sony`; Hisense: `hisense`). Cite where you got them.
- Do not duplicate entries that are already in `common-android-tv.json`.
- Category `ads` should be used for packages that serve home-screen
  ads/recommendations. If the ad source is the launcher itself, it is `red` with an
  `effect.en` note "Handled by the launcher-swap step" (Phase 5 deals with it).

## Test to add

In `test/registry.test.js`: load the real `presets/` dir, and assert (a) every
preset validates, (b) no package anywhere is `green`/`yellow` while being in
`NEVER_TOUCH` or starting with `com.android.providers.`, (c) every entry has at
least one `https://` source, (d) no package name contains `launcher` or `setup`
with a risk other than `red`.

## Done when

`cmd /c npm test` green. Report: entries per preset by risk, and a list of every
entry you were least sure about (package + why) so the reviewer can focus there.
