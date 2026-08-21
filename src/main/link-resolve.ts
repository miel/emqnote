import { isNoteFile, noteStem } from "@emqnote/core/note-files";

/**
 * What a `[[…]]` target points at — B35.
 *
 * Free of Electron and of the database, like `search-query.ts` and `conflicts.ts` beside
 * it: the rule for what a link means is worth being able to test directly against a list
 * of notes, without a vault on disk or an index to fill first.
 *
 * **A target is stored as a path, and displayed as an alias.** A link this app writes is
 * `[[01 Projecten/2026-08-05 1030 Rules|Rules]]` — the path is what survives two notes in
 * different folders sharing a title, the alias is what the reader sees. But a vault is a
 * folder of markdown files that other tools also write, and Obsidian's own convention is
 * the bare `[[Rules]]`, so both have to resolve. Hence three stages, tried in order:
 *
 * 1. **Path**, with or without a note extension — the shape this app writes.
 * 2. **Title**, case-insensitively — what a human types, and what Obsidian shows.
 * 3. **Filename stem**, case-insensitively — the same thing for a note whose frontmatter
 *    title has drifted from its filename, and for a file with no frontmatter at all.
 *
 * **A stage that matches does not fall through to the next one, even when it matched
 * several notes.** That is the difference between "ambiguous" and "not found", and
 * collapsing the two would be the wrong kind of helpful: if two notes are genuinely
 * titled `Rules`, silently walking on to compare filename stems would pick a *third*
 * note that merely happens to be filed under that name. Ambiguity is a question for the
 * user (the picker), not something to resolve by trying harder.
 *
 * Path matching is case-*sensitive* while the other two are not, and that asymmetry is
 * deliberate. A path is machine-written — this app composed it, from a filename it also
 * composed — so a case difference there means a genuinely different file on the one
 * platform that would notice (Linux; macOS and Windows would not). A title is typed by a
 * person, who will not reproduce capitalisation faithfully and should not have to.
 */

/** One note the index knows about, as much of it as resolution needs. */
export interface LinkCandidate {
  path: string;
  title: string;
}

export type LinkResolution =
  | { kind: "unique"; path: string }
  /** Two or more notes answer to this target. `paths` is sorted, so the picker's order is stable. */
  | { kind: "ambiguous"; paths: string[] }
  | { kind: "none" };

/**
 * The three lookup tables, built once so that resolving a whole vault's worth of links
 * (which `linkingNotes` does on every move) stays linear rather than quadratic.
 */
export interface LinkIndex {
  byPath: Map<string, string[]>;
  byTitle: Map<string, string[]>;
  byStem: Map<string, string[]>;
}

/** The path a target names, without its extension: `a/b/note.md` and `a/b/note` are one target. */
function pathKey(path: string): string {
  const slash = path.lastIndexOf("/");
  const fileName = slash === -1 ? path : path.slice(slash + 1);
  const stem = isNoteFile(fileName) ? noteStem(fileName) : fileName;
  return slash === -1 ? stem : `${path.slice(0, slash + 1)}${stem}`;
}

function fileStem(path: string): string {
  const slash = path.lastIndexOf("/");
  const fileName = slash === -1 ? path : path.slice(slash + 1);
  return isNoteFile(fileName) ? noteStem(fileName) : fileName;
}

function add(map: Map<string, string[]>, key: string, path: string): void {
  if (key === "") return;
  const existing = map.get(key);
  if (existing === undefined) map.set(key, [path]);
  else if (!existing.includes(path)) existing.push(path);
}

export function buildLinkIndex(candidates: LinkCandidate[]): LinkIndex {
  const index: LinkIndex = { byPath: new Map(), byTitle: new Map(), byStem: new Map() };

  for (const candidate of candidates) {
    add(index.byPath, pathKey(candidate.path), candidate.path);
    add(index.byTitle, candidate.title.trim().toLowerCase(), candidate.path);
    add(index.byStem, fileStem(candidate.path).toLowerCase(), candidate.path);
  }

  return index;
}

/**
 * Normalises what the document actually holds. A hand-written link can carry a leading
 * `/` or `./`, and a heading anchor (`[[Note#Section]]`) or a block reference
 * (`[[Note^id]]`) still names the note it is cut from — neither is understood beyond
 * that, but neither should stop the link from opening the right file.
 */
function normaliseTarget(target: string): string {
  let clean = target.trim().replace(/^\.?\//, "");
  const cut = clean.search(/[#^]/);
  if (cut > 0) clean = clean.slice(0, cut);
  return clean.replace(/\/+$/, "");
}

function answer(paths: string[] | undefined): LinkResolution | null {
  if (paths === undefined || paths.length === 0) return null;
  if (paths.length === 1) return { kind: "unique", path: paths[0]! };
  return { kind: "ambiguous", paths: [...paths].sort() };
}

export function resolveInIndex(index: LinkIndex, target: string): LinkResolution {
  const clean = normaliseTarget(target);
  if (clean === "") return { kind: "none" };

  return (
    answer(index.byPath.get(pathKey(clean))) ??
    answer(index.byTitle.get(clean.toLowerCase())) ??
    answer(index.byStem.get(fileStem(clean).toLowerCase())) ?? { kind: "none" }
  );
}

/** The one-shot form, for a single question. `linkingNotes` builds the index itself instead. */
export function resolveWikiLinkTarget(
  target: string,
  candidates: LinkCandidate[],
): LinkResolution {
  return resolveInIndex(buildLinkIndex(candidates), target);
}

/**
 * The target spelling this app writes for a note: its path without the extension.
 *
 * One function rather than a `replace(/\.md$/, "")` at each call site, because "the
 * extension" stopped being a constant when `.markdown` became readable (B37), and a link
 * target that kept an extension for one note and dropped it for another would resolve
 * fine but read as two different conventions in the file.
 */
export function linkTargetFor(notePath: string): string {
  return pathKey(notePath);
}
