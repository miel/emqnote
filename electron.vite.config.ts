import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

/**
 * Everything is bundled; no node_modules needs to ship.
 *
 * That keeps the unpacked folder self-contained — exactly what you want when copying
 * it over OneDrive to a work machine where you cannot install anything — and it side-
 * steps the ESM/CJS resolution that remark and prosemirror otherwise run into.
 *
 * **Note:** electron-vite externalises *everything* listed in package.json's
 * `dependencies` by default. That is why that list stays minimal on purpose — see the
 * `//dependencies` note there — and the build packages live in `devDependencies`
 * instead. The `external` below is the second lock on the same door, and
 * `npm run check:bundle` is the third: it fails if a bare import ends up in the bundle
 * after all.
 *
 * The preload script stays CJS: a sandboxed preload cannot load ESM, and we want to
 * keep the sandbox on.
 */
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // Two entries: the main process, and the scan worker it starts (§7.2). A worker
        // needs a file of its own to point at, and it has to sit next to `index.js` —
        // `scan-host.ts` resolves it relative to itself. What the two share (the parser,
        // the index, `vault-io.ts`) rollup puts in a chunk both import; `check:bundle`
        // walks every file emitted here, not just the entries, for that reason.
        input: {
          index: "src/main/index.ts",
          "scan-worker": "src/main/scan-worker.ts",
        },
        // electron-updater and better-sqlite3 both do dynamic requires that don't
        // survive bundling — better-sqlite3's is how it locates its native `.node`
        // binary, so it could not be bundled even in principle. Both ship instead via
        // electron-builder.yml's dependency walk (package.json `dependencies`).
        external: ["electron", "electron-updater", "better-sqlite3"],
        output: { format: "es", entryFileNames: "[name].js" },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        // Three entries: the capture/library bridge, and one each for the two windows
        // that parse a PDF — the hidden render window (B36) and the viewer (B40). Both of
        // those expose exactly the two channels they need, deliberately not the whole
        // `emqnote` bridge, since a PDF is untrusted input passing through them.
        input: {
          index: "src/preload/index.ts",
          thumb: "src/preload/thumb.ts",
          pdfview: "src/preload/pdfview.ts",
        },
        external: ["electron"],
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    build: {
      minify: "esbuild",
      // Four windows, four entries. The capture window stays as small as it can be —
      // it is the one that has to appear instantly — so the library window's tree,
      // list and dialogs are not loaded into it, and pdf.js sits in the two entries that
      // actually run it, `thumb` (B36) and `pdfview` (B40), rather than in either of the
      // note windows: neither of those ever runs it directly, and pdf.js is not a small
      // library. That is also why the viewer is written against the DOM rather than in
      // React — nothing in it needs a component tree, and this entry has no other reason
      // to carry one.
      rollupOptions: {
        input: {
          capture: "src/renderer/index.html",
          library: "src/renderer/library.html",
          thumb: "src/renderer/thumb.html",
          pdfview: "src/renderer/pdfview.html",
        },
      },
    },
    plugins: [react()],
  },
});
