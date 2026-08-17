import { app } from "electron";
import { LOGIN_FLAG } from "./launch-options.js";

/**
 * Registers (or clears) the login item, always with the flag that identifies it.
 *
 * One function, in a module of its own, because two callers set this — startup and the
 * tray's "Start at login" checkbox — and the tray used to call `setLoginItemSettings`
 * directly. That would have been fine while the only field was `openAtLogin`; the moment
 * the entry carries an argument, a second call site that does not know about it rewrites
 * the entry without it, and the app is back to being unable to tell a sign-in from a
 * double-click. The same hazard B21 documents for the vault switch, in miniature.
 *
 * `args` is what B61 rests on. Nothing else about the process distinguishes the two
 * launches: on Windows the Run entry is a plain command line, and without a flag on it
 * there is no signal to read. macOS additionally reports `wasOpenedAtLogin`, which is read
 * alongside this rather than instead of it — an entry registered by an older version
 * carries no flag until it is rewritten, and it is only rewritten by the two calls here.
 */
export function applyLoginItem(openAtLogin: boolean): void {
  app.setLoginItemSettings({ openAtLogin, args: [LOGIN_FLAG] });
}
