# Automatic capture coordinates — considered, not built

**Status: rejected, 2 September 2026.** Nothing in `src/` implements this. The document is
kept so the question does not have to be researched a second time, and so the reasons are
on record rather than rediscovered.

## The idea

The Where field (`location:`) is typed by hand and completed from the vault's own
vocabulary (B73 — "Teams", "kantoor", "bij de klant"). When the user forgets to fill it,
the fact of *where the note was made* is gone for good. The OS knows it.

The proposal was an opt-in, off-by-default setting that stamps the machine's coordinates
into a new frontmatter field at the moment a note is first written — silent metadata in the
same sense `type:` is (CONSTRAINTS.md:85 — in the format, no UI control): nothing draws it,
nothing completes from it, nothing searches it. Pasting the value into Google Maps would be
the whole retrieval story, so no reverse geocoding and no place-name mapping.

## Why it was rejected

**Too many scenarios in which no trustworthy coordinate can be derived, and no way for the
user to tell which one they are in.**

A feature that is silently absent some of the time, silently coarse some of the time, and
correct the rest of the time is worse than no feature: the user cannot rely on it, and
therefore has to go on filling the Where field by hand anyway — while a field they cannot
see accumulates values they cannot judge. The whole value of the idea was "when the user
forgets, we still have the data", and that promise only holds if the data is dependable.

The specific scenarios:

- **The Mac mini has no GPS.** CoreLocation falls back to Wi-Fi positioning. On Ethernet
  with Wi-Fi off — the normal setup for a desktop machine — it may return nothing at all,
  or an IP-derived fix accurate to kilometres. Half the fleet, in its usual state, is the
  worst case.
- **Windows refuses silently.** With *Settings → Privacy → Location → Let desktop apps
  access your location* off, there is no prompt and no error the user would ever see; the
  field simply never appears.
- **The mac build is ad-hoc signed** (`electron-builder.yml`, `identity: "-"`, no Developer
  ID — see B22). A TCC grant is keyed to the binary, which changes with every release, so
  the permission is liable to be re-prompted or quietly dropped on each update.
- **A coarse fix is a plausible-looking lie.** A 5 km-accurate position rendered to four
  decimals reads exactly like a 10 m one. Guarding against it means discarding fixes, which
  widens the "silently absent" case rather than closing it.
- **Laptop-shaped assumptions do not hold here.** The value of automatic location comes from
  moving between places with a device that can tell. Two mostly-stationary machines, one of
  them wired, is close to the worst hardware this idea could land on.

Weighed against that: the Where field already completes from a handful of repeated values
(B73), which is cheap, reliable, and under the user's control. The gap being filled is
small; the reliability being traded away is not.

**What would change the answer.** Running the `--geo-probe` step described below on both
machines and finding that the platform provider answers promptly with a sub-500 m fix in
their normal configurations. That measurement was never taken — the feature was declined
before any code was written — so this remains an argument from the hardware, not from a
reading. If a laptop ever joins the fleet, the calculation is different for that machine.

---

# The plan as it stood

Kept in full, because the research behind it is the expensive part.

## The two facts that shaped the design

**1. Coordinates without a Google API key are possible, but only via a Chromium feature
flag.** Electron's `navigator.geolocation` defaults to Chromium's *network* location
provider, which is Google's web service and needs a `GOOGLE_API_KEY` with a billing
account. Chromium's `LocationProviderManager` feature switches it to the platform provider
— CoreLocation on macOS, the WinRT `Geolocator` on Windows — which is offline, free, and
keyless. It must be appended to the command line before `app.whenReady()`.

```ts
app.commandLine.appendSwitch(
  "enable-features",
  "LocationProviderManager:LocationProviderManagerMode/PlatformOnly",
);
```

