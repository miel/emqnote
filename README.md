# emqnote

A resident note-taking app for Windows and macOS. Notes are plain markdown files
in ordinary folders, on OneDrive or anywhere else. No server, no account.

## Features

- **Global hotkey** opens a capture window with the caret already in it. The app
  stays resident, so it appears in tens of milliseconds.
- **WYSIWYG editor** on a schema that *is* the file format: headings, bold,
  italic, underline, strikethrough, highlight, code, quotes, links, and bullet,
  numbered and task lists that take paragraphs, tables and nested lists under an
  item. Tables can be edited (rows, columns, alignment).
- **Byte-identical round trip.** One serializer writes markdown; opening a note
  never touches the file, and saves are atomic and only when bytes change.
- **Obsidian-compatible `[[wiki links]]`** with a note picker. Moving or
  renaming a note or folder repairs the links that point at it.
- **Attachments.** Paste or insert images, PDFs and Office files; pasted web
  images are downloaded into the vault. PDFs draw and turn pages inline, or open
  in a reader window.
- **Library window** with folder tree, note list and reader: full-text search
  with `tag:` / `attendee:` / `type:` / `after:` / `before:` filters, tag and
  people filtering, an aggregated Tasks view, and new/rename/duplicate/move/
  delete with right-click menus and full keyboard navigation.
- **Sync-aware.** External changes are noticed and reloaded or queried; OneDrive
  conflict copies are detected and resolved from a banner with a diff. Trash is
  a folder in the vault, emptied only on request.
- `.md` and `.markdown` are both read, and a file keeps its own extension.
- Per-user installer with auto-update on Windows; version check on macOS.

## Building

```bash
npm install
npm run dev        # development
npm test           # test suite
npm run pack:mac   # packaged .app in release/
npm run pack:win   # per-user installer in release/
```
