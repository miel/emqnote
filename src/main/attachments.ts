import { existsSync, realpathSync, statSync } from "node:fs";
import { copyFile, mkdir, rename, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { sanitiseTitle } from "./filename.js";
import { ATTACHMENTS } from "./vault.js";

/**
 * Storing a file dropped, pasted or picked into `_attachments/`, and serving it back
 * out again — the base `02-technisch-ontwerp.md` §6.3/§6.4 described but nothing ever
 * built: the dialect has expressed `![[image.png]]` and `[[offerte.pdf]]` since day
 * one, seven corpus fixtures use them, and `orphaned-attachments.ts` exists to *clean
 * up* an attachment, but no code path has ever created one.
 *
 * Electron-free, so the naming and traversal rules can be tested directly — the same
 * discipline `vault-io.ts` and `vault-scan.ts` already follow.
 */

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * `2026-08-04-1030` — the same fields `filename.ts`'s `timestampPrefix` uses, but
 * joined with a hyphen throughout rather than a space before the time. That is the
 * flat form the corpus fixtures already use for an attachment name
 * (`test/corpus/10-afbeelding-in-geneste-lijst.md:5`,
 * `test/corpus/25-geplakte-outlook-mail.md:5`), and a note's own filename keeps the
 * space for readability in Explorer/Finder — an attachment is never read as a
 * filename by a person, so there is no reason to match it stroke for stroke.
 */
function attachmentPrefix(when: Date): string {
  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}-` +
    `${pad(when.getHours())}${pad(when.getMinutes())}`
  );
}

/**
 * `YYYY-MM-DD-HHmm-<slug>.<ext>`, matching the corpus exactly.
 *
 * Reuses `sanitiseTitle` rather than writing a second slugifier: the same
 * Windows-illegal-character and reserved-device-name rules that keep a note filename
 * reachable on both machines apply just as much to a file landing in `_attachments/`.
 */
export function attachmentName(originalName: string, when: Date): string {
  const dot = originalName.lastIndexOf(".");
  const stem = dot === -1 ? originalName : originalName.slice(0, dot);
  const extension = (dot === -1 ? "" : originalName.slice(dot)).toLowerCase();

  const slug = sanitiseTitle(stem).replace(/\s+/g, "-").toLowerCase();
  return `${attachmentPrefix(when)}-${slug}${extension}`;
}

/**
 * The same collision suffix `vault-io.ts`'s `trashAttachment` needs for the trash and
 * `saveAttachment` needs here: `filename.ts`'s own `uniquePath` hardcodes `.md`, which
 * would quietly turn a colliding `foto (2).png` into `foto (2).md`.
 */
function uniqueAttachmentPath(directory: string, fileName: string): string {
  const candidate = join(directory, fileName);
  if (!existsSync(candidate)) return candidate;

  const dot = fileName.lastIndexOf(".");
  const base = dot === -1 ? fileName : fileName.slice(0, dot);
  const extension = dot === -1 ? "" : fileName.slice(dot);

  for (let counter = 2; counter < 1000; counter += 1) {
    const next = join(directory, `${base} (${counter})${extension}`);
    if (!existsSync(next)) return next;
  }

  return join(directory, `${base} (${Date.now()})${extension}`);
}

/**
 * Writes a pasted, dropped or picked file into `<vault>/_attachments/` and returns the
 * bare filename it landed under — never a path. Wiki targets resolve by basename, not
 * by path (`wiki-targets.ts`'s own comment on why that is what lets a note move
 * without breaking its embeds), so the body only ever needs the name.
 *
 * Atomic like every other write in this app: `.tmp` then `rename()`, so a renderer
 * that reads the protocol mid-write never sees a half-written file.
 *
 * Async on purpose: `bytes` can be a multi-megabyte PDF, and a synchronous write of
 * that on the main thread blocks every IPC channel in both windows for as long as it
 * takes — the hotkey included, not just this attachment. `copyAttachment` below is the
 * sibling for the common case where the source is already a file on disk, which never
 * needs the bytes in a JS `Buffer` here at all.
 */
export async function saveAttachment(
  vault: string,
  bytes: Uint8Array,
  originalName: string,
): Promise<string> {
  const directory = join(vault, ATTACHMENTS);
  await mkdir(directory, { recursive: true });

  const target = uniqueAttachmentPath(directory, attachmentName(originalName, new Date()));
  const temporary = `${target}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, target);

  return basename(target);
}

/**
 * Same destination and naming as `saveAttachment`, but for a file already sitting on
 * disk — the file picker's own choice, in practice, as opposed to bytes a paste or a
 * drop already holds in the renderer. `copyFile` streams directly to the `.tmp` path
 * without ever materialising the file's bytes as a `Buffer` in this process, which is
 * what makes this worth having as its own function rather than a `readFile` in front of
 * `saveAttachment`: a multi-megabyte PDF should not cost a multi-megabyte allocation
 * here just to move it a few folders over.
 */
export async function copyAttachment(
  vault: string,
  sourcePath: string,
  originalName: string,
): Promise<string> {
  const directory = join(vault, ATTACHMENTS);
  await mkdir(directory, { recursive: true });

  const target = uniqueAttachmentPath(directory, attachmentName(originalName, new Date()));
  const temporary = `${target}.tmp`;
  await copyFile(sourcePath, temporary);
  await rename(temporary, target);

  return basename(target);
}

/**
 * The absolute path for a name under `_attachments/`, or `null` when it does not
 * resolve to a real file inside that folder.
 *
 * This is the guard the `emqnote-attachment://` protocol handler depends on to serve
 * files to a renderer at all safely. `resolve()` alone only normalises text — it does
 * not follow anything on disk — so a name like `../../secret` is caught by the prefix
 * check below before the filesystem is ever touched, and a symlink planted inside
 * `_attachments` pointing elsewhere would sail straight through that same check while
 * actually serving whatever it links to. `realpathSync` is what actually asks the
 * filesystem, so it runs on both sides of the second comparison — the same reasoning
 * `emptyTrash` in `vault-io.ts` already applies to `_trash`.
 */
export function resolveAttachment(vault: string, name: string): string | null {
  const attachmentsDir = join(vault, ATTACHMENTS);
  const candidate = resolve(attachmentsDir, name);

  if (candidate !== attachmentsDir && !candidate.startsWith(attachmentsDir + sep)) {
    return null;
  }

  let realAttachmentsDir: string;
  try {
    realAttachmentsDir = realpathSync(attachmentsDir);
  } catch {
    return null;
  }

  let real: string;
  try {
    real = realpathSync(candidate);
  } catch {
    return null;
  }

  if (real !== realAttachmentsDir && !real.startsWith(realAttachmentsDir + sep)) {
    return null;
  }

  try {
    if (!statSync(real).isFile()) return null;
  } catch {
    return null;
  }

  return real;
}
