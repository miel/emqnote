import { forwardRef, type ReactNode } from "react";

interface Props {
  /**
   * The word for this action, always — never optional, even when nothing draws it.
   *
   * An icon-only button puts it on `aria-label`, and that is not a politeness: the
   * packaged self-test reaches a control by its accessible name (`--click-button`,
   * `library-window.ts`), so a button whose label exists only as a glyph is a button
   * `--selftest` cannot press and CLAUDE.md's rule about non-menu routes cannot hold for.
   */
  label: string;
  /**
   * The tooltip, when it should say more than the label does. The tree's Rename and
   * Delete use it to name the folder they would act on — `Rename "01 Projecten"` — which
   * is the cheap half of `DESIGN-CRITIQUE.md`'s Finding 6: the verb is in the header and
   * its object may be several rows down the tree, or not visible at all.
   */
  title?: string;
  /** A glyph or a small inline SVG, drawn before the label. */
  icon?: ReactNode;
  /** Draw the icon alone, in a 26px square. `label` still reaches the accessible name. */
  iconOnly?: boolean;
  /** The 20px size, for a `PaneFooter`. */
  small?: boolean;
  /** This button's menu is open: drawn like hover rather than like a chosen state (B78). */
  open?: boolean;
  /** Destructive: the hover colour goes red rather than to the accent. */
  danger?: boolean;
  disabled?: boolean;
  /** `aria-haspopup="menu"` plus the open state, for the three buttons that unfold one. */
  menu?: boolean;
  className?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Every button in either window's chrome.
 *
 * There were seven rules for this before — the tree toolbar's, the note list's New note,
 * the sort chooser's, the search scope's, the reader's Insert and Actions, the capture
 * window's copies of the last two — across four radii, three font sizes and two ideas
 * about what hover means. The shape lives in `.chrome-button` in `styles.css`; this
 * component exists so the three *sizes* cannot multiply either, and so `label` cannot be
 * quietly dropped from an icon-only button.
 */
export const ChromeButton = forwardRef<HTMLButtonElement, Props>(function ChromeButton(
  {
    label,
    title,
    icon,
    iconOnly = false,
    small = false,
    open = false,
    danger = false,
    disabled = false,
    menu = false,
    className,
    onClick,
  },
  ref,
) {
  const classes = [
    "chrome-button",
    iconOnly ? "chrome-button-icon" : null,
    small ? "chrome-button-small" : null,
    open ? "chrome-button-open" : null,
    danger ? "danger" : null,
    className ?? null,
  ].filter((one) => one !== null);

  return (
    <button
      ref={ref}
      type="button"
      className={classes.join(" ")}
      // Only when it is one: `aria-label` on a button that already has visible text is a
      // second name for the same thing, and the two drift.
      aria-label={iconOnly ? label : undefined}
      title={title ?? label}
      aria-haspopup={menu ? "menu" : undefined}
      aria-expanded={menu ? open : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {icon !== undefined && <span className="chrome-glyph">{icon}</span>}
      {!iconOnly && label}
    </button>
  );
});
