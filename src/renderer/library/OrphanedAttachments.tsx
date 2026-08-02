import { useEffect, useState } from "react";

interface Entry {
  path: string;
  /** From `attachmentPreview` — `null` for anything that is not a browser-renderable image type. */
  preview: string | null;
}

interface Props {
  t: (key: string) => string;
  onClose: () => void;
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

/**
 * §6.5's cleanup screen: manual, never automatic, and opened by hand from the tree
 * footer — see `FolderTree.tsx`'s own comment on why it sits down there next to
 * Settings and Help rather than anywhere more prominent.
 *
 * Loaded once, on open, not kept live: `findOrphanedAttachments` re-parses every note
 * in the vault to build the referenced-target set, which is real work worth paying once
 * per visit to this screen rather than on every `library:refresh` the rest of the
 * window reacts to.
 */
export function OrphanedAttachments({ t, onClose }: Props): React.ReactElement {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const paths = await window.emqnote.library.orphanedAttachments();
      const withPreviews = await Promise.all(
        paths.map(
          async (path): Promise<Entry> => ({
            path,
            preview: await window.emqnote.library.attachmentPreview(path),
          }),
        ),
      );
      if (!cancelled) setEntries(withPreviews);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const remove = async (path: string): Promise<void> => {
    await window.emqnote.library.trashAttachment(path);
    setEntries((current) => current?.filter((entry) => entry.path !== path) ?? current);
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="orphans" onMouseDown={(event) => event.stopPropagation()}>
        <h2>{t("orphans.title")}</h2>

        {entries === null && <p className="orphans-note">{t("orphans.loading")}</p>}
        {entries !== null && entries.length === 0 && (
          <p className="orphans-note">{t("orphans.empty")}</p>
        )}

        {entries !== null && entries.length > 0 && (
          <ul className="orphans-grid">
            {entries.map((entry) => (
              <li key={entry.path} className="orphan">
                {entry.preview !== null ? (
                  <img src={entry.preview} alt="" className="orphan-preview" />
                ) : (
                  <div className="orphan-preview orphan-generic">
                    {fileName(entry.path).split(".").pop()?.toUpperCase()}
                  </div>
                )}
                <span className="orphan-name" title={entry.path}>
                  {fileName(entry.path)}
                </span>
                <button
                  type="button"
                  className="danger"
                  onClick={() => void remove(entry.path)}
                >
                  {t("library.delete")}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="settings-buttons">
          <button type="button" className="primary" onClick={onClose}>
            {t("settings.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
