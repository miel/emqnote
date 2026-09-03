import type { VaultFileEvent } from "../../shared/vault-types.js";

interface Props {
  event: VaultFileEvent | null;
  t: (key: string) => string;
  /** Rereads the note from disk into the reader. Only offered for "changed". */
  onReload: () => void;
  /** Puts the note away. Only offered for "removed" — see the module comment for why
   *  there is no automatic equivalent. */
  onClose: () => void;
  /** Dismisses the bar without touching the reader, for "changed": the note stays as the
   *  reader has it, and the next debounced autosave writes it over what is on disk. */
  onDismiss: () => void;
  /** Writes the note back to the path it was deleted from. Only offered for "removed" —
   *  see the module comment. */
  onRestore: () => void;
}

/**
 * A note changed or disappeared on disk while the reader had it open, from outside this
 * app — the other machine, OneDrive's own sync dance, a file manager. `Library.tsx`
 * only ever sets `event` for the note currently open, and never for this app's own
 * write (`own-writes.ts`'s content hash is what tells the two apart before this
 * component ever hears about it).
 *
 * Two shapes, not one, and deliberately asymmetric:
 *
 *  - "changed" offers Reload. The reader has nothing of its own to lose by reloading —
 *    whatever is on disk simply becomes what is shown — so this is the one case where
 *    an explicit action is offered at all rather than nothing.
 *  - "removed" only ever offers Close, never an automatic equivalent: a transient
 *    OneDrive hiccup (a conflict-copy dance that briefly removes then restores a file)
 *    must not be able to yank the whole window out from under someone reading it. The
 *    user has to choose that.
 *
 * The second button is not the same in both shapes, and used to be (B101). It was "Keep
 * mine" either way, on the reasoning that the next debounced autosave would write — or,
 * for "removed", recreate — the file on its own, so the button needed no code beyond
 * dismissing the bar. That reasoning holds only if you then *type*: the debounce is armed
 * by an edit, so on a note nobody had touched there was no pending save, no write ever
 * came, and "Keep mine" left the reader holding a document with no file behind it. Reveal
 * found nothing, and neither did the Inbox.
 *
 * So the two shapes have two buttons. "Keep mine" still means "do not reload, my version
 * stands" for a note that *changed* — the file is still there and the next save overwrites
 * it. "Restore" is what a *deleted* note needs, and it writes, now: `writeAtomic` even
 * recreates the folder on the way, so it works when the whole folder went.
 */
export function DiskChangeBar({
  event,
  t,
  onReload,
  onClose,
  onDismiss,
  onRestore,
}: Props): React.ReactElement | null {
  if (event === null) return null;

  return (
    <div className="disk-change-bar" role="status">
      <span>{t(event.kind === "changed" ? "diskChange.changed" : "diskChange.removed")}</span>
      <div className="disk-change-actions">
        {event.kind === "changed" ? (
          <>
            <button type="button" className="primary" onClick={onReload}>
              {t("diskChange.reload")}
            </button>
            <button type="button" onClick={onDismiss}>
              {t("diskChange.keepMine")}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="danger" onClick={onClose}>
              {t("diskChange.close")}
            </button>
            <button type="button" onClick={onRestore}>
              {t("diskChange.restore")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
