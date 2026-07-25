import type { Dirent } from "node:fs";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { parseNote, schema, serializeNote, type Frontmatter } from "../markdown/index.js";
import type {
  FolderNode,
  NoteSummary,
  OpenedNote,
  SaveNoteRequest,
} from "../shared/vault-types.js";
import { isoWithOffset, noteFileName, uniquePath } from "./filename.js";

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

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function isHidden(name: string): boolean {
  return name.startsWith(".") || HIDDEN_FOLDERS.has(name);
}

function countNotes(directory: string): number {
  try {
    return readdirSync(directory, { withFileTypes: true }).filter(
      (entry) => entry.isFile() && entry.name.endsWith(".md"),
    ).length;
  } catch {
    return 0;
  }
}

export function readFolderTree(vault: string): FolderNode {
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
      noteCount: countNotes(absolute),
    };
  };

  return build(vault, "", 0);
}

/** The first bit of body text, for the note list. */
function excerptOf(markdown: string): string {
  const body = markdown.replace(/^---\n[\s\S]*?\n---\n/, "");
  for (const line of body.split("\n")) {
    const trimmed = line.trim().replace(/^[-*>#\s]+/, "");
    if (trimmed !== "") return trimmed.slice(0, 140);
  }
  return "";
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
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const file = join(absolute, entry.name);
    let raw: string;
    let stats;
    try {
      raw = readFileSync(file, "utf8");
      stats = statSync(file);
    } catch {
      continue;
    }

    const { frontmatter } = parseNote(raw);

    notes.push({
      path: toPosix(relative(vault, file)),
      fileName: entry.name,
      title: frontmatter.title === "" ? entry.name.replace(/\.md$/, "") : frontmatter.title,
      kind: frontmatter.type,
      created: frontmatter.created,
      modified: frontmatter.modified ?? isoWithOffset(stats.mtime),
      attendees: frontmatter.attendees ?? [],
      excerpt: excerptOf(raw),
    });
  }

  return notes;
}

/**
 * Opens a note. Reads only — no write, no touch, not even a `modified` refresh.
 */
export function openNote(vault: string, notePath: string): OpenedNote | null {
  const file = join(vault, notePath);
  if (!existsSync(file)) return null;

  const { frontmatter, doc } = parseNote(readFileSync(file, "utf8"));

  return {
    path: notePath,
    title: frontmatter.title,
    kind: frontmatter.type,
    created: frontmatter.created,
    location: frontmatter.location ?? "",
    attendees: frontmatter.attendees ?? [],
    doc: doc.toJSON(),
  };
}

function writeAtomic(file: string, contents: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, contents, "utf8");
  renameSync(temporary, file);
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

  if (request.kind === "meeting") {
    if (request.location.trim() !== "") frontmatter.location = request.location.trim();
    else delete frontmatter.location;

    const attendees = request.attendees.map((n) => n.trim()).filter((n) => n !== "");
    if (attendees.length > 0) frontmatter.attendees = attendees;
    else delete frontmatter.attendees;
  } else {
    delete frontmatter.location;
    delete frontmatter.attendees;
  }

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
export function renameNote(vault: string, notePath: string, title: string): string {
  const from = join(vault, notePath);
  const raw = readFileSync(from, "utf8");
  const note = parseNote(raw);

  note.frontmatter.title = title;
  note.frontmatter.modified = isoWithOffset(new Date());

  const existingPrefix = /^(\d{4}-\d{2}-\d{2} \d{4}) /.exec(basename(notePath));
  const when = new Date(note.frontmatter.created);
  const fileName =
    existingPrefix === null
      ? noteFileName(title, Number.isNaN(when.getTime()) ? new Date() : when)
      : `${existingPrefix[1]} ${noteFileName(title, new Date()).replace(/^\S+ \d{4} /, "")}`;

  const to = uniquePath(dirname(from), fileName);

  writeAtomic(from, serializeNote(note));
  if (to !== from) renameSync(from, to);

  return toPosix(relative(vault, to));
}

export function createFolder(vault: string, parent: string, name: string): string {
  const clean = name.replace(/[\\/:*?"<>|]/g, "-").trim();
  if (clean === "") throw new Error("A folder needs a name");

  const path = parent === "" ? clean : `${parent}/${clean}`;
  mkdirSync(join(vault, path), { recursive: true });
  return path;
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
