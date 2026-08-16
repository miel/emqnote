import { folderOf, isInTrash, TRASH_FOLDER } from "../../shared/vault-types.js";

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
  // Nothing drags *out* of the trash. Restore is the named action for that, and it has
  // to be: `trashNote` flattens everything into one folder, so a note in there has no
  // remembered home, and putting it back is a question about where — which a drag onto
  // one particular folder answers by accident rather than on purpose.
  if (isInTrash(folderOf(notePath))) return false;

  // The trash itself *is* a destination, and a drop on it is Delete — the very same
  // rename into `_trash`, through the very same call (see `Library.tsx`'s drop handler),
  // with no confirmation in front of it. This used to be refused on the argument that a
  // drag has no confirmation and so must not be the one gesture that destroys something.
  // The argument was sound and the premise was not: trashing destroys nothing, since
  // `emptyTrash` and `deleteFromTrash` are the only code in the app that ever does (B24)
  // — and Restore now stands beside them as the named way back.
  //
  // A folder *inside* the trash is still no destination, and that is not a leftover of
  // the old rule: Delete files flat, so a note dropped three levels deep in there would
  // sit somewhere nothing else in the app ever puts one and nothing else ever looks.
  if (targetFolder !== TRASH_FOLDER && isInTrash(targetFolder)) return false;

  // Dropping a note where it already is is not a refusal, it is simply nothing — but it
  // should not light up as though something were about to happen.
  return folderOf(notePath) !== targetFolder;
}
