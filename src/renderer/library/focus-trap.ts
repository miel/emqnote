/**
 * Every modal's entire Tab handling, in one place rather than written out seven times.
 *
 * `Ask.tsx`, `MoveDialog.tsx`, `Settings.tsx`, `Help.tsx`,
 * `LinkPrompt.tsx` and `ContextMenu.tsx` each call this from their own container's
 * `onKeyDown`. Tab should only ever cycle among the focusable elements the dialog itself
 * contains — never escape to the page (or the editor) behind it — and Shift+Tab from the
 * first one should wrap to the last rather than walking out the front.
 *
 * Deliberately not a `useEffect`-installed native listener: every caller already has its
 * own `onKeyDown` for Escape, so this is one more line in that same handler rather than a
 * second lifecycle to keep in step with the first.
 */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function trapTab(event: React.KeyboardEvent, container: HTMLElement | null): void {
  if (event.key !== "Tab" || container === null) return;

  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const current = document.activeElement;

  if (event.shiftKey && current === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && current === last) {
    event.preventDefault();
    first.focus();
  }
  // Otherwise leave the browser's own Tab movement alone — every candidate it could land
  // on is still inside `container`, so nothing outside it is reachable either way.
}
