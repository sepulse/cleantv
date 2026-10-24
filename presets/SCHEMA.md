# Preset format

Each JSON file contains one object with an `id`, a `match` object, and a
`packages` array. The loader validates every JSON file before returning presets.

`match` accepts `{ "any": true }` for all devices, or `brand` and/or
`manufacturer` arrays and/or `feature: "google-tv"`. Array values are alternatives;
when several fields are supplied, all must match. Brand and manufacturer matching
is case-insensitive. Google TV means the Google TV launcher package is installed.

Each package entry has these fields:

| Field | Meaning |
| --- | --- |
| `package` | Android package name, at most 255 characters, unique within this preset. |
| `risk` | `green` (low impact), `yellow` (optional, with explained effects), or `red` (display only). |
| `category` | `ads`, `telemetry`, `bloat`, `store`, `launcher`, `assistant`, or `system`. |
| `label`, `description`, `effect` | Objects containing non-empty English `en` text and an `ms` string. Leave `ms` empty until translation. |
| `sources` | Non-empty array of HTTP(S) source URLs supporting identification or behavior. |
| `verified` | Boolean; `true` only after testing on a real TV. |

Example entry:

```json
{
  "package": "com.google.android.youtube.tvmusic",
  "risk": "yellow",
  "category": "bloat",
  "label": { "en": "YouTube Music", "ms": "" },
  "description": { "en": "YouTube Music app for TVs.", "ms": "" },
  "effect": { "en": "The YouTube Music TV app becomes unavailable until restored.", "ms": "" },
  "sources": ["https://play.google.com/store/apps/details?id=com.google.android.youtube.tvmusic"],
  "verified": false
}
```

Core protected packages and every `com.android.providers.*` package must be `red`.
The hard-coded protections and current HOME package protection apply even if a
preset is wrong. Across matching presets, the strictest risk wins:
`red` > `yellow` > `green`; equal risks retain the first entry.

The common preset contains optional apps shipped on some stock Android TV / Google
TV devices. Availability varies; absent packages are shown as not installed.
Official publisher listings identify the apps and their functions. They do not
certify debloating safety on every firmware: the effects of disabling the apps
are inferred from those functions and remain unverified on a TV. All common
entries are yellow because disabling them removes functionality the user may use.
