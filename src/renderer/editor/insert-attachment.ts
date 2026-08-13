import type { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../../markdown/schema.js";
import { isEmbeddableAttachment } from "./attachment-view.js";

/**
 * `![[name]]` for anything this app can draw in the note, `[[name]]` for everything else —
 * the choice between the two spellings, made in exactly one place.
 *
 * A PDF joined the first group at B43: an embedded one draws its first page at the width
 * of the column, and inserting it as a link would have left the new feature reachable only
 * by typing `![[…]]` by hand, which is not a thing a WYSIWYG editor lets you do. A `.docx`
 * is still a link, because there is still nothing to draw for it.
 */
function attachmentNode(name: string): PMNode {
  return isEmbeddableAttachment(name)
    ? schema.nodes.wikiEmbed!.create({ target: name })
    : schema.nodes.wikiLink!.create({ target: name });
}

/**
 * The one place a stored attachment turns into a document node — used by the toolbar
 * button, the keyboard shortcut, a clipboard paste and a file drop alike, so the
 * choice above is made exactly once. `name` is always already the stored filename
 * `saveAttachment`/`pickAttachment` returned, never a raw `File` — everything that writes
 * bytes goes through main first (B6: a renderer never writes a file), so by the time this
 * runs the attachment already exists on disk.
 */
export function insertAttachment(view: EditorView, name: string): void {
  view.dispatch(view.state.tr.replaceSelectionWith(attachmentNode(name), false).scrollIntoView());
  view.focus();
}

/** Same insertion, at an explicit document position rather than the current selection — what a drop needs, since the drop point is rarely where the caret already was. */
function insertAttachmentAt(view: EditorView, name: string, pos: number): void {
  view.dispatch(view.state.tr.insert(pos, attachmentNode(name)).scrollIntoView());
  view.focus();
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

function isAttachableFile(file: File): boolean {
  return isImageFile(file) || file.type === "application/pdf";
}

/**
 * `handlePaste` for the `EditorView`. Claims the event only when the clipboard is
 * carrying an actual image file — a screenshot, or a picture copied from Explorer or
 * Finder — and returns `false` on everything else so the ordinary text/HTML paste path
 * (still `05-besluitenlog.md`'s deferred work) is untouched. A paste is never a PDF: an
 * image is the only file type anyone actually copies to the clipboard and pastes, so
 * this is deliberately narrower than the drop and picker paths.
 */
export function handleAttachmentPaste(view: EditorView, event: ClipboardEvent): boolean {
  const files = event.clipboardData?.files;
  if (files === undefined || files.length === 0) return false;

  const image = [...files].find(isImageFile);
  if (image === undefined) return false;

  event.preventDefault();
  void image
    .arrayBuffer()
    .then((bytes) => window.emqnote.saveAttachment(bytes, image.name))
    .then((name) => {
      if (name !== null) insertAttachment(view, name);
    });

  return true;
}

/**
 * `handleDrop` for the `EditorView`. `moved` is ProseMirror's own signal for a drag
 * that started *inside* this document — ordinary text being moved around — and that is
 * never this handler's business; declining lets ProseMirror's default drop logic run
 * exactly as it always has. Everything else with an image or a PDF among the dropped
 * files is claimed here, landing at the coordinate the file was actually dropped on
 * rather than wherever the caret happened to be.
 */
export function handleAttachmentDrop(
  view: EditorView,
  event: DragEvent,
  _slice: unknown,
  moved: boolean,
): boolean {
  if (moved) return false;

  const files = event.dataTransfer?.files;
  if (files === undefined || files.length === 0) return false;

  const file = [...files].find(isAttachableFile);
  if (file === undefined) return false;

  event.preventDefault();
  const coords = { left: event.clientX, top: event.clientY };
  const target = view.posAtCoords(coords)?.pos ?? view.state.selection.from;

  void file
    .arrayBuffer()
    .then((bytes) => window.emqnote.saveAttachment(bytes, file.name))
    .then((name) => {
      if (name !== null) insertAttachmentAt(view, name, target);
    });

  return true;
}
