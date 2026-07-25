import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

/**
 * Het main-proces wordt volledig gebundeld in plaats van naar node_modules te
 * verwijzen. Dat houdt de uitgepakte map zelfstandig — precies wat je wilt als je hem
 * via OneDrive naar een werkmachine kopieert waar je niets mag installeren — en het
 * omzeilt de ESM/CJS-resolutie waar remark en prosemirror anders tegenaan lopen.
 *
 * Het preload-script blijft CJS: een sandboxed preload kan geen ESM laden, en de
 * sandbox willen we aan houden.
 */
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: "src/main/index.ts",
        output: { format: "es", entryFileNames: "[name].js" },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: "src/preload/index.ts",
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
