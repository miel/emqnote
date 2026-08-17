import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

/**
 * Why `updater.ts` reaches electron-updater through `require` and not through
 * `await import(…)`.
 *
 * This is the shape of a real shipped bug: `checkWindows` destructured `autoUpdater` off a
 * dynamic `import("electron-updater")`, got `undefined`, and threw on the next line — so
 * "Check for updates…" did nothing at all on Windows, for every release since B22. macOS
 * never noticed because `checkMac` is a plain `fetch` and this is the only code in the app
 * that loads electron-updater at all.
 *
 * The cause is not in this source tree: electron-updater is CJS, and `autoUpdater` is its
 * one export written as a lazy `Object.defineProperty(exports, "autoUpdater", { get })`
 * rather than a plain assignment. Node synthesises a CJS module's named ESM exports with
 * `cjs-module-lexer`, which does not recognise that shape — so of the package's eighteen
 * exports, the single one this app needs is the one missing from the namespace.
 *
 * **The first case runs in a real `node` subprocess on purpose, and that is the whole
 * lesson.** Under vitest the import goes through Vite's own CJS interop, which builds the
 * namespace by *reading the exports object* — so `autoUpdater` is right there, the
 * assertion passes, and the packaged app still does nothing. A test written the obvious
 * way here would have asserted the bug away. Same family as B36's trailing slash and B40's
 * missing `corsEnabled`: a property of the runtime, not of the source.
 *
 * If electron-updater ever exports `autoUpdater` plainly, the first case fails and
 * `loadAutoUpdater` can become an ordinary import.
 */
describe("electron-updater's autoUpdater export", () => {
  it("is absent from real Node's ESM namespace, which is why a destructured import is empty", () => {
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        'const ns = await import("electron-updater");' +
          'console.log(JSON.stringify(Object.keys(ns)));',
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const keys = JSON.parse(output) as string[];

    expect(keys).not.toContain("autoUpdater");
    // Named exports written the ordinary way survive, so the failure is specific rather
    // than the package being unreachable from ESM at all.
    expect(keys).toEqual(expect.arrayContaining(["AppUpdater", "NsisUpdater", "MacUpdater"]));
  });

  it("is present on the CJS exports object, which is the way updater.ts reads it", () => {
    const require = createRequire(import.meta.url);
    const exports = require("electron-updater") as object;

    // `in`, never a property read: the getter constructs an AppUpdater, which asks
    // Electron for the app version and there is no Electron here.
    expect("autoUpdater" in exports).toBe(true);
  });
});
