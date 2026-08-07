import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { Fragment, Slice, type Node as PMNode } from "prosemirror-model";
import { schema } from "../../markdown/schema.js";

/**
 * Pasting a web page brings its pictures with it.
 *
 * ProseMirror's stock HTML paste turns every `<img>` into an `image` node holding the
 * *remote* address, and that serializes literally to `![alt](https://…)`. The CSP
 * blocks it from ever being drawn, and even without the CSP the note would be empty
 * the moment the machine is offline or the other machine opens it off OneDrive. A
 * pasted picture has to become a file in `_attachments/`, like every other attachment
 * in this app (B28).
 *
 * Two halves, because a paste is synchronous and a download is not:
 *
 * - `transformPastedImages` runs inside `transformPasted`, before the slice is
 *   inserted, and settles the one case that needs no network — an `emqnote-attachment://`
 *   image, which is a copy of a picture already in the vault and becomes a `wikiEmbed`
 *   on the spot.
 * - `remoteImages()` is the plugin that notices what is left, asks main to download it,
 *   and swaps the `image` node for a `wikiEmbed` when the file lands.
 *
 * Nothing here touches a node that is not an `image`. The deferred Outlook `mso-list`
 * reconstruction (§6.3) owns the rest of the pasted slice, and this must stay out of
 * its way — see the contract note in `CLAUDE.md`.
 *
 * The in-flight bookkeeping is a `DecorationSet`, not a position: a download takes
 * seconds, during which the user goes on typing, undoes, or another picture lands
 * first. `DecorationSet.map` moves the marker with the text for free, and when the
 * image is deleted the decoration collapses and disappears with it — so a resolution
 * that arrives too late finds nothing and quietly does nothing.
 */

/** Beyond this many pictures in one paste, the rest simply stay remote `image` nodes. */
export const MAX_IMAGES_PER_PASTE = 24;

const ATTACHMENT_SCHEME = "emqnote-attachment://";

interface PendingRange {
  from: number;
  to: number;
}

interface RemoteImagesState {
  decos: DecorationSet;
  /** Ranges a paste just inserted, waiting for the plugin view to look through them. */
  scan: PendingRange[];
}

interface RemoteImagesMeta {
  add?: Decoration[];
  remove?: string;
  clearScan?: true;
}

export const remoteImagesKey = new PluginKey<RemoteImagesState>("remoteImages");

/**
 * The stored attachment an `emqnote-attachment://` address names, or null.
 *
 * Parsed off the raw string rather than through `new URL`: the scheme is registered as
 * `standard` in main, so a `URL` would lowercase the name (an attachment can collide
 * into `foto (2).png`, and the browser is free to percent-encode that space).
 */
export function attachmentTargetOf(src: string): string | null {
  if (!src.toLowerCase().startsWith(ATTACHMENT_SCHEME)) return null;

  const rest = src.slice(ATTACHMENT_SCHEME.length).replace(/\/+$/, "");
  if (rest === "") return null;

  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

/**
 * Whether this address is one main will be asked to download.
 *
 * `file:`, `blob:` and relative addresses are never requested — a page the user merely
 * copied from does not get to make this process read the local disk. `cid:` is left
 * alone too: it belongs to email import, where the parts are already in hand, and
 * there is nothing to fetch. Main enforces all of this again (`remote-image.ts`); this
 * is only about not asking.
 */
export function isFetchableImageSrc(src: string): boolean {
  const lower = src.trim().toLowerCase();
  return (
    lower.startsWith("https://") || lower.startsWith("http://") || lower.startsWith("data:")
  );
}

function mapFragment(fragment: Fragment): Fragment {
  const children: PMNode[] = [];

  fragment.forEach((child) => {
    if (child.type === schema.nodes.image) {
      const target = attachmentTargetOf((child.attrs.src as string | null) ?? "");
      if (target !== null) {
        children.push(schema.nodes.wikiEmbed!.create({ target }));
        return;
      }
      children.push(child);
      return;
    }

    // Text and every other leaf is handed back as the very same node — nothing outside
    // an `image` may be rebuilt here, or the deferred Outlook paste work would find its
    // slice quietly reshaped underneath it.
    if (child.content.size === 0) {
      children.push(child);
      return;
    }

    children.push(child.copy(mapFragment(child.content)));
  });

  return Fragment.fromArray(children);
}

/**
 * `transformPasted`: an image already stored in this vault becomes a `wikiEmbed` right
 * now, and everything else is left exactly as ProseMirror parsed it.
 *
 * The open depths are carried over untouched — every replacement is one inline leaf
 * for another at the same depth, so the slice's shape is unchanged.
 */
export function transformPastedImages(slice: Slice): Slice {
  return new Slice(mapFragment(slice.content), slice.openStart, slice.openEnd);
}

/** Every `image` node inside a range whose address is worth a download. */
function fetchableImagesIn(state: EditorState, range: PendingRange): number[] {
  const found: number[] = [];
  const from = Math.max(0, Math.min(range.from, state.doc.content.size));
  const to = Math.max(from, Math.min(range.to, state.doc.content.size));

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type !== schema.nodes.image) return true;
    if (isFetchableImageSrc((node.attrs.src as string | null) ?? "")) found.push(pos);
    return true;
  });

  return found;
}

/**
 * What a transaction inserted, in the coordinates of the document it produced.
 *
 * Each step's own map is in that step's coordinates, so the range has to be carried
 * forward through every map that follows it before it means anything in `tr.doc`.
 */
function insertedRanges(tr: Transaction): PendingRange[] {
  const ranges: PendingRange[] = [];

  tr.steps.forEach((step, index) => {
    const rest = tr.mapping.slice(index + 1);
    step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      ranges.push({ from: rest.map(newStart, -1), to: rest.map(newEnd, 1) });
    });
  });

  return ranges;
}

