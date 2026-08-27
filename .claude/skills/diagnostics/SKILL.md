---
name: diagnostics
description: >
  The seven diagnostic helpers for questions this project has learned not to guess at —
  canonical serializer diff, clipboard dump, packaged selftest and latency measurement,
  trash/key/thumbnail probes, and the real-renderer capture drive. Read this before shipping
  a second fix for the same complaint, or when inspecting clipboard, latency, deletion,
  keyboard or PDF-thumbnail behaviour.
---

# Diagnostic helpers

Seven diagnostic helpers exist for questions this project has learned not to guess at — a
reported bug that survives its own fix is a recurring theme here (B57 → B59, B62's Ctrl+Tab,
B71), and each helper below exists because guessing had already had its turn:

```bash
npm run canonical -- test/corpus/24-vergadernotitie.md
```

Shows how the serializer *would* write a file, with a line diff. It exists to let you **judge** a difference, not paper over it: if the corpus differs from the serializer output, one of the two is wrong, and telling those apart is a decision.

```bash
emqnote --dump-clipboard=/tmp/paste-sample
```

Copy something from Outlook or Word first, then run this. Writes `<prefix>.html`/`.txt`/`.png` for whatever formats are on the clipboard and exits. Runs alongside the resident instance (bypasses the single-instance lock, like `--selftest`), so no need to quit the everyday app first.

```bash
emqnote.exe --selftest=50 --vault=%TEMP%\emqnote-proef
```

Runs on the *packaged* app. Measures hotkey → painted caret 50 times, then really types a note and checks a correct file lands in the Inbox. Exits with a status code, so it works in CI. Results go to `%LOCALAPPDATA%\emqnote\` / `~/Library/Application Support/emqnote/` as `selftest-result.json` plus `latency.log`. Other flags: `--library`, `--screenshot=<path>`, `--open-note=<title fragment>`, `--click-button=<label>`. `--click-button` takes a `>`-separated sequence, so `--click-button="Tags>#klantx"` unfolds the tag list and then picks one, and it matches folder and filter rows as well as buttons.

```bash
emqnote --trash-probe="_trash/Alpha"
emqnote --key-probe
emqnote --thumbnail-probe="2026-08-04-1030-offerte.pdf" --vault=/path/to/vault
```

`--trash-probe` says why something in `_trash` will not delete, per entry — read-only, held open by another process — and **deletes nothing**; the evidence is the point on the one operation with no way back. `--key-probe` logs every key a window is handed to `<userData>/key-probe.log`, one line per press, including whether `matches()` claimed it — it does not exit and does not bypass the single-instance lock, so quit the resident app first. `--thumbnail-probe` prints exactly which of four things went wrong for one named attachment's PDF preview. `CONSTRAINTS.md` has the full story behind each.

```bash
npm run drive:capture
npm run drive:capture -- --screenshot=/tmp/capture.png
```

Drives the **capture window** in the real app, under its own `Xvfb`, over CDP. Scaffolds a
throwaway vault, raises the window with the real global hotkey, hands it a note holding a
picture, a table, a three-page PDF and a `#tag`, and checks the nine things only a real
renderer can answer — most of all `naturalWidth`, which is whether the picture actually
*decoded* rather than whether an `<img>` reached the DOM. Four of those nine are the ones
jsdom is barred from by definition: a rectangle of table cells dragged out with a **real
pointer** (B49), whether B51's sixteen-row `/` panel **fits on screen** when the caret is
near the foot of the window, a **real PDF page rendered by pdf.js** into this window (B43),
and **▶ turning to a page that is genuinely a different picture** — counted as dark pixels
off a canvas, because a changed `src` is not a changed page. Exits non-zero on the first failed step and names it. Needs a display,
so deliberately not part of `npm test`. See `scripts/drive-capture.ts`.