import { folderOf, TRASH_FOLDER } from "../../shared/vault-types.js";

/**
 * Dragging a note from the list onto a folder in the tree — `04-bouwplan.md`'s phase-3
 * "slepen in de boom", and the second half of `01-functioneel-ontwerp.md` §3.3's
 * "Slepen in de boom kan ook".
 *
 * The rules live here rather than in `shared/vault-types.ts` because none of them is
 * part of the main/renderer contract: main never sees a drag, only the move it produces.
 */

/**
 * A private drag type, not `text/plain`.
 *
 * `text/plain` would make every note row draggable into any text field on the machine,
 * dropping a vault-relative path into an email. A custom type is only readable by
 * something that asks for it by name, which is this tree and nothing else.
 */
export const NOTE_DRAG_TYPE = "application/x-emqnote-path";

/**
 * Whether a note may be dropped on a folder.
 *
 * One function for the drop handler and for the highlight that precedes it, so a row can
 * never light up as a destination and then refuse the drop — two separate answers to the
 * same question is exactly how that mismatch gets in.
 */
export function canDropNote(notePath: string, targetFolder: string): boolean {
  // The trash is not a destination. `MoveDialog` already leaves it out, for the reason
  // spelled out at its call site: offering it among the folders makes it look like an
  // ordinary one, when what puts a note there is Delete — with a confirmation. A drag
  // has no confirmation, so it must not be the one gesture that can destroy something.
  if (isInTrash(targetFolder)) return false;

  // And nothing drags *out* of the trash either. Restoring a deleted note is a real
  // thing to want, but it is a deliberate action with a name, not a side effect of
  // having grabbed the wrong row in a list.
  if (isInTrash(folderOf(notePath))) return false;

  // Dropping a note where it already is is not a refusal, it is simply nothing — but it
  // should not light up as though something were about to happen.
  return folderOf(notePath) !== targetFolder;
}

function isInTrash(folder: string): boolean {
  return folder === TRASH_FOLDER || folder.startsWith(`${TRASH_FOLDER}/`);
}
