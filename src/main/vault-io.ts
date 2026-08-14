import type { Dirent } from "node:fs";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { Fragment, Slice, type Node as PMNode } from "prosemirror-model";
import {
  cleanTagInput,
  extractTags,
  foldTag,
  parseFrontmatter,
  parseNote,
  schema,
  serializeNote,
  splitNote,
  taskItemsIn,
  taskItemText,
  type Frontmatter,
} from "../markdown/index.js";
import {
  FOLDER_ERROR,
  TRASH_FOLDER,
  type ConflictChoice,
  type ConflictPair,
  type FileSummary,
  type FolderNode,
  type NoteSummary,
  type OpenedNote,
  type SaveNoteRequest,
} from "../shared/vault-types.js";
import { diffText, type DiffLine } from "./diff.js";
import { isoWithOffset, noteFileName, sanitiseFolderName, uniquePath } from "./filename.js";
import { rememberOwnWrite } from "./own-writes.js";
import { isNoteFile, noteExtension, noteStem } from "./note-files.js";

/**
 * Reading and writing the vault for the main window.
 *
 * Deliberately free of Electron, so the rules that matter can be tested directly. The
 * one that matters most is B10: opening a note must not touch the file. An app that
 * rewrites notes just for having looked at them is an app that manufactures OneDrive
 * conflict copies on two machines.
 *
 * There is no index yet — that is phase 5. Everything here reads the filesystem each
 * time, which is fine for browsing and would not be for search.
 */

/** Folders the app owns and the user should not be browsing into. */
const HIDDEN_FOLDERS = new Set(["_attachments", "_templates", "_incoming", ".emqnote"]);

/**
 * `_trash` is deliberately *not* in that set. It is a real folder with real notes in it
 * and has to stay reachable, so it comes along in the tree — the library lifts it out
 * of the children and pins it to the bottom of the panel as "Trash".
 */

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

export function isHidden(name: string): boolean {
  return name.startsWith(".") || HIDDEN_FOLDERS.has(name);
}

function countNotes(directory: string): number {
  try {
    return readdirSync(directory, { withFileTypes: true }).filter(
      (entry) => entry.isFile() && isNoteFile(entry.name),
    ).length;
  } catch {
    return 0;
  }
}

export function readFolderTree(vault: string, excludePath?: string): FolderNode {
  // A note not yet committed by the capture window (see `uncommittedNewPath`) is left
  // out of its own folder's badge too, or the count would disagree with what the note
  // list actually shows for as long as the window stays open.
  const excludeFolder =
    excludePath === undefined ? null : (dirname(excludePath) === "." ? "" : dirname(excludePath));

  const build = (absolute: string, relativePath: string, depth: number): FolderNode => {
    const children: FolderNode[] = [];

    if (depth < 12) {
      let entries: Dirent[] = [];
      try {
        entries = readdirSync(absolute, { withFileTypes: true });
      } catch {
        entries = [];
      }

      for (const entry of entries) {
        if (!entry.isDirectory() || isHidden(entry.name)) continue;
        children.push(
          build(
            join(absolute, entry.name),
            relativePath === "" ? entry.name : `${relativePath}/${entry.name}`,
            depth + 1,
          ),
        );
      }
    }

    children.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    return {
      path: relativePath,
      name: relativePath === "" ? "Vault" : basename(relativePath),
      children,
      noteCount: countNotes(absolute) - (relativePath === excludeFolder ? 1 : 0),
    };
  };

  return build(vault, "", 0);
}

/**
 * The first bit of body text, for the note list.
 *
 * A leading `#` is only stripped when a space follows it, because then it is a heading
 * marker. `#klantx` at the start of the first line is a tag and part of what the note
 * says — stripping it left the excerpt starting mid-sentence.
 */