Sources: [electron/electron#8918](https://github.com/electron/electron/issues/8918),
[Electron environment variables](https://www.electronjs.org/docs/latest/api/environment-variables),
[Chromium LocationProviderManager](https://chromium.googlesource.com/chromium/src/+/b5824626d81678853297903a18bc27a125e23bd2%5E!/).

**2. Both target machines are places this can silently fail** — the rejection reasons above.

## The file format

New optional field, written only by the capture path, on the first write of a new note:

```yaml
---
title: Kickoff project Alpha
type: meeting
created: 2026-09-02T14:32:00+02:00
location: Kantoor Amsterdam
coordinates: 52.3702,4.8952
attendees: [Jan de Vries]
---
```

- **Name `coordinates`, not `geo` or `position`.** Obsidian's map plugins claim `location:`
  as `[lat, lng]`; ours is a string and must not collide.
- **One scalar, `lat,lon`, four decimals** (~11 m — a building, not a desk).
  `COORDINATE_DECIMALS = 4` and `MAX_ACCURACY_M = 500` as named constants.
  A negative latitude is quoted by the existing `needsQuotes` rule (leading `-`); still
  pasteable. No accuracy field: one field or none.
- **In `FIELD_ORDER` between `location` and `attendees`** — the two "where" facts adjacent.
- **Stamped once, at first write, never updated.** It records where the note was *captured*.
  `saveNote` already spreads `{ ...previous }`, so editing in the library preserves it; B10
  keeps opening a note from touching the file at all.
- **It never touches `location:`.** The Where field stays the user's, and a note that
  already has one is not second-guessed.

## Files that would change

### The format (`src/markdown/frontmatter.ts`)

Add `coordinates?: string` to `Frontmatter` and `"coordinates"` to `FIELD_ORDER`.
In `parseFrontmatter`, follow the **`pinned` precedent exactly** (frontmatter.ts:186-190):
a value matching our shape is ours; anything else — `coordinates: [52.1, 4.9]` from some
other tool — goes to `extra` and back out unchanged, rather than being stringified into
something we did not understand. A `parseCoordinates` guard belongs beside it.

`serializeFrontmatter` needs no change: `emitScalar` already handles it.

### The rules, Electron-free (`src/main/geo-fix.ts`, new)

The split-in-two pattern the codebase uses everywhere (`remote-image.ts`/`fetch-attachment.ts`,
`update-check.ts`/`updater.ts`, `thumbnail-probe.ts`/`thumbnails.ts`): every decision here,
no I/O, tested directly with no mocks.

- `interface GeoFix { latitude: number; longitude: number; accuracy: number; at: number }`
- `formatCoordinates(fix): string | null` — rounds, rejects `accuracy > MAX_ACCURACY_M`,
  rejects non-finite values, returns `null` for "write nothing".
- `isFresh(fix, now)` — `MAX_FIX_AGE_MS = 15 * 60_000`.
- `parseCoordinates(value: unknown): string | null` — shared with the parser above.

### Getting a fix (`src/main/geolocation.ts`, new — the I/O half)

- `enablePlatformGeolocation()` — the command-line switch above, called at module load in
  `index.ts`, before `app.whenReady()`. Unconditional: the switch alone reads nothing, only
  calling `getCurrentPosition` does.
- `requestFix(): Promise<GeoFix | null>` — runs `navigator.geolocation.getCurrentPosition`
  **inside the existing capture window's `webContents`**, via a small IPC pair
  (`IPC.geoRequest` main→renderer, `IPC.geoFix` renderer→main).
  - Why that window and not a new hidden one: it is always alive, already a secure context
    (`file://` packaged, `localhost` in dev — both potentially trustworthy in Chromium), and
    this avoids a second rollup entry and a second `session`. The renderer cost is ~15 lines
    with no imports, and it never runs on the hotkey→caret path.
  - Options `{ enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }` — Chromium
    does the caching; main keeps only the last successful fix.
- `lastFix()` / `coordinatesNow(): string | null` — the synchronous read the writer uses.
- **A permission handler in main, on the default session.** There is none today, so this is
  new surface: `setPermissionRequestHandler` + `setPermissionCheckHandler` granting
  `geolocation` only while `settings.recordCoordinates` is on, and denying every other
  permission. That matches CONSTRAINTS.md:271's rule — everything the renderer might be
  talked into is decided again in main — and the app needs no other web permission
  (clipboard already goes through main by design, ipc.ts:367). **Verify against the PDF
  window** (`pdf-window.ts`) before landing: it is the one webContents that might want
  `fullscreen` or `pointerLock`. Pin the allowlist with a test.

### When a fix would be requested

No `setInterval` — there is none anywhere in `src/main/`, and the daily update check is a
startup staleness comparison (`index.ts:960`). Three triggers, all cheap:

1. At startup, in the `selfTestRounds === 0` guard beside `watchVault`/`beginStartupScan`
   (`index.ts:711-719`), only when the setting is on. A self-test run must not do this.
2. When the capture window is **shown** — the moment right before every note — scheduled
   after the show handler returns so nothing lands before the caret.
3. When the Settings toggle is switched on, so the OS prompt has visible context.

### Writing it (`src/main/capture-store.ts`)

`CaptureWriter`'s constructor takes injected getters already (`vault: () => string | null`);
add `coordinates: () => string | null` the same way — which is what makes this testable
without mocking Electron.

Add `coordinates: string | null | undefined` to `CaptureSession` (`undefined` = not yet
decided) and resolve it once in `writeSession`, before `buildFrontmatter`. **It must be
stable across a session's writes**: `buildFrontmatter` runs on every debounced write and its
output feeds the `session.lastContent` identity check, so a value that drifted between
keystrokes would make an unchanged note rewrite itself.

`buildFrontmatter` then sets `frontmatter.coordinates` when the resolved value is non-null —
beside the existing `location` block. `beginSession`/`loadSession` reset it to `undefined`;
a session loaded from an existing note delegates to `saveNote` and never stamps one.

### The setting

Follow `keepPinnedInView` end to end — the closest existing boolean:

| Layer | Change |
|---|---|
| `src/main/settings.ts` | `recordCoordinates: boolean` on `Settings`, `false` in `defaults()`, with the doc comment stating why it is per-machine and off |
| `src/shared/ipc.ts` | `IPC.setRecordCoordinates = "app:set-record-coordinates"`, the field on `Bootstrap`, the method on `EmqnoteApi` |
| `src/preload/index.ts` | one `ipcRenderer.invoke` line |
| `src/main/index.ts` | handler in `registerAppIpc()` (~1308) — save, then request a fix when turning on, return whether one arrived |
| `src/renderer/useBootstrap.ts` | `recordCoordinates: false` in `FALLBACK` |
| `src/renderer/library/Settings.tsx` | one `RowSpec` in the **`notes`** group, beside `remoteImages`/`keepPinned` (line ~502): local state, `onChange` → setter → `onChanged()`, plus a line under the row showing the last outcome |
| `src/shared/i18n.ts` | `settings.coordinates` / `settings.coordinatesWhy` (and the outcome strings) in **both** `DUTCH` and `ENGLISH` |

The `Why` sentence must say what is read and that it stays on the machine —
CONSTRAINTS.md:2377's rule that these sentences name the thing plainly. And the row must
report what actually happened: a toggle that says "on" while the OS is refusing is the
failure mode this project keeps writing down (B93's silent `EPERM`).

### Packaging (`electron-builder.yml`)

Add to the existing `mac.extendInfo` beside `LSUIElement`:

```yaml
    NSLocationWhenInUseUsageDescription: >-
      emqnote records where a note was captured, in the note itself. It stays on this
      machine and in your vault.
```

Windows needs nothing at build time.

### A probe (`src/main/geo-probe.ts` + `--geo-probe`, new)

`trash-probe.ts`, `thumbnail-probe.ts` and `key-probe.ts` exist because this project has a
rule about not guessing at platform behaviour. This feature's whole risk is per-machine and
invisible from Linux/jsdom: the probe prints whether the platform provider answered, the
accuracy, and whether the fix would have been written or discarded. Early exit in `main()`
beside the existing probes; listed in `.claude/skills/diagnostics/SKILL.md`.

**This is the piece worth building first if the question is ever reopened** — it settles the
rejection above with a measurement instead of an argument, and it costs almost nothing.

## Documentation that would need to change

- `03-markdown-dialect.md` §2 — the spec. `coordinates` in the example, the field list and
  the fixed order, with the format rule (`lat,lon`, four decimals).
- `05-besluitenlog.md` — the decision proper: why coordinates and not a place name, why a
  new field and not `location:`, why platform-only and no API key, why off by default, and
  what was rejected (network fingerprinting, reverse geocoding).
- `CONSTRAINTS.md` — the field is written in exactly one place, never updated, never
  indexed; a coarse fix is discarded rather than rounded into a lie.
- `CLAUDE.md` — one line in the constraints list pointing at it.
- `TEST-PROTOCOL.md` — the manual pass this needs on each machine, since CI cannot see it.

## Verification that was planned

1. `npm run typecheck` and `npm test`.
2. **Corpus.** `test/corpus/` is the specification: add `coordinates:` to
   `22-alle-frontmatter-velden.md` (which already carries every field) and to
   `24-vergadernotitie.md`, hand-written exactly as the serializer must emit it.
   `test/roundtrip.test.ts` then proves byte-identity both ways. If output and corpus
   disagree, decide which is wrong — do not relax the assertion.
3. **New unit tests**, all mock-free:
   - `test/geo-fix.test.ts` — rounding, the accuracy cut-off, staleness, negative latitudes,
     `parseCoordinates` rejecting an array (→ `extra`).
   - `test/coordinates-frontmatter.test.ts` — field order position, absent stays absent,
     an alien `coordinates:` value round-trips through `extra`.
   - `test/capture-store.test.ts` — written when the injected getter answers, absent when it
     answers `null`, **identical across two writes of one session**, and an existing note
     saved through `saveNote` keeps the value it already had.
   - `test/settings-coordinates.test.ts` — the row is in the `notes` group and findable by
     the head band's search (stand the rail on the group first — CONSTRAINTS.md:2380).
   - A test pinning the permission allowlist.
4. **On a real machine, which is the only place this can be confirmed** — CI and jsdom
   cannot see any of it:
   - `npm run drive:capture` to prove the IPC pair works under a real renderer.
   - `--geo-probe` on the Mac mini (both on Ethernet-only and with Wi-Fi on) and on Windows
     with the privacy toggle both ways.
   - Packaged mac build: confirm the TCC prompt appears once, and whether the grant survives
     a rebuild given ad-hoc signing.
   - Capture a note with the setting off → no `coordinates:`. Turn it on, capture → the
     value appears once and does not change while typing. Reopen in the library, edit, save
     → unchanged. Open in Obsidian → renders as ordinary frontmatter.

## Alternatives considered and rejected earlier

- **OS geolocation with reverse geocoding to a place name.** Would need a Google Cloud API
  key with billing compiled into the build and a network request per note, in an app whose
  only outbound traffic today is the daily update check and pasted remote images.
- **Network fingerprinting** — identifying the network rather than the position, via the
  default gateway's MAC address and the Wi-Fi SSID, mapped to a name learned from the Where
  field. Offline, permission-free on Windows, works on Ethernet, and maps far better onto
  what `location:` actually holds. Rejected as more machinery than the problem justified,
  and because macOS has made SSID reading itself location-gated and unreliable
  ([Apple developer forums](https://developer.apple.com/forums/thread/769950)) on an
  unsigned app.
- **Filling `location:` itself when the Where field was left empty.** Rejected: it would
  make an auto-derived value indistinguishable from a typed one, in the one field the user
  curates by hand.
