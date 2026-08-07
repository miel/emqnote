import type { VaultFileEvent } from "../../shared/vault-types.js";

interface Props {
  event: VaultFileEvent | null;
  t: (key: string) => string;
  /** Rereads the note from disk into the reader. Only offered for "changed". */
  onReload: () => void;
  /** Puts the note away. Only offered for "removed" — see the module comment for why
   *  there is no automatic equivalent. */
  onClose: () => void;
  /** Dismisses the bar without touching the reader. The next debounced autosave writes
   *  (or, for "removed", recreates) the file exactly as the reader currently has it —
   *  which is what "keep mine" means, and needs no code of its own beyond this. */
  onDismiss: () => void;
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
 * "Keep mine" is the same button in both shapes and needs no write of its own: the next
 * debounced autosave already does exactly what that means, on disk, on its own.
 */
export function DiskChangeBar({
  event,
  t,
  onReload,
  onClose,
  onDismiss,
}: Props): React.ReactElement | null {
  if (event === null) return null;

  return (
    <div className="disk-change-bar" role="status">
      <span>{t(event.kind === "changed" ? "diskChange.changed" : "diskChange.removed")}</span>
      <div className="disk-change-actions">
        {event.kind === "changed" ? (
          <button type="button" className="primary" onClick={onReload}>
            {t("diskChange.reload")}
          </button>
        ) : (
          <button type="button" className="danger" onClick={onClose}>
            {t("diskChange.close")}
          </button>
        )}
        <button type="button" onClick={onDismiss}>
          {t("diskChange.keepMine")}
        </button>
      </div>
    </div>
  );
}