let counter = 0;

function nextId(): string {
  counter += 1;
  return `pasted-image-${counter}`;
}

/** The decoration for `id`, or null once it has been mapped away by a deletion. */
function decorationFor(state: EditorState, id: string): PendingRange | null {
  const found = remoteImagesKey
    .getState(state)
    ?.decos.find(undefined, undefined, (spec) => spec.id === id);

  const first = found?.[0];
  return first === undefined ? null : { from: first.from, to: first.to };
}

/**
 * The image `id` marks, or null when it is gone — deleted, undone, or replaced by
 * something else while the download was in the air. Every resolution starts here, and
 * "not there any more" is always a silent no-op rather than a repair attempt.
 */
function pendingImageAt(view: EditorView, id: string): { from: number; node: PMNode } | null {
  const range = decorationFor(view.state, id);
  if (range === null) return null;

  const node = view.state.doc.nodeAt(range.from);
  if (node === null || node.type !== schema.nodes.image) return null;

  return { from: range.from, node };
}

function clearPending(view: EditorView, id: string): void {
  if (view.isDestroyed) return;
  view.dispatch(
    view.state.tr.setMeta(remoteImagesKey, { remove: id }).setMeta("addToHistory", false),
  );
}

function resolve(view: EditorView, id: string, name: string | null): void {
  // The window can have been put away, or the note closed, while this was in the air —
  // `reset()` and `setDoc()` replace the whole state, which takes the decoration with
  // it, and `destroy()` leaves nothing to dispatch to at all.
  if (view.isDestroyed) return;

  const pending = pendingImageAt(view, id);
  if (pending === null) return;

  // A refusal in main — a blocked scheme, a type that is not an image, a timeout —
  // leaves the `image` node exactly where it is. It serializes to `![alt](https://…)`,
  // which is the honest outcome: the note says what was pasted and nothing pretends a
  // file was stored.
  if (name === null) {
    clearPending(view, id);
    return;
  }

  view.dispatch(
    view.state.tr
      .replaceWith(
        pending.from,
        pending.from + pending.node.nodeSize,
        schema.nodes.wikiEmbed!.create({ target: name }),
      )
      .setMeta(remoteImagesKey, { remove: id }),
  );
}

/**
 * The side effect lives in the plugin's view, never in `appendTransaction`: that runs
 * inside the dispatch cycle, and firing IPC from there would put a network call in the
 * middle of applying a transaction.
 */
function scanForImages(view: EditorView): void {
  const state = remoteImagesKey.getState(view.state);
  if (state === undefined || state.scan.length === 0) return;

  const positions: number[] = [];
  for (const range of state.scan) {
    for (const pos of fetchableImagesIn(view.state, range)) {
      if (!positions.includes(pos)) positions.push(pos);
    }
  }

  // Past the cap the rest simply stay remote `image` nodes: nobody pasted forty
  // pictures on purpose, and forty downloads is not something to start on a guess.
  const pending = positions.slice(0, MAX_IMAGES_PER_PASTE).map((pos) => {
    const id = nextId();
    return {
      id,
      src: ((view.state.doc.nodeAt(pos)?.attrs.src as string | null) ?? "").trim(),
      // An `image` is an inline leaf, so the marker is exactly one position wide.
      deco: Decoration.inline(pos, pos + 1, { class: "image-pending" }, { id }),
    };
  });

  // One transaction for the lot: the scan is cleared and every marker added at once, so
  // the update this dispatch causes finds nothing left to do and the recursion stops
  // there — and a paste carrying a dozen pictures costs one redraw, not a dozen.
  const meta: RemoteImagesMeta = { clearScan: true, add: pending.map((entry) => entry.deco) };
  view.dispatch(
    view.state.tr.setMeta(remoteImagesKey, meta).setMeta("addToHistory", false),
  );

  for (const entry of pending) {
    void window.emqnote
      .fetchRemoteImage(entry.src)
      .then((name) => resolve(view, entry.id, name))
      .catch(() => clearPending(view, entry.id));
  }
}

export function remoteImages(): Plugin<RemoteImagesState> {
  return new Plugin<RemoteImagesState>({
    key: remoteImagesKey,
    state: {
      init: () => ({ decos: DecorationSet.empty, scan: [] }),
      apply: (tr, value) => {
        let decos = value.decos.map(tr.mapping, tr.doc);
        let scan = value.scan.map((range) => ({
          from: tr.mapping.map(range.from, -1),
          to: tr.mapping.map(range.to, 1),
        }));

        const meta = tr.getMeta(remoteImagesKey) as RemoteImagesMeta | undefined;

        if (meta?.remove !== undefined) {
          const id = meta.remove;
          decos = decos.remove(decos.find(undefined, undefined, (spec) => spec.id === id));
        }
        if (meta?.add !== undefined && meta.add.length > 0) decos = decos.add(tr.doc, meta.add);
        if (meta?.clearScan === true) scan = [];

        // `uiEvent` is what `prosemirror-view` sets on a real paste; the `paste` meta is
        // the flag anything driving a paste by hand sets (the tests, and whatever ends
        // up claiming the Outlook paste later — see `CLAUDE.md`).
        if (tr.getMeta("paste") === true || tr.getMeta("uiEvent") === "paste") {
          scan = [...scan, ...insertedRanges(tr)];
        }

        return { decos, scan };
      },
    },
    props: {
      decorations: (state) => remoteImagesKey.getState(state)?.decos,
    },
    view: (editorView) => ({
      update: () => scanForImages(editorView),
    }),
  });
}
