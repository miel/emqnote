import { readdir, readFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join, relative, sep } from "node:path";
import { collectWikiTargets, parseNote } from "../markdown/index.js";
import { TRASH_FOLDER } from "../shared/vault-types.js";
import { ATTACHMENTS } from "./vault.js";
import { isHidden } from "./vault-io.js";
import { isNoteFile } from "./note-files.js";

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
 * as unlinked and cleaned up out from under it. That is the one place this walk
 * deliberately differs from `index-scan.ts`'s `collectFiles`, which excludes the trash
 * because a *deleted* note must not resurface under its tags; a reference is a
 * different question from a listing, and trash answers it differently.
 *
 * **The reference set comes from the index when there is one** (14 August 2026). This
 * used to walk the whole vault and `readFileSync` + `parseNote` every note in it,
 * synchronously, inside the `ipcMain.handle` — so the main process stopped for the whole
 * scan, and on a OneDrive Files On-Demand vault each of those reads could block on a
 * network hydration with nothing on screen but "Looking…". `note_links` already holds
 * exactly this set for every live note (B45 put `![[…]]` embeds in it beside the links),
 * so the caller passes it in and only the trash still has to be read. The walk survives
 * as the fallback for a vault with no index open yet, and is `fs/promises` now either
 * way — a scan the user is watching may take a while, but it must not take the app with
 * it.
 */

/**
 * Every file under `root`, skipping the folders the app owns.
 *
 * `keepHidden` is for the `_attachments` listing itself: that root *is* one of those
 * folders, and a subfolder inside it that happens to share a name with another would
 * otherwise go unlisted and so never be reported as unlinked.
 */
async function collectFiles(root: string, keepHidden = false): Promise<string[]> {
  const files: string[] = [];

  const walk = async (absolute: string, depth: number): Promise<void> => {
    if (depth > 12) return;

    let entries: Dirent[];
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const path = join(absolute, entry.name);
      if (entry.isDirectory()) {
        // `.git`, `.emqnote`, `_templates`, `_incoming`: the old walk descended into all
        // of them to depth 12 and read every note it found. Only `_attachments` was
        // filtered, and only afterwards.
        if (!keepHidden && isHidden(entry.name)) continue;
        await walk(path, depth + 1);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  };

  await walk(root, 0);
  return files;
}

/**
 * The `[[…]]` and `![[…]]` targets of every note under `root`.
 *
 * `_trash` needs no exemption from `isHidden`: it is deliberately not in
 * `HIDDEN_FOLDERS` (see `vault-io.ts`'s comment on why), because it holds real notes that
 * have to stay reachable. So the whole-vault walk reaches the trash while still skipping
 * `_templates`, `_incoming`, `_attachments` and every dot-folder — which the old walk did
 * not, and which is why a template naming a picture used to count as a reference to it.
 */
async function targetsUnder(root: string): Promise<string[]> {
  const targets: string[] = [];

  for (const file of await collectFiles(root)) {
    if (!isNoteFile(file)) continue;

    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch {
      continue;
    }

    targets.push(...collectWikiTargets(parseNote(raw).doc));
  }

  return targets;
}

/**
 * Every file under `_attachments/` that no note's `![[…]]`/`[[…]]` names — vault-
 * relative paths, so the caller can show or open them without resolving anything
 * further.
 *
 * `indexed` is every target the index knows, which is every target of every note outside
 * the trash. Leave it out and the whole vault is read instead, which is what happens
 * before the first scan has finished.
 */
export async function findUnlinkedAttachments(
  vault: string,
  indexed?: Iterable<string>,
): Promise<string[]> {
  const referenced = new Set<string>(indexed ?? []);

  if (indexed === undefined) {
    for (const target of await targetsUnder(vault)) referenced.add(target);
  } else {
    // The one thing the index cannot answer: `index-scan.ts` leaves the trash out on
    // purpose, and this question counts a trashed note as a reference on purpose. Both
    // are right, so the trash is read here and nowhere else.
    for (const target of await targetsUnder(join(vault, TRASH_FOLDER))) {
      referenced.add(target);
    }
  }

  const attachmentFiles = await collectFiles(join(vault, ATTACHMENTS), true);

  // Both spellings count as a reference, because both are real: this app's own insertion
  // writes a bare `![[foto.png]]`, while **Copy link** on a file row writes the path form
  // `![[_attachments/2026/07/foto.png]]` (`isEmbeddableAttachment`'s own spelling), and a
  // vault written elsewhere is full of the path form too (B38). Matching the name alone
  // meant a picture linked with the app's own Copy link went on being listed here as
  // unlinked — an offer to delete a file a note is drawing.
  return attachmentFiles
    .map((file) => relative(vault, file).split(sep).join("/"))
    .filter((path) => !referenced.has(path) && !referenced.has(path.split("/").pop()!));
}
