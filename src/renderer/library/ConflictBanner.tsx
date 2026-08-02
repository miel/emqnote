import { useEffect, useState } from "react";
import type { ConflictChoice, ConflictPair, DiffLine } from "../../shared/vault-types.js";

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
}

/**
 * The banner and its dialog for `02-technisch-ontwerp.md` §5.2. One conflict is shown
 * at a time even when several exist — resolving it triggers the usual `library:refresh`
 * broadcast, which drops it from `pairs` and, if there is another, leaves the banner
 * showing a smaller count rather than auto-advancing into it. A decision this
 * consequential — trashing a note either way, keep-this or keep-that — should never
 * happen back to back without the user choosing to look again.
 */
export function ConflictBanner({ pairs, t, onMerge }: Props): React.ReactElement | null {
  const [active, setActive] = useState<ConflictPair | null>(null);
  const [diff, setDiff] = useState<DiffLine[] | null>(null);

  useEffect(() => {
    if (active === null) return;
    setDiff(null);
    let cancelled = false;
    void window.emqnote.library.conflictDiff(active).then((lines) => {
      if (!cancelled) setDiff(lines);
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
    void window.emqnote.library.resolveConflict(pair, choice);
  };

  return (
    <>
      <button type="button" className="conflict-banner" onClick={() => setActive(pairs[0]!)}>
        {pairs.length} {t(pairs.length === 1 ? "conflict.banner" : "conflict.bannerPlural")}
      </button>

      {active !== null && (
        <div className="overlay" onMouseDown={() => setActive(null)}>
          <div className="conflict-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <h2>{t("conflict.title")}</h2>
            <p className="conflict-path" title={active.original}>
              {active.original}
            </p>

            <div className="conflict-diff">
              {diff === null ? (
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
              <button type="button" onClick={() => setActive(null)}>
                {t("ask.cancel")}
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
