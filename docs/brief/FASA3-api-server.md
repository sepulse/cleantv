# Brief — Phase 3: HTTP API + SSE + localhost security

Repo: `D:\Project\Deep\cleantv`. Read `docs/ARCHITECTURE.md` §1, §2, §5 (contract)
and the existing `src/core/*` (Phase 1, done and tested). Contract §5 is the
source of truth for routes, bodies, responses, SSE events and error codes.

## Rules (mandatory)

- **Surgical / in-scope only.** Build exactly what is listed. No frontend beyond a
  placeholder `public/index.html` (one heading + the token meta tag). No new
  features, no config options nobody asked for.
- **Simplicity first.** Minimum code; no single-use abstractions.
- **Zero runtime dependencies — use `node:http`, not Express.** (Decision change
  from ARCHITECTURE D1: keeps the Node SEA single-exe packaging in Phase 6 free of a
  bundler. Update the D1 row in `docs/ARCHITECTURE.md` accordingly — the only doc
  edit allowed.)
- Never write `uninstall`, `pm clear`, `settings put`, `wipe`, `reboot`, `rm `,
  `shell: true` or `exec(` under `src/`. `test/forbidden-commands.test.js` must stay green.

## Files

```
src/server/index.js     createAppServer({ engine, client, journal, scan, publicDir, token }) -> http.Server
                        + main(): locateAdb → createRunner → createAdbClient → createJournal →
                          loadPresets('presets') → createEngine → listen on 127.0.0.1, port from
                          env CLEANTV_PORT or first free of 8765..8775; print URL; `--open` flag opens
                          the browser via execFile (win32: explorer.exe, darwin: open, else xdg-open).
                          If adb is missing, the server still starts; /health reports found:false and
                          device routes return 503 ADB_NOT_FOUND.
src/server/security.js  checkHost, checkMutation (token + JSON content-type + Origin), security headers
src/server/jobs.js      createJobs(): one active job per serial, event buffer + replay, SSE writer
src/server/static.js    serve public/ safely; inject token into index.html
src/server/routes.js    the route table for §5 (a plain object/array + small matcher; no framework)
src/server/http-errors.js  CleanTvError code -> HTTP status
public/index.html       placeholder only: <meta name="cleantv-token" content="{{CLEANTV_TOKEN}}">
test/server.test.js, test/jobs.test.js, test/security.test.js
package.json            add "start": "node src/server/index.js --open"
```

Small, allowed edits to Phase 1 files:
- `src/core/errors.js`: add `INTERNAL`.
- `src/core/engine.js`: (a) before any device work, check `client.devices()` for the
  serial: absent → `DEVICE_UNREACHABLE`, `unauthorized` → `DEVICE_UNAUTHORIZED`,
  `offline` → `DEVICE_OFFLINE`; (b) add `history(serial)` → journal records for that
  device (newest first; empty array if the journal is missing or corrupt).
  Add tests for both.
- `src/core/adb/locate.js`: `CLEANTV_ADB` pointing at a directory is currently
  accepted; it must be a file, else `ADB_NOT_FOUND`. Add a test.

## Behaviour

**Security (ARCHITECTURE D6)**
- Listen on `127.0.0.1` only.
- Every request: `Host` must be exactly `127.0.0.1:<port>` or `localhost:<port>`,
  else `403 FORBIDDEN` (DNS-rebinding guard).
- Every non-GET request: `Content-Type: application/json`, header
  `X-CleanTV-Token` equal to the startup token (`crypto.timingSafeEqual`), and if an
  `Origin` header is present it must be `http://127.0.0.1:<port>` or
  `http://localhost:<port>`; else `403 FORBIDDEN`. Body limit 64 KiB → `413 INVALID_INPUT`.
  Invalid JSON → `400 INVALID_INPUT`.
- Token: `crypto.randomBytes(32).toString('base64url')`, generated per process.
- Headers on every response: `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` on `/api`.

**Static**
- `GET /` and `/index.html` → `public/index.html` with `{{CLEANTV_TOKEN}}` replaced.
- Other files from `public/` only; reject `..`, encoded traversal, absolute paths, and
  anything that resolves outside `publicDir` → 404. Content types for html, css, js,
  svg, png, webp, woff2, json.

**Routes** — exactly §5. `:serial` is URL-decoded then validated with `isValidSerial`.
- `POST /api/discover` → `scan({ signal })` with a 10 s abort.
- `POST /api/devices/connect` → validate IPv4 + port, `client.connect`.
- `GET /api/devices/:serial` → `engine.inspect` → info fields + `presets`.
- `GET /api/devices/:serial/packages` → `engine.inspect(...).packages`.
- `POST .../disable` `{ packages: string[] }` (1–200 items) and `.../restore`
  (`{ packages }` or `{ all: true }`) → `202 { jobId }`; the job runs
  `engine.disable/restore` with `onProgress` feeding SSE.
- `GET /api/devices/:serial/history` → `{ entries }`.
- `GET /api/jobs/:jobId/events` → SSE per §5 (`progress`, `complete`, `error`),
  `retry: 2000`, heartbeat comment every 15 s, replay buffered events for late
  subscribers, close the stream after `complete`/`error`. Unknown job → 404.
- Jobs: second job for a busy serial → `409 DEVICE_BUSY`. Finished jobs are kept 10
  minutes, then dropped.

**Errors** — body `{ error: { code, message } }`. Status map: `INVALID_INPUT` 400,
`FORBIDDEN` 403, `DEVICE_BUSY` 409, `DEVICE_UNAUTHORIZED` 409, `DEVICE_OFFLINE` 409,
`DEVICE_UNREACHABLE` 404, `PACKAGE_PROTECTED` / `PACKAGE_NOT_IN_REGISTRY` /
`PACKAGE_IS_LAUNCHER` 422, `ADB_NOT_FOUND` 503, `TIMEOUT` 504, `COMMAND_FAILED` 502,
anything else → 500 `INTERNAL` with a generic message (log the real error to stderr,
never send stack traces).

## Tests (`node:test`, real server on port 0, global `fetch`, fake engine/client)

Host rejection, missing/wrong token, wrong content-type, foreign Origin, body too large,
bad JSON, path traversal (`/../package.json`, `/%2e%2e/package.json`), token injected in
`/`, every route's happy path, 409 busy, error-code → status mapping, SSE stream
receives progress + complete in order, late subscriber gets replay, engine device-state
mapping (a), engine history (b).

## Done when

`cmd /c npm test` green (paste summary). Report files created/changed and every
spec point you interpreted or could not meet.
