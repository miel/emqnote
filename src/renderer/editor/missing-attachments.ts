/**
 * "Does this `[[…]]` target still name a file?", asked once per note rather than once per
 * chip.
 *
 * A NodeView has to return its DOM synchronously and there is nothing in the node that
 * says whether the file behind it exists — only main can answer that. `setDoc` builds
 * every NodeView in a note in one synchronous pass, so every question a note has arrives
 * in the same tick: they are collected on a microtask and asked as one IPC call. A note
 * with thirty screenshots costs one round trip, not thirty.
 *
 * Deliberately **not cached across calls.** An attachment can appear — a OneDrive file
 * finishing its download, a picture pasted a moment ago — and a remembered "missing" from
 * ten minutes ago would keep drawing the marker over a picture that is now there.
 * Re-opening a note is exactly when the question is worth asking again, and it is one
 * round trip. (`attachment-view.ts`'s `failedThumbnails` caches for the opposite reason:
 * a *render* failure is a property of the file's bytes, not of whether it is there.)
 *
 * The answer is a promise per target rather than a plugin holding state, because the
 * thing that reacts to it is a DOM node the NodeView already owns — there is no document
 * position to map and nothing to redraw through ProseMirror.
 */

interface Pending {
  target: string;
  settle: (missing: boolean) => void;
}

let batch: Pending[] = [];
let scheduled = false;

function flush(): void {
  const pending = batch;
  batch = [];
  scheduled = false;

  const targets = [...new Set(pending.map((one) => one.target))];

  // A failed question is not a missing file: every route out of here that is not a real
  // answer settles `false`, and nothing is marked — exactly as before this existed, with
  // the chip keeping its click-time answer. The `try` covers the synchronous throw too,
  // since this runs on a microtask where an exception has nowhere to go but the console.
  const nothing = (): void => {
    for (const one of pending) one.settle(false);
  };

  try {
    void window.emqnote
      .checkAttachments(targets)
      .then((missing) => {
        const gone = new Set(missing);
        for (const one of pending) one.settle(gone.has(one.target));
      })
      .catch(nothing);
  } catch {
    nothing();
  }
}

/** Whether `target` names no file in the vault. `false` for anything unanswerable. */
export function checkAttachment(target: string): Promise<boolean> {
  return new Promise((settle) => {
    batch.push({ target, settle });
    if (scheduled) return;

    scheduled = true;
    queueMicrotask(flush);
  });
}
