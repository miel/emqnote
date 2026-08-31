import type { ReactNode } from "react";

interface Props {
  /**
   * The heading. A string is drawn as the pane title; a node replaces it in place, which
   * is what the note list hands over when its search field takes the title's seat.
   */
  title: ReactNode;
  /** Right-aligned controls, `ChromeButton`s. */
  actions?: ReactNode;
  /**
   * True for the band macOS draws its traffic lights over — the leftmost one in the
   * window: the folder tree in the library, the only band in the capture window.
   *
   * A flag from the renderer rather than `env(titlebar-area-x)` in the stylesheet,
   * because that variable exists only where Chromium has a Window Controls Overlay —
   * which is Windows. On macOS it is absent and a CSS fallback could not tell "no
   * overlay, lights on the left" (inset needed) from "no overlay, native frame" on Linux
   * (no inset at all). The caller knows which platform it is; CSS does not.
   */
  trafficLights?: boolean;
  /**
   * True for the band Windows 11 draws its caption buttons over — the rightmost one: the
   * note pane in the library, and again the only band in the capture window.
   *
   * This one *can* be left to CSS, and is: `env(titlebar-area-width)` is defined exactly
   * where the overlay exists, and its fallback makes the padding zero everywhere else.
   */
  captionButtons?: boolean;
  className?: string;
}

/**
 * The 40px band at the top of a pane.
 *
 * There are three of them in the library window and one in the capture window, and the
 * thing worth defending is that they are the *same* 40px: `DESIGN-CRITIQUE.md`'s Finding 7
 * is what three panes with three different chrome heights looks like — no horizontal line
 * anywhere across the top of the window, so no top edge to the content at all.
 *
 * It is also the window's drag region and, on both platforms, the strip the OS draws its
 * own window controls into: 40px is what covers macOS's ~28px traffic lights and Windows
 * 11's 32px caption buttons, so the chrome costs no vertical space of its own and the
 * three headings stay on one line. Which band gets out of the way of what is the two
 * flags above.
 */
export function PaneHeader({
  title,
  actions,
  trafficLights = false,
  captionButtons = false,
  className,
}: Props): React.ReactElement {
  const classes = [
    "pane-header",
    trafficLights ? "pane-header-lights" : null,
    captionButtons ? "pane-header-caption" : null,
    className ?? null,
  ].filter((one) => one !== null);

  return (
    <div className={classes.join(" ")}>
      {typeof title === "string" ? <h2 className="pane-title">{title}</h2> : title}
      {actions !== undefined && <div className="pane-actions">{actions}</div>}
    </div>
  );
}
