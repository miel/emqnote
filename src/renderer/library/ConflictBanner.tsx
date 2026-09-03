import { useEffect, useRef, useState } from "react";
import type { ConflictChoice, ConflictPair, DiffLine } from "../../shared/vault-types.js";
import { trapTab } from "./focus-trap.js";

interface Props {
  pairs: ConflictPair[];
  t: (key: string) => string;
  /**
   * "Merge" touches no file — see `vault-io.ts`'s `resolveConflict`, which has no
   * branch for it either. It opens the original for editing instead, the same as
   * clicking it in the note list would, and leaves the conflict copy exactly where it
   * is for the user to reconcile and clean up by hand, in their own time.
   */
  onMerge: (path: string) => void;
  /**
   * Carries out the choice. The IPC call used to be made here, and the reader was then
   * left showing whatever it had (B101) — "Keep that one" replaces the original's bytes,
   * and nothing told the note pane to read them. `Library.tsx` owns the open note, so it
   * owns both halves: the resolve and the reopen.
   */
  onResolve: (pair: ConflictPair, choice: ConflictChoice) => void;
}

/** The last segment of a vault-relative path — same trick as `FilePreview.tsx`. */
function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

/**
 * The banner and its dialog for `02-technisch-ontwerp.md` §5.2. One conflict is shown
 * at a time even when several exist — resolving it triggers the usual `library:refresh`
 * broadcast, which drops it from `pairs` and, if there is another, leaves the banner
 * showing a smaller count rather than auto-advancing into it. A decision this
 * consequential — trashing a note either way, keep-this or keep-that — should never
 * happen back to back without the user choosing to look again.
 */
export function ConflictBanner({
  pairs,
  t,
  onMerge,
  onResolve,
}: Props): React.ReactElement | null {
  const [active, setActive] = useState<ConflictPair | null>(null);
  const [diff, setDiff] = useState<DiffLine[] | null>(null);
  const [diffError, setDiffError] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active === null) return;
    setDiff(null);
    setDiffError(false);
    let cancelled = false;
    void window.emqnote.library
      .conflictDiff(active)
      .then((lines) => {
        if (!cancelled) setDiff(lines);
      })
      .catch(() => {
        // A rejected `invoke` used to leave `diff` at `null` forever, which reads as
        // "Loading diff…" — indistinguishable, at a glance, from the dialog simply
        // never having opened. Naming the failure here is what makes that impossible.
        if (!cancelled) setDiffError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  if (pairs.length === 0) return null;

  const resolve = (choice: ConflictChoice): void => {
    if (active === null) return;
    const pair = active;
    setActive(null);
    onResolve(pair, choice);
  };

  const bannerText =
    pairs.length === 1
      ? `${basename(pairs[0]!.conflict)} ${t("conflict.banner")}`
      : `${pairs.length} ${t("conflict.bannerPlural")}`;

  return (
    <>
      <button type="button" className="conflict-banner" onClick={() => setActive(pairs[0]!)}>
        {bannerText}
      </button>

      {active !== null && (
        <div className="overlay" onMouseDown={() => setActive(null)}>
          <div
            className="conflict-dialog"
            ref={panel}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              trapTab(event, panel.current);
              if (event.key === "Escape") {
                event.preventDefault();
                setActive(null);
              }
            }}
          >
            <h2>{t("conflict.title")}</h2>
            <p className="conflict-path" title={active.original}>
              <strong>{t("conflict.thisOne")}</strong> {basename(active.original)}
            </p>
            <p className="conflict-path" title={active.conflict}>
              <strong>{t("conflict.thatOne")}</strong> {basename(active.conflict)}
            </p>

            <div className="conflict-diff">
              {diffError ? (
                <p className="conflict-loading conflict-error">{t("conflict.diffError")}</p>
              ) : diff === null ? (
                <p className="conflict-loading">{t("conflict.loading")}</p>
              ) : (
                diff.map((line, index) => (
                  <div key={index} className={`diff-line diff-${line.kind}`}>
                    <span className="diff-marker">
                      {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}
                    </span>
                    {line.text}
                  </div>
                ))
              )}
            </div>

            <div className="settings-buttons">
              <button type="button" autoFocus onClick={() => setActive(null)}>
                {t("ask.cancel")}
              </button>
              <button type="button" onClick={() => setActive(null)}>
                {t("conflict.close")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const path = active.original;
                  setActive(null);
                  onMerge(path);
                }}
              >
                {t("conflict.merge")}
              </button>
              <button type="button" onClick={() => resolve("keepConflict")}>
                {t("conflict.keepThat")}
              </button>
              <button type="button" className="primary" onClick={() => resolve("keepOriginal")}>
                {t("conflict.keepThis")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
