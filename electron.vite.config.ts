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
 * `dependencies` by default. That is why that list is empty and the build packages
 * live in `devDependencies`. The `external` below is the second lock on the same door,
 * and `npm run check:bundle` is the third: it fails if a bare import ends up in the
 * bundle after all.
 *
 * The preload script stays CJS: a sandboxed preload cannot load ESM, and we want to
 * keep the sandbox on.
 */
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: "src/main/index.ts",
        external: ["electron"],
        output: { format: "es", entryFileNames: "[name].js" },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: "src/preload/index.ts",
        external: ["electron"],
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    build: {
      minify: "esbuild",
      rollupOptions: { input: "src/renderer/index.html" },
    },
    plugins: [react()],
  },
});
