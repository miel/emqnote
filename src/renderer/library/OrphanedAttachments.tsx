import { useEffect, useRef, useState } from "react";
import { attachmentUrl } from "../../shared/attachment-url.js";
import { trapTab } from "./focus-trap.js";

interface Props {
  t: (key: string) => string;
  onClose: () => void;
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function extensionOf(path: string): string {
  const name = fileName(path);
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

/**
 * §6.5's cleanup screen: manual, never automatic, and opened by hand from Settings.
 *
 * **The previews are protocol URLs, not data URLs** (14 August 2026, B28 applied where it
 * always should have been). Each file used to come back through a second IPC call as
 * base64 — the whole file, ~1.37× inflated, structured-cloned into the renderer — and all
 * of them were asked for at once with `Promise.all`, so nothing at all appeared until the
 * last one landed. B28 refused exactly this for a note's own pictures; the exception
 * written down for this screen was "it is one file, once", which it is not. Now the list
 * is the only thing that crosses IPC and each `<img>` fetches itself, so a row appears as
 * soon as the path list does and a picture arrives when it arrives.
 *
 * A PDF gets its first page from `emqnote-thumb://` for free, since that is the same chip
 * thumbnail B36 already draws in a note.
 */
export function OrphanedAttachments({ t, onClose }: Props): React.ReactElement {
  const [paths, setPaths] = useState<string[] | "failed" | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    // The `.catch` is the bug, not a precaution. There was one state — `null` meaning
    // "looking" — and a rejected `invoke` (which is what `ipcMain.handle` throwing looks
    // like from here) left it at `null` for good, so the screen said "Looking…" for the
    // rest of the session with nothing to say why.
    void window.emqnote.library
      .orphanedAttachments()
      .then((found) => {
        if (!cancelled) setPaths(found);
      })
      .catch(() => {
        if (!cancelled) setPaths("failed");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const remove = async (path: string): Promise<void> => {
    await window.emqnote.library.trashAttachment(path);
    setPaths((current) =>
      Array.isArray(current) ? current.filter((entry) => entry !== path) : current,
    );
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="orphans"
        ref={panel}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          trapTab(event, panel.current);
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <h2>{t("orphans.title")}</h2>

        {paths === null && <p className="orphans-note">{t("orphans.loading")}</p>}
        {paths === "failed" && <p className="orphans-note">{t("orphans.failed")}</p>}
        {Array.isArray(paths) && paths.length === 0 && (
          <p className="orphans-note">{t("orphans.empty")}</p>
        )}

        {Array.isArray(paths) && paths.length > 0 && (
          <ul className="orphans-grid">
            {paths.map((path) => (
              <li key={path} className="orphan">
                <OrphanPreview path={path} />
                <span className="orphan-name" title={path}>
                  {fileName(path)}
                </span>
                <button type="button" className="danger" onClick={() => void remove(path)}>
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

/**
 * One tile. An image draws itself, a PDF asks for the chip-size page B36 renders, and
 * anything else says what it is — which is what the generic tile always did.
 *
 * `onError` falls back to the generic tile rather than leaving the browser's broken-image
 * glyph, the same reason `attachment-view.ts` keeps its `<img>` hidden until the fetch
 * lands: a glyph reads as the app being broken where the file merely is not drawable.
 */
function OrphanPreview({ path }: { path: string }): React.ReactElement {
  const [drawable, setDrawable] = useState(true);
  const extension = extensionOf(path);
  const previewable = IMAGE_EXTENSIONS.has(extension) || extension === ".pdf";

  if (!drawable || !previewable) {
    return <div className="orphan-preview orphan-generic">{extension.slice(1).toUpperCase()}</div>;
  }

  return (
    <img
      src={
        extension === ".pdf"
          ? attachmentUrl("emqnote-thumb", path)
          : attachmentUrl("emqnote-attachment", path)
      }
      alt=""
      className="orphan-preview"
      onError={() => setDrawable(false)}
    />
  );
}
