import type { Dirent } from "node:fs";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
} from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { Fragment, Slice, type Node as PMNode } from "prosemirror-model";
import {
  bodyTagsOf,
  cleanTagInput,
  extractTags,
  isBlankTask,
  manualTags,
  mergeTags,
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
import { writeAtomicSync } from "./atomic-write.js";
import { diffText, type DiffLine } from "./diff.js";
import { isoWithOffset, noteFileName, sanitiseFolderName, uniquePath } from "./filename.js";
import { rememberOwnMove, rememberOwnWrite, renameOwnWrite } from "./own-writes.js";
import {
  removeFromTrash,
  type RemovalFailure,
  type RemovalOutcome,
} from "./trash-delete.js";
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

  // Frontmatter first, then whatever the body adds. Since B65 the save path hoists the
  // body's tags into the frontmatter, so for a note this app has written since they are
  // the same set already — this still has to merge, because a note imported or edited
  // elsewhere has not been through that path and its body tags exist nowhere else.
  const tags = mergeTags(frontmatter?.tags ?? [], extractTags(body));

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
    pinned: frontmatter?.pinned === true,
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

    const summary = summariseFile(vault, join(absolute, entry.name));
    if (summary !== null) files.push(summary);
  }

  return files.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * One file, as the note list's file section wants it (B47).
 *
 * Split out of `readFilesIn` because the unlinked-attachment pane draws the very same
 * rows from a completely different question: `findUnlinkedAttachments` answers with paths
 * rather than a `readdir`, and the two lists must not disagree about how a file is
 * described — an unlinked file showing its size in bytes while a folder's file showed kB would
 * be one list pretending to be another.
 *
 * `null` for a file that has gone between being named and being asked about, which on a
 * OneDrive vault is a normal race rather than an error: the caller drops the row.
 */
export function summariseFile(vault: string, file: string): FileSummary | null {
  try {
    const stats = statSync(file);
    return {
      path: toPosix(relative(vault, file)),
      name: basename(file),
      extension: extname(file).toLowerCase(),
      modified: stats.mtime.toISOString(),
      size: stats.size,
    };
  } catch {
    return null;
  }
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

  const raw = readFileSync(file, "utf8");
  const { frontmatter, doc } = parseNote(raw);

  // B65's provenance rule, and the whole reason the two are handed over separately. The
  // tags read off the *file's own body text* rather than off `doc`, which is the same
  // text `summarise` reads and so cannot disagree with it about one note.
  const bodyTags = extractTags(splitNote(raw).body);

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
    // What the header field owns, which is not everything the frontmatter declares: a
    // tag the body also carries belongs to the body, and showing it in the field would
    // make it unremovable. `manualTags` has the argument.
    tags: manualTags(frontmatter.tags ?? [], bodyTags),
    bodyTags,
    doc: doc.toJSON(),
    editable: true,
  };
}

/**
 * The mechanism lives in `atomic-write.ts` now — `.tmp` + `rename()`, with the retry, the
 * unique temporary name and the recovery copy that the incident of 31 August 2026 showed
 * this path needs. What stays here is the one thing that is this module's own business:
 * remembering the bytes, so the watcher's reindex of this exact write — which the rename
 * will trigger — can tell its own echo apart from a real external change (`own-writes.ts`).
 *
 * Deliberately *after* the write rather than before it: a write that threw wrote nothing,
 * and remembering bytes that are not on disk would teach the watcher to ignore the next
 * real change to that file.
 */