function excerptOf(body: string): string {
  for (const line of body.split("\n")) {
    const trimmed = line.trim().replace(/^(?:[-*>\s]|#+(?=\s))+/, "");
    if (trimmed !== "") return trimmed.slice(0, 140);
  }
  return "";
}

/**
 * A note's displayed title: what the frontmatter says, or the filename when it says
 * nothing.
 *
 * The fallback is not cosmetic. A `.md` file copied into the vault from somewhere else
 * has no `title:` — often no frontmatter at all — and every such note is still a note
 * with a name, the one on disk. `summarise` has always done this, which is why the note
 * list showed a title; `openNote` did not, which is why opening that same note showed an
 * empty title field and, in the reader, an empty heading. One function now, used by
 * both, so the list and the editor can never disagree about what a note is called again.
 */
export function titleOf(frontmatter: { title: string } | null, fileName: string): string {
  if (frontmatter === null || frontmatter.title === "") return noteStem(fileName);
  return frontmatter.title;
}

/**
 * Everything the note list and the filters need, without building a document.
 *
 * `parseNote` would construct a whole ProseMirror document per file and throw it away
 * again — for a `title` and a date. Splitting the file and parsing only the YAML does the
 * same job 17x faster, measured on the meeting note in the corpus: 1.51 ms against
 * 0.09 ms. Over three thousand notes that is the difference between 4.5 seconds and a
 * quarter of one, which is what makes scanning the whole vault thinkable at all.
 */
export function summarise(vault: string, file: string, raw: string, mtime: Date): NoteSummary {
  const { yaml, body } = splitNote(raw);
  const frontmatter = yaml === "" ? null : parseFrontmatter(yaml);
  const fileName = basename(file);

  const declared = frontmatter?.tags ?? [];
  const seen = new Set(declared.map(foldTag));
  const tags = [...declared];

  // Frontmatter first, then whatever the body adds. The two are never written to each
  // other — see B19 — so this merge is the only place they meet.
  for (const inline of extractTags(body)) {
    if (seen.has(foldTag(inline))) continue;
    seen.add(foldTag(inline));
    tags.push(inline);
  }

  return {
    path: toPosix(relative(vault, file)),
    fileName,
    title: titleOf(frontmatter, fileName),
    kind: frontmatter?.type ?? "quick",
    created: frontmatter?.created ?? "",
    modified: frontmatter?.modified ?? isoWithOffset(mtime),
    attendees: frontmatter?.attendees ?? [],
    tags,
    excerpt: excerptOf(body),
  };
}

export function readNotesIn(vault: string, folder: string): NoteSummary[] {
  const absolute = folder === "" ? vault : join(vault, folder);

  let entries: Dirent[];
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch {
    return [];
  }

  const notes: NoteSummary[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !isNoteFile(entry.name)) continue;

    const file = join(absolute, entry.name);
    try {
      notes.push(summarise(vault, file, readFileSync(file, "utf8"), statSync(file).mtime));
    } catch {
      continue;
    }
  }

  return notes;
}

/**
 * The files in a folder that are not notes — pictures, PDFs, documents (B47).
 *
 * A vault imported from Obsidian keeps its attachments in an ordinary folder beside the
 * notes (`99 - Attachments`, usually), and that folder was browsable and completely
 * empty: `readNotesIn` drops everything `isNoteFile` refuses, so the tree showed the
 * folder with a `0` badge and clicking it said "No notes". Everything needed to *show*
 * those files already existed — `resolveAttachment` resolves any vault-relative path
 * (B38), `emqnote-attachment://` serves it and `emqnote-thumb://` draws a PDF page — and
 * the only missing piece was something to list them.
 *
 * A separate call and a separate type, deliberately, rather than widening `NoteSummary`:
 * sorting, search, drag, move, duplicate, tasks and the conflict check all take a
 * `NoteSummary`, and not one of them means anything for a `.png`. `_attachments` stays
 * hidden and unlistable — it is the app's own folder and has its own screen.
 */
export function readFilesIn(vault: string, folder: string): FileSummary[] {
  const absolute = folder === "" ? vault : join(vault, folder);

  let entries: Dirent[];
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: FileSummary[] = [];

  for (const entry of entries) {
    // A note is the other list's business, and a dotfile is nobody's — `.DS_Store` beside
    // a folder of holiday pictures is not a thing to offer someone.
    if (!entry.isFile() || isNoteFile(entry.name) || isHidden(entry.name)) continue;

    const file = join(absolute, entry.name);
    try {
      const stats = statSync(file);
      files.push({
        path: toPosix(relative(vault, file)),
        name: entry.name,
        extension: extname(entry.name).toLowerCase(),
        modified: stats.mtime.toISOString(),
        size: stats.size,
      });
    } catch {
      continue;
    }
  }

  return files.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Opens a note. Reads only — no write, no touch, not even a `modified` refresh.
 *
 * `editable` always comes back true here: this module knows nothing of the capture
 * window's session. The caller in `index.ts`, which holds that state, overrides it.
 */
export function openNote(vault: string, notePath: string): OpenedNote | null {
  const file = join(vault, notePath);
  if (!existsSync(file)) return null;

  const { frontmatter, doc } = parseNote(readFileSync(file, "utf8"));

  return {
    path: notePath,
    // Both fields fall back the way `summarise` already did for the note list, and for
    // the same reason: a file this app did not write has no `title:` and no `created:`,
    // and showing an empty title and an empty date for it made an imported note look
    // broken in the editor while the list beside it showed the name correctly. The
    // filename is the title it has; the file's own mtime is the only date there is.
    //
    // Reading these costs the file nothing — B10 holds. Neither value is written back
    // until the user actually edits the note, at which point the frontmatter this note
    // never had gets built from what was on screen, which is the honest outcome.
    title: titleOf(frontmatter, basename(notePath)),
    kind: frontmatter.type,
    created: frontmatter.created === "" ? isoWithOffset(statSync(file).mtime) : frontmatter.created,
    location: frontmatter.location ?? "",
    attendees: frontmatter.attendees ?? [],
    tags: frontmatter.tags ?? [],
    doc: doc.toJSON(),
    editable: true,
  };
}

function writeAtomic(file: string, contents: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, contents, "utf8");
  renameSync(temporary, file);
  // So the watcher's reindex of this exact write — which the rename above will trigger —
  // can tell its own echo apart from a real external change. See `own-writes.ts`.
  rememberOwnWrite(file, contents);
}

export interface SaveResult {
  written: boolean;
  path: string;
}

/**
 * Saves an edited note back to its own file.
 *
 * Compares the serialized result with what is on disk and writes nothing when they
 * match. Opening a note, scrolling through it and closing it therefore leaves the file
 * untouched, which is what keeps OneDrive from inventing conflict copies.
 */
export function saveNote(vault: string, request: SaveNoteRequest): SaveResult {
  const file = join(vault, request.path);
  const existing = existsSync(file) ? readFileSync(file, "utf8") : null;

  const previous = existing === null ? null : parseNote(existing).frontmatter;

  const frontmatter: Frontmatter = {
    ...previous,
    title: request.title,
    type: request.kind,
    created: request.created,
    modified: isoWithOffset(new Date()),
  };

  // Location and attendees belong to every note, not only to meetings (B20). This used
  // to delete both when the kind was `quick`, which is why the reader had no way to
  // change the kind at all — the safe direction was the only direction. `type` is now a
  // label, so promoting a note to a meeting changes that one line and nothing else.
  if (request.location.trim() !== "") frontmatter.location = request.location.trim();
  else delete frontmatter.location;

  const attendees = request.attendees.map((n) => n.trim()).filter((n) => n !== "");
  if (attendees.length > 0) frontmatter.attendees = attendees;
  else delete frontmatter.attendees;

  // Tags apply to both kinds, so they sit outside that branch. Written from the request
  // rather than left to the `...previous` spread, because the reader can now clear them —
  // and a field you can only ever add to is not an editable field.
  const tags = request.tags.map(cleanTagInput).filter((tag) => tag !== "");
  if (tags.length > 0) frontmatter.tags = tags;
  else delete frontmatter.tags;

  const contents = serializeNote({
    frontmatter,
    doc: schema.nodeFromJSON(request.doc),
  });

  // `modified` differs on every save, so compare everything else before deciding.
  if (existing !== null && sameApartFromModified(existing, contents)) {
    return { written: false, path: request.path };
  }

  writeAtomic(file, contents);
  return { written: true, path: request.path };
}

function withoutModified(markdown: string): string {
  return markdown.replace(/^modified:.*\n/m, "");
}

function sameApartFromModified(a: string, b: string): boolean {
  return withoutModified(a) === withoutModified(b);
}

/**
 * Ticks or unticks one task item from the aggregated Tasks view.
 *
 * Re-reads and re-parses the file rather than trusting the index that named the item:
 * that index is a cache, filled by a scan or a watcher reindex that can be a save or two
 * behind whatever is actually on disk, and flipping the wrong line in a file the user is
 * not looking at is the one failure mode worth designing against here. `ordinal` counts
 * task items in document order — `taskItemsIn` walks the same way `buildRecord`'s own
 * extraction does (`index-scan.ts`), so the two agree on what "item 3" means. Refuses,
 * returning false, when the item's own text no longer matches `expectedText`: a stale
 * row must lose, never flip a line it no longer describes.
 *
 * Reuses `sameApartFromModified` the same way `saveNote` does: write only when the
 * serialized bytes actually differ (B10). In practice a flip on a *reachable* task item
 * always does — GFM only recognises `[ ]`/`[x]` as a checkbox when something follows it
 * on the line (verified directly: `- [ ] ` with nothing after it parses as the literal
 * text `"[ ]"` on a plain, non-task bullet, never as `checked: false` on an empty one),
 * so every item `taskItemsIn` can find here has non-empty text and its marker's middle
 * character always changes. The guard stays anyway, for the same reason `saveNote` keeps
 * its own: this is a write path, and "compare before writing" costs nothing next to the
 * alternative of a rewritten note if that invariant is ever wrong or the dialect changes.
 */
export function toggleTask(
  vault: string,
  notePath: string,
  ordinal: number,
  expectedText: string,
): boolean {
  const file = join(vault, notePath);
  if (!existsSync(file)) return false;

  const existing = readFileSync(file, "utf8");
  const note = parseNote(existing);

  const item = taskItemsIn(note.doc)[ordinal];
  if (item === undefined || taskItemText(item.node) !== expectedText) return false;

  const flipped = item.node.type.create(
    { ...item.node.attrs, checked: item.node.attrs.checked !== true },
    item.node.content,
    item.node.marks,
  );
  const doc = note.doc.replace(
    item.pos,
    item.pos + item.node.nodeSize,
    new Slice(Fragment.from(flipped), 0, 0),
  );

  const contents = serializeNote({
    frontmatter: { ...note.frontmatter, modified: isoWithOffset(new Date()) },
    doc,
  });

  if (!sameApartFromModified(existing, contents)) writeAtomic(file, contents);
  return true;
}

/** One note to rewrite, and the target spellings in it that name the note that moved. */
export interface LinkRewrite {
  path: string;
  targets: string[];
}

/**
 * Points every `[[…]]` link named by `references` at `newTarget` — B35's half of "a link
 * survives the note it points at being moved or renamed".
 *
 * Through `parseNote` → mutate → `serializeNote` → `writeAtomic`, never a text
 * substitution on the file. B6 is the reason, and it is not ceremonial here: a target can
 * legitimately contain the characters a regex would have to be careful about, `[[` can
 * appear inside a code fence where it is not a link at all, and the serializer is the one
 * thing that knows how a link is spelled. `writeAtomic` already calls `rememberOwnWrite`,
 * so the watcher recognises these as this app's own writes (B31) and the library does not
 * flash a "changed on disk" bar for every note it just repaired.
 *
 * **A link with no alias gets one, spelled with its old target.** `[[Rules]]` displays the
 * word "Rules"; rewritten to `[[01 Projecten/2026-08-05 1030 Rules]]` it would display a
 * path — the note the user is not even looking at would silently change on screen. The old
 * target is exactly what was being displayed, so promoting it to the alias is what keeps
 * the sentence reading the way it was written.
 *
 * Replacements run from the last position backward so that each one leaves the positions
 * of the ones still to come untouched — the same reason `toggleTask` can get away with a
 * single `doc.replace` and this cannot.
 *
 * Returns how many files were actually written. A note in `skip` (in practice the one path
 * the capture window has claimed) is counted as skipped, not rewritten: its session holds
 * a document in memory that the next debounced save will write over anything landing here.
 */
export function rewriteWikiLinks(
  vault: string,
  references: LinkRewrite[],
  newTarget: string,
  skip?: string | null,
): number {
  let written = 0;

  for (const reference of references) {
    if (skip !== undefined && skip !== null && reference.path === skip) continue;

    const file = join(vault, reference.path);
    if (!existsSync(file)) continue;

    const wanted = new Set(reference.targets);
    const existing = readFileSync(file, "utf8");
    const note = parseNote(existing);

    const hits: { pos: number; node: PMNode }[] = [];
    note.doc.descendants((node, pos) => {
      if (node.type.name === "wikiLink" && wanted.has(node.attrs.target as string)) {
        hits.push({ pos, node });
      }
      return true;
    });
    if (hits.length === 0) continue;

    let doc = note.doc;
    for (const hit of hits.reverse()) {
      const replacement = hit.node.type.create(
        {
          target: newTarget,
          alias: (hit.node.attrs.alias as string | null) ?? (hit.node.attrs.target as string),
        },
        hit.node.content,
        hit.node.marks,
      );
      doc = doc.replace(
        hit.pos,
        hit.pos + hit.node.nodeSize,
        new Slice(Fragment.from(replacement), 0, 0),
      );
    }

    const contents = serializeNote({
      frontmatter: { ...note.frontmatter, modified: isoWithOffset(new Date()) },
      doc,
    });

    if (!sameApartFromModified(existing, contents)) {
      writeAtomic(file, contents);
      written += 1;
    }
  }

  return written;
}

/**
 * Repoints every `[[…]]`/`![[…]]` target that starts with `from/` at `to/` instead — the
 * other half of a folder rename (B45), and the half `rewriteWikiLinks` above cannot do.
 *
 * Two things separate this from that function, and both are the reason it exists rather
 * than being folded in:
 *
 * - **It rewrites `wikiEmbed` as well as `wikiLink`.** An embed is how a picture is
 *   written, its files move when their folder is renamed, and nothing in the app touched
 *   them before: a note full of `![[99 - Attachments/foto.png]]` came back full of
 *   missing-file markers. That is the bug this was written for.
 * - **It swaps a path prefix rather than replacing a whole target.** `rewriteWikiLinks`
 *   points a set of known spellings at one new target, which is what a single note moving
 *   needs; a folder rename moves many files at once, each keeping its own name under a new
 *   parent, and that is arithmetic on the string rather than a lookup.
 *
 * **No alias is touched, and none is invented.** B35 promotes a bare target to an alias
 * because a title-form link rewritten to a path would silently start displaying a path.
 * Nothing of the sort happens here: an embed has no alias at all, and a link whose target
 * already was a path keeps displaying exactly what it displayed before.
 *
 * Through `parseNote` → mutate → `serializeNote` → `writeAtomic` like every other write
 * (B6) — never a text substitution, since `[[` inside a code fence is not a link and the
 * serializer is the one thing that knows how one is spelled. Returns how many files were
 * actually written; a note in `skip` (the path the capture window has claimed) is left
 * alone, its in-memory document being about to be written over anything landing here.
 */
export function rewriteTargetPrefix(
  vault: string,
  notePaths: string[],
  from: string,
  to: string,
  skip?: string | null,
): number {
  if (from === to || from === "") return 0;

  const prefix = `${from}/`;
  let written = 0;

  for (const notePath of notePaths) {
    if (skip !== undefined && skip !== null && notePath === skip) continue;

    const file = join(vault, notePath);
    if (!existsSync(file)) continue;

    const existing = readFileSync(file, "utf8");
    const note = parseNote(existing);

    const hits: { pos: number; node: PMNode }[] = [];
    note.doc.descendants((node, pos) => {
      const isReference = node.type.name === "wikiEmbed" || node.type.name === "wikiLink";
      if (isReference && (node.attrs.target as string).startsWith(prefix)) {
        hits.push({ pos, node });
      }
      return true;
    });
    if (hits.length === 0) continue;

    // Backwards, so each replacement leaves the positions of the ones still to come
    // untouched — the same reason `rewriteWikiLinks` reverses its own list.
    let doc = note.doc;
    for (const hit of hits.reverse()) {
      const target = hit.node.attrs.target as string;
      const replacement = hit.node.type.create(
        { ...hit.node.attrs, target: `${to}/${target.slice(prefix.length)}` },
        hit.node.content,
        hit.node.marks,
      );
      doc = doc.replace(
        hit.pos,
        hit.pos + hit.node.nodeSize,
        new Slice(Fragment.from(replacement), 0, 0),
      );
    }

    const contents = serializeNote({
      frontmatter: { ...note.frontmatter, modified: isoWithOffset(new Date()) },
      doc,
    });

    if (!sameApartFromModified(existing, contents)) {
      writeAtomic(file, contents);
      written += 1;
    }
  }

  return written;
}

/** Moves a note to another folder, without ever overwriting what is already there. */
export function moveNote(vault: string, notePath: string, targetFolder: string): string {
  const from = join(vault, notePath);
  const targetDirectory = targetFolder === "" ? vault : join(vault, targetFolder);
  mkdirSync(targetDirectory, { recursive: true });

  const to = uniquePath(targetDirectory, basename(notePath));
  renameSync(from, to);

  return toPosix(relative(vault, to));
}

/**
 * Renames a note: the title in the frontmatter and the file name both follow.
 *
 * The timestamp prefix is kept, because it is what makes the Inbox sort chronologically
 * and it records when the note was taken rather than when it was last renamed.
 */
/**
 * The filename a note takes when its title changes — shared by `renameNote` and
 * `duplicateNote`, which composed it identically and would otherwise have to be fixed
 * twice for every rule that lands here.
 *
 * The timestamp prefix a note already has is kept rather than recomputed: it records
 * when the note was written, and a rename is not a new note. Only when there is no such
 * prefix — an imported file, named by whoever made it — does the note's own `created`
 * supply one, falling back to now if that is unreadable too.
 *
 * The extension is the file's own, never `noteFileName`'s `.md`. Renaming
 * `aantekening.markdown` must not quietly turn it into a different file on disk; the
 * stem is the app's to compose, the extension belongs to the file.
 */
function renamedFileName(notePath: string, title: string, created: string): string {
  const existingPrefix = /^(\d{4}-\d{2}-\d{2} \d{4}) /.exec(basename(notePath));
  const when = new Date(created);
  const built =
    existingPrefix === null
      ? noteFileName(title, Number.isNaN(when.getTime()) ? new Date() : when)
      : `${existingPrefix[1]} ${noteFileName(title, new Date()).replace(/^\S+ \d{4} /, "")}`;

  const extension = noteExtension(basename(notePath));
  return extension === "" ? built : `${noteStem(built)}${extension}`;
}

export function renameNote(vault: string, notePath: string, title: string): string {
  const from = join(vault, notePath);
  const raw = readFileSync(from, "utf8");
  const note = parseNote(raw);

  note.frontmatter.title = title;
  note.frontmatter.modified = isoWithOffset(new Date());

  const fileName = renamedFileName(notePath, title, note.frontmatter.created);

  const to = uniquePath(dirname(from), fileName);

  writeAtomic(from, serializeNote(note));
  if (to !== from) renameSync(from, to);

  return toPosix(relative(vault, to));
}

/**
 * Duplicates a note beside itself, with `-copy` appended to the title.
 *
 * Modelled on `renameNote`, but the source file is never touched: only the copy is
 * written. `copyFileSync` is deliberately not used here — B6 puts markdown in exactly
 * one place, and the copy needs a new title in its frontmatter anyway, which means
 * going through `parseNote`/`serializeNote` like every other write.
 */
export function duplicateNote(vault: string, notePath: string): string {
  const from = join(vault, notePath);
  const raw = readFileSync(from, "utf8");
  const note = parseNote(raw);

  const title = `${note.frontmatter.title}-copy`;
  note.frontmatter.title = title;
  note.frontmatter.modified = isoWithOffset(new Date());

  const fileName = renamedFileName(notePath, title, note.frontmatter.created);

  const to = uniquePath(dirname(from), fileName);

  writeAtomic(to, serializeNote(note));

  return toPosix(relative(vault, to));
}

export const TRASH = TRASH_FOLDER;

/**
 * Moves a note to the vault's own trash folder rather than the system one.
 *
 * The system trash is the wrong place for a file inside a OneDrive folder: on Windows
 * it lands in a per-drive recycle bin that OneDrive does not sync, so a note deleted on
 * one machine is unrecoverable from the other. A `_trash` folder travels with the vault
 * and can be emptied by hand whenever.
 */
export function trashNote(vault: string, notePath: string): string {
  const from = join(vault, notePath);
  const trashDirectory = join(vault, TRASH);
  mkdirSync(trashDirectory, { recursive: true });

  const to = uniquePath(trashDirectory, basename(notePath));
  renameSync(from, to);

  return toPosix(relative(vault, to));
}

/**
 * Permanently deletes everything directly inside the vault's trash folder — files and
 * nested folders alike — and answers how many entries were removed.
 *
 * The first permanent delete the app has ever performed, so it gets a guard that a
 * rename or a move has never needed: `path.resolve` only normalises text, it does not
 * follow anything on disk, so a `_trash` that turned out to be a symlink elsewhere would
 * sail straight through a text-only check while `rmSync` happily deleted whatever the
 * link actually pointed at. `realpathSync` is what actually asks the filesystem, so it
 * is what runs here, on both sides of the comparison, before anything is removed.
 */
export function emptyTrash(vault: string): number {
  const trashDirectory = join(vault, TRASH);
  if (!existsSync(trashDirectory)) return 0;

  const realTrash = realpathSync(trashDirectory);
  const realVault = realpathSync(vault);
  if (realTrash !== join(realVault, TRASH)) {
    throw new Error("refusing to empty a path outside the vault's own trash folder");
  }

  const entries = readdirSync(trashDirectory);
  for (const entry of entries) {
    rmSync(join(trashDirectory, entry), { recursive: true, force: true });
  }
  return entries.length;
}

/**
 * `uniquePath`'s own collision suffix is hardcoded to `.md` — exactly right for a note,
 * silently wrong for anything else: a colliding `photo.png` would come back
 * `photo (2).md`, an image quietly turned into a markdown file by its own trash
 * operation. `uniqueAttachmentPath` and `uniqueFolderPath` below both need a collision
 * suffix that respects what the path actually is, so the counting loop lives here once.
 */
function withCollisionSuffix(directory: string, base: string, extension: string): string {
  const candidate = join(directory, `${base}${extension}`);
  if (!existsSync(candidate)) return candidate;

  for (let counter = 2; counter < 1000; counter += 1) {
    const next = join(directory, `${base} (${counter})${extension}`);
    if (!existsSync(next)) return next;
  }

  return join(directory, `${base} (${Date.now()})${extension}`);
}

/** For one file under `_attachments/` — keeps the real extension on a collision. */
function uniqueAttachmentPath(directory: string, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const base = dot === -1 ? fileName : fileName.slice(0, dot);
  const extension = dot === -1 ? "" : fileName.slice(dot);
  return withCollisionSuffix(directory, base, extension);
}

/**
 * For a whole folder moved into trash. No extension to peel off — a dot in a folder's
 * own name (`"Klant 2.0"`) is part of the name, not something `uniqueAttachmentPath`'s
 * splitting would be right to cut from it.
 */
function uniqueFolderPath(directory: string, folderName: string): string {
  return withCollisionSuffix(directory, folderName, "");
}

/** Same reasoning as `trashNote`, for one file under `_attachments/` — §6.5's manual, explicit cleanup, never automatic. */
export function trashAttachment(vault: string, attachmentPath: string): string {
  const from = join(vault, attachmentPath);
  const trashDirectory = join(vault, TRASH);
  mkdirSync(trashDirectory, { recursive: true });

  const to = uniqueAttachmentPath(trashDirectory, basename(attachmentPath));
  renameSync(from, to);

  return toPosix(relative(vault, to));
}

/** The conflict banner's own line-by-line diff — reads both files fresh, never cached, since either can change out from under it while the banner is open. */
export function diffConflict(
  vault: string,
  pair: { original: string; conflict: string },
): DiffLine[] {
  const original = readFileSync(join(vault, pair.original), "utf8");
  const conflict = readFileSync(join(vault, pair.conflict), "utf8");
  return diffText(original, conflict);
}

/**
 * Carries out one of the three choices `02-technisch-ontwerp.md` §5.2 offers for a
 * OneDrive conflict: `keepOriginal` trashes the conflict copy and leaves the original
 * exactly where it was; `keepConflict` trashes the original — through the same
 * `trashNote` a manual delete uses, never a permanent unlink, because this is still
 * overwriting a note's canonical path — and renames the conflict copy into its place.
 * There is no third branch here for "merge": that choice does not touch either file at
 * all, so the renderer never calls this for it. See `ConflictBanner.tsx`.
 */
export function resolveConflict(
  vault: string,
  pair: ConflictPair,
  choice: ConflictChoice,
): void {
  if (choice === "keepOriginal") {
    trashNote(vault, pair.conflict);
    return;
  }

  trashNote(vault, pair.original);
  renameSync(join(vault, pair.conflict), join(vault, pair.original));
}

export function createFolder(vault: string, parent: string, name: string): string {
  const clean = sanitiseFolderName(name);
  if (clean === "") throw new Error(FOLDER_ERROR.empty);

  const path = parent === "" ? clean : `${parent}/${clean}`;
  mkdirSync(join(vault, path), { recursive: true });
  return path;
}

/**
 * Renames a folder in place, keeping it where it is in the tree.
 *
 * It refuses rather than corrects. `uniquePath` is deliberately not reused here: for a
 * note, quietly becoming "Notitie (2)" beats losing it, but silently turning "Klant A"
 * into "Klant A (2)" leaves the user with two folders they believe are one, and files
 * accumulating in whichever they click next. For a container an error is the kinder
 * answer.
 *
 * **The links into it are repaired, but not here** (B44). This moves a directory and
 * nothing else; `IPC.libraryRenameFolder` asks the index which notes link into the folder
 * *before* calling this and rewrites them after, the same ordering `IPC.libraryMoveNote`
 * uses for one note — a target resolves against where a note is now, so once the folder
 * has moved there is nothing left to find. This comment used to say that nothing inside
 * needed rewriting, because a wikilink carried a bare name rather than a path. That
 * stopped being true at B35, and the sentence is what kept the breakage invisible.
 */
export function renameFolder(vault: string, folderPath: string, name: string): string {
  if (folderPath === "") throw new Error(FOLDER_ERROR.root);

  const segments = folderPath.split("/");
  if (segments[0] === TRASH_FOLDER || segments.some(isHidden)) {
    throw new Error(FOLDER_ERROR.reserved);
  }

  const clean = sanitiseFolderName(name);
  if (clean === "") throw new Error(FOLDER_ERROR.empty);
  if (isHidden(clean) || clean === TRASH_FOLDER) throw new Error(FOLDER_ERROR.reserved);

  const parent = segments.slice(0, -1).join("/");
  const target = parent === "" ? clean : `${parent}/${clean}`;
  if (target === folderPath) return folderPath;

  const from = join(vault, folderPath);
  const to = join(vault, target);

  // Sanitising already takes `..` apart, but the check is on the *resolved* path all
  // the same: this is the one call that turns a typed string into a directory location.
  if (!resolve(to).startsWith(resolve(vault) + sep)) throw new Error(FOLDER_ERROR.outside);

  if (!existsSync(from)) throw new Error(FOLDER_ERROR.missing);

  // On macOS and Windows "Klant a" already exists as "Klant A", so a change of case
  // alone would otherwise refuse itself.
  const caseOnly = target.toLowerCase() === folderPath.toLowerCase();
  if (!caseOnly && existsSync(to)) throw new Error(FOLDER_ERROR.exists);

  renameSync(from, to);
  return target;
}

/**
 * Notes and subfolders anywhere inside a folder, for a delete confirmation to name
 * before it commits to anything. The app's own folders are never browsed into and so
 * never counted, the same rule `readFolderTree` follows — and the same depth limit,
 * for the same reason: a pathological symlink loop should not hang a click.
 */
export function folderContents(
  vault: string,
  folderPath: string,
): { notes: number; folders: number } {
  const absolute = folderPath === "" ? vault : join(vault, folderPath);
  let notes = 0;
  let folders = 0;

  const walk = (directory: string, depth: number): void => {
    if (depth >= 12) return;

    let entries: Dirent[];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (isHidden(entry.name)) continue;
        folders += 1;
        walk(join(directory, entry.name), depth + 1);
      } else if (entry.isFile() && isNoteFile(entry.name)) {
        notes += 1;
      }
    }
  };

  walk(absolute, 0);
  return { notes, folders };
}

