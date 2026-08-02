import { readdirSync, readFileSync, type Dirent } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { collectWikiTargets, parseNote } from "../markdown/index.js";
import { ATTACHMENTS } from "./vault.js";

/**
 * Finding attachments nothing points at any more — `02-technisch-ontwerp.md` §6.5's
 * cleanup action. Manual, never automatic: this only ever *reports* a list, and
 * whether to actually delete a file stays a choice made in the UI, one at a time.
 *
 * Wiki targets are matched by name, not path — the same rule `wikiEmbed`/`wikiLink`
 * resolution already follows (`schema.ts`'s own comment: "Obsidian resolves wikilinks
 * vault-wide by name"), and it is why moving a note never breaks its embeds. An
 * attachment nested two folders under `_attachments/2026/07/` is referenced the same
 * way a flat one would be: by its filename alone.
 *
 * Every note counts as a reference, including one already in `_trash/` — a trashed
 * note can still be restored, and an attachment it needs would otherwise be reported
 * as orphaned and cleaned up out from under it. That is the one place this walk
 * deliberately differs from `index-scan.ts`'s `collectFiles`, which excludes the trash
 * because a *deleted* note must not resurface under its tags; a reference is a
 * different question from a listing, and trash answers it differently.
 */

function collectAllFiles(root: string): string[] {
  const files: string[] = [];

  const walk = (absolute: string, depth: number): void => {
    if (depth > 12) return;

    let entries: Dirent[];
    try {
      entries = readdirSync(absolute, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const path = join(absolute, entry.name);
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (entry.isFile()) files.push(path);
    }
  };

  walk(root, 0);
  return files;
}

function collectNoteFiles(vault: string): string[] {
  return collectAllFiles(vault).filter(
    (file) => file.endsWith(".md") && !relative(vault, file).split(sep).includes(ATTACHMENTS),
  );
}

function referencedNames(vault: string): Set<string> {
  const referenced = new Set<string>();

  for (const file of collectNoteFiles(vault)) {
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      continue;
    }

    for (const target of collectWikiTargets(parseNote(raw).doc)) {
      referenced.add(target);
    }
  }

  return referenced;
}

/**
 * Every file under `_attachments/` that no note's `![[…]]`/`[[…]]` names — vault-
 * relative paths, so the caller can show or open them without resolving anything
 * further.
 */
export function findOrphanedAttachments(vault: string): string[] {
  const attachmentsDir = join(vault, ATTACHMENTS);
  const attachmentFiles = collectAllFiles(attachmentsDir);
  const referenced = referencedNames(vault);

  return attachmentFiles
    .filter((file) => !referenced.has(file.split(sep).pop()!))
    .map((file) => relative(vault, file).split(sep).join("/"));
}

const IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

/**
 * The cleanup screen's "miniatuur" (§6.5) for one file, as a data URL the renderer can
 * drop straight into an `<img>` — no thumbnail is actually generated. That is a
 * deliberate scope cut, not an oversight: real resizing (`sharp`) was only ever
 * anticipated for the phase-4 paste pipeline's inline images, and this screen is opened
 * by hand, occasionally, for however many files happen to be orphaned — nowhere near
 * the budget that would make sending a full-size image over IPC worth optimising away.
 * `null` for anything that is not a browser-renderable image type, or that could not be
 * read — the caller shows a generic file entry instead of a preview either way.
 */
export function attachmentPreview(vault: string, attachmentPath: string): string | null {
  const mimeType = IMAGE_MIME_TYPES[extname(attachmentPath).toLowerCase()];
  if (mimeType === undefined) return null;

  try {
    const data = readFileSync(join(vault, attachmentPath));
    return `data:${mimeType};base64,${data.toString("base64")}`;
  } catch {
    return null;
  }
}