function writeAtomic(file: string, contents: string): void {
  writeAtomicSync(file, contents);
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

  const doc = schema.nodeFromJSON(request.doc);

  // Tags apply to both kinds, so they sit outside that branch. Written from the request
  // rather than left to the `...previous` spread, because the reader can now clear them —
  // and a field you can only ever add to is not an editable field.
  //
  // The request carries only what the header field owns; the body's own `#tag`s are
  // hoisted in beside them (B65), which is why deleting a `#tag` from the note removes
  // it from `tags:` on the next save rather than leaving it stranded there. This is the
  // one place besides `capture-store.ts`'s `frontmatterFor` that decides it, and the two
  // must stay identical — see that function's own comment.
  const tags = mergeTags(
    request.tags.map(cleanTagInput).filter((tag) => tag !== ""),
    bodyTagsOf(doc),
  );
  if (tags.length > 0) frontmatter.tags = tags;
  else delete frontmatter.tags;

  const contents = serializeNote({ frontmatter, doc });

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

/**
 * Pins a note to the top of the list, or takes the pin off again (B75).
 *
 * `toggleTask`'s shape and for the same reasons: read, `parseNote`, change one thing,
 * `serializeNote`, `writeAtomic` — never a text substitution on the file (B6), because the
 * serializer is the one thing that knows how frontmatter is spelled, and `writeAtomic`
 * calls `rememberOwnWrite` so the watcher recognises this as the app's own write (B31)
 * rather than flashing a "changed on disk" bar at the user who just clicked Pin.
 *
 * **`modified` is carried through untouched, which is the whole difference from every
 * other write in this file.** A pin is not an edit of the note: bumping `modified` would
 * reorder the very list the pin exists to fix, move the note to the top under the default
 * sort for a reason that has nothing to do with its contents, and tell the other machine
 * that something changed inside it. It is also why this cannot go through `saveNote`.
 *
 * Unpinning removes the key rather than writing `pinned: false`, so a note that has been
 * pinned and unpinned is byte-identical to one that never was.
 */
export function setPinned(vault: string, notePath: string, pinned: boolean): boolean {
  const file = join(vault, notePath);
  if (!existsSync(file)) return false;

  const existing = readFileSync(file, "utf8");
  const note = parseNote(existing);

  const frontmatter = { ...note.frontmatter };
  if (pinned) frontmatter.pinned = true;
  else delete frontmatter.pinned;

  const contents = serializeNote({ frontmatter, doc: note.doc });
  if (contents !== existing) writeAtomic(file, contents);
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
  renameOwnWrite(from, to);
  // The move itself, as opposed to the bytes: `renameOwnWrite` carries a hash across only
  // when this app had recently written this note, and filing a note usually means moving
  // one it has never touched. Without this the watcher's `unlink` at the source is an
  // external deletion and the `add` at the destination an external change (B95).
  rememberOwnMove(from, to);

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
  if (to !== from) {
    renameSync(from, to);
    // `writeAtomic` remembered these bytes under the *old* path a line ago. Without
    // carrying that over, the watcher's `add` at the new name is an external change to a
    // file this app wrote itself — see `own-writes.ts`'s `renameOwnWrite`.
    renameOwnWrite(from, to);
    // And the old name is now a file that has disappeared, which the hash cannot speak
    // for. Same reason as `moveNote`'s call (B95).
    rememberOwnMove(from, to);
  }

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
  // The one mover that recorded nothing at all until B95. The destination is inside
  // `_trash`, which the watcher ignores outright, so only the removal half is ever asked
  // about — but it is asked, and answering "somebody else deleted this" for the app's own
  // Delete is the same falsehood `moveNote` was telling.
  renameOwnWrite(from, to);
  rememberOwnMove(from, to);

  return toPosix(relative(vault, to));
}

/**
 * What is in the trash, for the confirmation that is about to destroy it.
 *
 * Four numbers rather than the one the dialog used to name, and none of them is the
 * number it named: it counted the note *rows on screen*, which come from a single
 * non-recursive `readdir` of `.md` files. So a folder dragged to the trash with forty
 * notes in it counted as nothing, every folder counted as nothing, and an attachment
 * counted as nothing — in front of the one operation in this app that cannot be undone.
 *
 * **Deliberately without `folderContents`' `isHidden` filter**, which is the one line in
 * here worth arguing about. That function skips `_attachments`, `_templates` and dotted
 * names because they are not part of the vault *tree* and a folder chooser should not
 * offer them. The trash is not the tree. Everything in it is going, so everything in it
 * has to be counted, or the dialog understates what the button does — which is the same
 * class of mistake as the count it replaces, made for a tidier reason.
 *
 * It shares that function's depth cap and its per-directory `try`/`catch`: a directory
 * that cannot be read must not take the whole count down with it, and the count is a
 * warning rather than a manifest. `emptyTrash` reports what actually went.
 */
export interface TrashContents {
  notes: number;
  folders: number;
  files: number;
  /**
   * Open task items across every note in there, because a note is not only its own
   * content: what someone actually wants to know before emptying the trash is whether
   * something still to be *done* is about to go with it. Open only — a finished task is
   * a record, and a record leaving with the note it is written in is what deleting the
   * note means.
   */
  openTasks: number;
}

/**
 * The same three counts for *one thing* rather than for the whole trash.
 *
 * The per-item half of the question `trashContents` answers, and it exists for the
 * reason `openTasksAt` exists beside `openTasksIn`: "Delete permanently" is offered on a
 * folder inside the trash as well as on the trash itself, and that question was asked
 * with the folder's name and nothing else in it (§59) — the more destructive of the two
 * deletes, carrying less about what it was destroying than the one that only moves a
 * folder to the trash, which has named both counts since B27.
 *
 * Counts everything, `isHidden` filter and all, for `trashContents`' stated reason: this
 * is asked about a path where everything present is about to go, not about the vault
 * tree. Zero for a path that is not a directory or cannot be read — the counts are a
 * warning in a sentence, and `removeFromTrash` reports what actually went.
 */
export function contentsAt(vault: string, path: string): {
  notes: number;
  folders: number;
  files: number;
} {
  let notes = 0;
  let folders = 0;
  let files = 0;

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
        folders += 1;
        walk(join(directory, entry.name), depth + 1);
      } else if (entry.isFile()) {
        if (isNoteFile(entry.name)) notes += 1;
        else files += 1;
      }
    }
  };

  walk(path === "" ? vault : join(vault, path), 0);
  return { notes, folders, files };
}

