import { nativeTheme } from "electron";

/**
 * The colour Chromium paints before the renderer's first frame lands.
 *
 * Both windows hardcoded `#1e1f22` — the dark theme's page colour — and never asked which
 * theme the OS was in, so on a light-mode machine every window opened with a dark flash
 * before the CSS arrived. That was mildly wrong when the light page was `#fbfbfc`; it is
 * plainly wrong now B87 has made it `#ffffff`, because the flash is the full distance
 * between the two themes.
 *
 * The two values are `--background` from `styles.css`, restated here because a main-process
 * file cannot read a stylesheet. They are the one duplication the token system cannot
 * remove, so they are named in one place rather than in two window files, and
 * `styles-surfaces.test.ts` pins that the pair still matches the sheet.
 *
 * Read once, at construction. No `nativeTheme.on("updated")` listener: this colour is only
 * ever seen in the moment before the first paint, and the capture window is created hidden
 * at startup and shown by the hotkey — touching it later is on the path with the < 80 ms
 * budget, for a colour nobody will be looking at.
 */
export const windowBackground = (): string =>
  nativeTheme.shouldUseDarkColors ? "#1e1f22" : "#ffffff";

/**
 * The colours Windows 11 draws its own caption buttons in, so they sit inside the 40px
 * header band instead of on a strip of their own (`titleBarOverlay`).
 *
 * `--surface` and `--text` from `styles.css`, restated here for `windowBackground`'s
 * reason and pinned by the same test: a main-process file cannot read a stylesheet, so
 * this is the one duplication the token system cannot remove.
 *
 * Unlike the background above, this one *is* re-read: it is on screen for as long as the
 * window is, so `applyTheme` in `index.ts` pushes it to both windows whenever the theme
 * source changes (B90). Nothing here is on the hotkey's path — the capture window is
 * already built and hidden by then.
 */
export const titleBarColours = (): { color: string; symbolColor: string } =>
  nativeTheme.shouldUseDarkColors
    ? { color: "#26282c", symbolColor: "#e8e9ec" }
    : { color: "#eef0f2", symbolColor: "#1e2226" };
