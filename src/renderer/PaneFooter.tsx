import type { ReactNode } from "react";

interface Props {
  /** What the pane is doing, or what is in it: a count, a save state, a file name. */
  status: ReactNode;
  /** Right-aligned controls, `ChromeButton`s at `small`. */
  actions?: ReactNode;
  className?: string;
}

/**
 * The 28px band at the foot of a pane.
 *
 * Two panes have one — the note list and the note — and they are the same 28px for the
 * same reason the headers are the same 40px. The folder tree deliberately has none: its
 * bottom menu (Tags / People / Tasks / Settings) is a set of destinations rather than a
 * status bar, it can unfold to 55% of the pane, and dressing it as a footer band would
 * claim an alignment it cannot keep.
 *
 * `.pane-status` is the elastic half, so a long file name or a long "← note you came
 * from" ellipses inside it rather than pushing the buttons off the right edge; the group
 * beside it is `flex: 0 0 auto` and would not give way.
 */
export function PaneFooter({ status, actions, className }: Props): React.ReactElement {
  const classes = ["pane-footer", className ?? null].filter((one) => one !== null);

  return (
    <div className={classes.join(" ")}>
      <div className="pane-status">{status}</div>
      {actions !== undefined && <div className="pane-actions">{actions}</div>}
    </div>
  );
}