/**
 * `contentsAt` over the whole trash, plus the open tasks in it.
 *
 * Two walks where there used to be one, and the second is the cheap one: `openTasksAt`
 * parses every note it finds and this adds a `readdir` sweep beside it. Worth it for
 * having one definition of "what is inside this" that the two delete confirmations
 * share — the alternative is a second copy of a walk whose one interesting line is the
 * comment above about not filtering.
 */
export function trashContents(vault: string): TrashContents {
  return { ...contentsAt(vault, TRASH), openTasks: openTasksAt(vault, TRASH) };
}

/**
 * The open tasks in one note file, or none if it cannot be read or parsed.
 *
 * `taskItemsIn` rather than a regular expression over the raw text, for the reason that
 * function exists at all: it is the one place that decides what counts as a task item,
 * and the index (`extractTasks`) and the toggle (`toggleTask`) both already ask it. A
 * count that disagreed with the number the note list shows for the same note would be
 * worse than no count.
 *
 * It reads and parses every note in the trash, which is the one cost here worth naming.
 * It runs when the confirmation dialog opens and nowhere else, and the trash is small by
 * construction — the same walk is about to permanently delete everything it finds. A
 * file that will not parse counts as zero rather than taking the whole count down: this
 * number is a warning in a sentence, not a manifest, exactly as the counts beside it are.
 */
/**
 * The open tasks in one thing — a note, or a folder and everything under it.
 *
 * The per-item half of the same question `trashContents` answers for the whole trash, and
 * it is asked in the same place: the confirmation in front of a delete. A folder is walked
 * because a folder is exactly the case the whole-trash count exists for — "Delete
 * permanently" on one that holds forty notes says as little about what is going as the
 * note-row count it replaced did.
 *
 * **Nothing here is about `_trash`, and the path is not required to be in it.** Every
 * delete this app offers asks this now, including the two that move something *to* the
 * trash: a note in `_trash` is out of the Tasks view and out of every folder's badge the
 * moment it goes, so "3 open tasks" is as true of trashing a note as of deleting it for
 * good. Restore is the way back from one and not from the other, which is a difference in
 * what the buttons say, not in what the count means.
 *
 * Depth-capped and per-directory `try`/`catch` like every other walk here, and zero for
 * anything that is not a note or cannot be read, for `openTasksIn`'s stated reason.
 */
export function openTasksAt(vault: string, path: string): number {
  const full = join(vault, path);

  let stats;
  try {
    stats = statSync(full);
  } catch {
    return 0;
  }

  if (stats.isFile()) return isNoteFile(full) ? openTasksIn(full) : 0;
  if (!stats.isDirectory()) return 0;

  let open = 0;
  const walk = (directory: string, depth: number): void => {
    if (depth >= 12) return;

    let entries: Dirent[];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) walk(join(directory, entry.name), depth + 1);
      else if (entry.isFile() && isNoteFile(entry.name)) {
        open += openTasksIn(join(directory, entry.name));
      }
    }
  };

  walk(full, 0);
  return open;
}

