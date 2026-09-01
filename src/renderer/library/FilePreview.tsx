import { useEffect, useRef, useState } from "react";
import { attachmentUrl } from "../../shared/attachment-url.js";
import { ChromeButton } from "../ChromeButton.js";
import { PaneFooter } from "../PaneFooter.js";
import { PaneHeader } from "../PaneHeader.js";

interface Props {
  /** Vault-relative path, exactly as `FileSummary.path` gives it. */
  path: string;
  t: (key: string) => string;
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".avif"]);

function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

/**
 * The reader pane, showing a file instead of a note (B47).
 *
 * Nothing new had to be built to *serve* any of this. `resolveAttachment` has resolved an
 * arbitrary vault-relative path since B38, `emqnote-attachment://` streams it (B28),
 * `emqnote-thumb://…?size=page` draws a PDF page through the hidden window (B36/B43), and
 * `openWikiLink` already routes a `.pdf` to the viewer window and everything else to the
 * OS (B40, `attachment-route.ts`). All that was missing was somewhere to point them at
 * something the note list had named rather than something a note had.
 *
 * A `.docx` gets no preview and says so with a button rather than an apology: this app
 * has no business rendering Office formats, and the OS it is running on does.
 */
export function FilePreview({ path, t }: Props): React.ReactElement {
  const extension = extensionOf(path);

  return (
    <div className="file-preview">
      {/* The same two bands the note beside it wears, from the same two components (B95).
          This was a bar of its own before — its own padding, its own idea of how tall
          chrome is, no footer at all — which is the third column breaking the line across
          the top of the window that B92 exists to draw, and on Windows 11 it put Open file
          and Reveal underneath the caption buttons. `captionButtons` is what fixes the
          second half; being a `PaneHeader` at all is what fixes the first.

          The class stays on the header rather than being dropped for `.pane-header`: it is
          what `library-folder-files.test.ts` reaches these two buttons through, and the
          rule behind it now says only what is particular to this pane. */}
      <PaneHeader
        captionButtons
        className="file-preview-bar"
        title={
          <span className="file-preview-name pane-title" title={path}>
            {fileName(path)}
          </span>
        }
        actions={
          <>
            <ChromeButton
              label={t("library.openFile")}
              small
              onClick={() => void window.emqnote.openWikiLink(path)}
            />
            <ChromeButton
              label={t("library.reveal")}
              small
              onClick={() => window.emqnote.library.revealNote(path)}
            />
          </>
        }
      />

      <div className="file-preview-body">
        {IMAGE_EXTENSIONS.has(extension) ? (
          <ImagePreview path={path} t={t} />
        ) : extension === ".pdf" ? (
          <PdfPreview path={path} t={t} />
        ) : (
          <p className="file-preview-none">{t("library.noPreview")}</p>
        )}
      </div>

      {/* Where the note's own footer says where it is filed, this one says the same about
          the file — the pane's bottom edge has to be a line whatever is in the pane, and a
          band with nothing in it would be a band with nothing in it. */}
      <PaneFooter
        className="file-preview-footer"
        status={<span className="file-preview-path">{path}</span>}
      />
    </div>
  );
}

function ImagePreview({ path, t }: Props): React.ReactElement {
  const [broken, setBroken] = useState(false);
  // Reset when the row changes: a `useState` keyed on nothing would keep the previous
  // file's failure and refuse to draw the next one.
  useEffect(() => setBroken(false), [path]);

  if (broken) return <p className="file-preview-none">{t("library.previewFailed")}</p>;

  return (
    <img
      className="file-preview-image"
      src={attachmentUrl("emqnote-attachment", path)}
      alt={fileName(path)}
      onError={() => setBroken(true)}
    />
  );
}

/**
 * A PDF, one page at a time, through the same request the inline embed makes.
 *
 * Deliberately the `emqnote-thumb` PNG rather than pdf.js: this window's bundle has no
 * pdf.js in it and must not gain any — the same reasoning B43 gives for the embed, and
 * the reason `?size=page` exists at all. Turning pages is a number on the URL (B46), and
 * `ensureThumbnail` collapses a render two views ask for at once.
 */
function PdfPreview({ path, t }: Props): React.ReactElement {
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const drawn = useRef<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
    setPages(null);
    setFailed(false);

    let cancelled = false;
    void window.emqnote.pdfPageCount(path).then((count) => {
      if (!cancelled && count !== null) setPages(count);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => {
    let cancelled = false;

    void fetch(attachmentUrl("emqnote-thumb", path, "page", page))
      .then(async (response) => {
        if (!response.ok) throw new Error(`emqnote-thumb: HTTP ${response.status}`);
        const url = URL.createObjectURL(await response.blob());
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        // One blob at a time. A long document paged through end to end would otherwise
        // leak one object URL per page for as long as the window stays open.
        if (drawn.current !== null) URL.revokeObjectURL(drawn.current);
        drawn.current = url;
        setSource(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [path, page]);

  useEffect(
    () => () => {
      if (drawn.current !== null) URL.revokeObjectURL(drawn.current);
      drawn.current = null;
    },
    [],
  );

  if (failed) return <p className="file-preview-none">{t("library.previewFailed")}</p>;

  return (
    <div className="file-preview-pdf">
      <div className="file-preview-pages">
        <button type="button" disabled={page <= 1} onClick={() => setPage((at) => at - 1)}>
          ◀
        </button>
        <button
          type="button"
          disabled={pages !== null && page >= pages}
          onClick={() => setPage((at) => at + 1)}
        >
          ▶
        </button>
        <span className="file-preview-counter">
          {page} / {pages === null ? "–" : pages}
        </span>
      </div>
      {source !== null && <img className="file-preview-image" src={source} alt="" />}
    </div>
  );
}