/**
 * Moves a folder — and everything inside it — into the vault's own trash, the same
 * rename `trashNote` uses for one file. Never `rmSync`: `emptyTrash` stays the only
 * code in the app that permanently deletes anything (B24).
 *
 * Mirrors `renameFolder`'s validation idiom exactly, refusal for refusal — the two
 * operations share the same hazards (the root, the app's own folders, a path that
 * would resolve outside the vault) and so the same codes, which is what lets the
 * renderer decode both through the one `folderErrorOf`.
 */
export function trashFolder(vault: string, folderPath: string): string {
  if (folderPath === "") throw new Error(FOLDER_ERROR.root);

  const segments = folderPath.split("/");
  if (segments[0] === TRASH_FOLDER || segments.some(isHidden)) {
    throw new Error(FOLDER_ERROR.reserved);
  }

  const from = join(vault, folderPath);

  // Same defense as `renameFolder`: there is no typed name here for sanitising to have
  // already taken apart, but the resolved-path check costs nothing and catches
  // anything the segment check above did not.
  if (!resolve(from).startsWith(resolve(vault) + sep)) throw new Error(FOLDER_ERROR.outside);

  if (!existsSync(from)) throw new Error(FOLDER_ERROR.missing);

  const trashDirectory = join(vault, TRASH);
  mkdirSync(trashDirectory, { recursive: true });

  const to = uniqueFolderPath(trashDirectory, basename(folderPath));
  renameSync(from, to);

  return toPosix(relative(vault, to));
}

/** Every folder in the vault as a flat list, for the "move to…" search. */
export function flattenFolders(tree: FolderNode): string[] {
  const paths: string[] = [];

  const walk = (node: FolderNode): void => {
    paths.push(node.path);
    for (const child of node.children) walk(child);
  };

  walk(tree);
  return paths;
}