function openTasksIn(file: string): number {
  try {
    const { doc } = parseNote(readFileSync(file, "utf8"));
    // `isBlankTask` for the reason the comment above gives: this number sits in a sentence
    // beside the ones the index answers (`extractTasks`), and a box with nothing written
    // on it is not counted by either.
    return taskItemsIn(doc).filter(
      ({ node }) => node.attrs.checked === false && !isBlankTask(node),
    ).length;
  } catch {
    return 0;
  }
}

/**
 * What emptying the trash actually managed.
 *
 * `failed` is a count, not an error: one entry that will not go must not stop the ones
 * beside it. `firstFailure` is the other half — a count alone tells someone that
 * something is wrong and nothing about what, which is exactly the position the second
 * report of this bug left everyone in.
 */
export interface TrashEmptied {
  removed: number;
  failed: number;
  firstFailure?: RemovalFailure;
}

/**
 * Permanently deletes everything directly inside the vault's trash folder — files and
 * nested folders alike — and answers how many entries went and how many would not.
 *
 * The first permanent delete the app has ever performed, so it gets a guard that a
 * rename or a move has never needed: `path.resolve` only normalises text, it does not
 * follow anything on disk, so a `_trash` that turned out to be a symlink elsewhere would
 * sail straight through a text-only check while `rmSync` happily deleted whatever the
 * link actually pointed at. `realpathSync` is what actually asks the filesystem, so it
 * is what runs here, on both sides of the comparison, before anything is removed.
 */
export function emptyTrash(vault: string): TrashEmptied {
  const trashDirectory = join(vault, TRASH);
  if (!existsSync(trashDirectory)) return { removed: 0, failed: 0 };

  const realTrash = realpathSync(trashDirectory);
  const realVault = realpathSync(vault);
  if (realTrash !== join(realVault, TRASH)) {
    throw new Error("refusing to empty a path outside the vault's own trash folder");
  }

  const entries = readdirSync(trashDirectory);
  let removed = 0;
  let failed = 0;
  let firstFailure: RemovalFailure | undefined;
  for (const entry of entries) {
    // Counted, never thrown. Stopping at the first entry that will not go would leave the
    // rest of the trash behind on account of one folder, and the caller has something to
    // say either way. The guard above is the failure that still throws: that one means
    // this was never the trash, which is not a thing to carry on past.
    const outcome = removeFromTrash(vault, join(trashDirectory, entry));
    if (outcome.removed) {
      removed += 1;
      continue;
    }
    failed += 1;
    firstFailure ??= outcome.failure;
  }
  return { removed, failed, ...(firstFailure === undefined ? {} : { firstFailure }) };
}

/**
 * Permanently deletes one thing out of the trash — a note, an attachment, or a whole
 * folder with everything under it, `rmSync`'s `recursive` serving all three.
 *
 * It sits here rather than anywhere else in this file because it is `emptyTrash` at a
 * smaller scale, and those two are now the only code in the app that destroys anything
 * (B24). It shares that function's guard exactly, for exactly that reason: `resolve()`
 * only normalises text, so a `_trash` that turned out to be a symlink somewhere else
 * would sail through a text-only check while `rmSync` removed whatever the link really
 * named. `realpathSync` is what actually asks the filesystem, and it runs on both sides.
 *
 * The target is resolved as well as the trash folder, which `emptyTrash` has no need to
 * do — it works on `readdirSync`'s own entries, this one on a path that came over IPC. A
 * symlink *inside* `_trash` is as good a way out of it as a symlinked `_trash` is. What
 * is then removed is the path as given rather than what it resolved to: for anything
 * real those are the same, and for a link inside the trash pointing at another file
 * inside it, removing the link is what was asked for.
 */
export function deleteFromTrash(vault: string, path: string): RemovalOutcome {
  const target = join(vault, path);
  if (!existsSync(target)) return { removed: true };

  const realTrash = join(realpathSync(vault), TRASH);
  if (realpathSync(join(vault, TRASH)) !== realTrash) {
    throw new Error("refusing to delete inside a path outside the vault's own trash folder");
  }

  // `startsWith(realTrash + sep)` and not `realTrash` itself: emptying the trash is
  // `emptyTrash`'s job, and removing the folder rather than its contents would leave the
  // one place every delete in this app writes to missing.
  if (!realpathSync(target).startsWith(realTrash + sep)) {
    throw new Error("refusing to delete a path outside the vault's own trash folder");
  }

  return removeFromTrash(vault, target);
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

/**
 * Creates one folder, and refuses rather than absorbs.
 *
 * `mkdirSync`'s `recursive` flag makes creating a folder that is already there a silent
 * success, and that is what this used to be: typing a name that sanitises onto an
 * existing one — `***` and `???` both arrive as the same string — created nothing, said
 * nothing, and left the tree looking exactly as it had (§57h). `renameFolder` below
 * already refuses the same collision for the reason its own comment gives: for a
 * container an error is the kinder answer, since two folders someone believes are one is
 * how notes end up split across them.
 *
 * `recursive` stays on for the *parent*, which the tree guarantees exists but which a
 * vault edited underneath us may not.
 */
export function createFolder(vault: string, parent: string, name: string): string {
  const clean = sanitiseFolderName(name);
  if (clean === "") throw new Error(FOLDER_ERROR.empty);
  if (isHidden(clean) || clean === TRASH_FOLDER) throw new Error(FOLDER_ERROR.reserved);

  const path = parent === "" ? clean : `${parent}/${clean}`;
  if (existsSync(join(vault, path))) throw new Error(FOLDER_ERROR.exists);

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
 * *before* calling this and rewrites them after, the same ordering `IPC.libraryMoveNotes`
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

/**
 * Moves a folder — and everything inside it — under another parent, answering its new
 * vault-relative path.
 *
 * Restore is the one caller: a folder in `_trash` has nowhere to be *renamed* to, since
 * a rename never changes which parent a folder hangs off, so the only way back out of
 * the trash is a move. `""` for `targetParent` is the vault root, exactly as it is for
 * `moveNote` and for `newNoteFolder`.
 *
 * The refusals reproduce `trashFolder`'s code for code — which reproduce `renameFolder`'s
 * — so the renderer goes on decoding one set through the one `folderErrorOf`, with three
 * differences that are the whole of what this operation is:
 *
 * - the *source* may be inside `_trash`, which is the point of it, though the trash
 *   folder itself may not be moved;
 * - the *destination* may not be, because moving a folder into the trash is
 *   `trashFolder`, and two routes to one act is how the two drift;
 * - a folder cannot move inside itself, the one hazard a rename cannot produce.
 *
 * A name collision is *not* refused here, unlike in `renameFolder`. That function argues
 * that quietly turning "Klant A" into "Klant A (2)" leaves the user with two folders they
 * believe are one — true when they typed the name and expected it to be taken. Here they
 * typed nothing: the folder keeps the name it already had, and the destination happening
 * to hold one of the same name is not a mistake to correct but a collision to survive, the
 * same way `trashFolder` survives one.
 */
export function moveFolder(vault: string, folderPath: string, targetParent: string): string {
  if (folderPath === "") throw new Error(FOLDER_ERROR.root);

  const segments = folderPath.split("/");
  if (folderPath === TRASH_FOLDER || segments.some(isHidden)) {
    throw new Error(FOLDER_ERROR.reserved);
  }

  const parentSegments = targetParent === "" ? [] : targetParent.split("/");
  if (parentSegments[0] === TRASH_FOLDER || parentSegments.some(isHidden)) {
    throw new Error(FOLDER_ERROR.reserved);
  }

  if (targetParent === folderPath || targetParent.startsWith(`${folderPath}/`)) {
    throw new Error(FOLDER_ERROR.intoItself);
  }

  // Already there. `renameFolder` answers the same way for a rename to the name a folder
  // already has, and for the same reason: without this the collision suffix below would
  // turn "move it where it is" into "make it 'Klant X (2)'".
  if (segments.slice(0, -1).join("/") === targetParent) return folderPath;

  const from = join(vault, folderPath);
  const targetDirectory = targetParent === "" ? vault : join(vault, targetParent);

  // Same defence as `renameFolder` and `trashFolder`, on both ends this time: this is the
  // one call that turns two typed strings into a pair of directory locations.
  if (!resolve(from).startsWith(resolve(vault) + sep)) throw new Error(FOLDER_ERROR.outside);
  if (
    resolve(targetDirectory) !== resolve(vault) &&
    !resolve(targetDirectory).startsWith(resolve(vault) + sep)
  ) {
    throw new Error(FOLDER_ERROR.outside);
  }

  if (!existsSync(from)) throw new Error(FOLDER_ERROR.missing);

  mkdirSync(targetDirectory, { recursive: true });

  const to = uniqueFolderPath(targetDirectory, basename(folderPath));
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
