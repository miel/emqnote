import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

/**
 * Alles wordt gebundeld; er hoeft geen node_modules mee.
 *
 * Dat houdt de uitgepakte map zelfstandig — precies wat je wilt als je hem via
 * OneDrive naar een werkmachine kopieert waar je niets mag installeren — en het
 * omzeilt de ESM/CJS-resolutie waar remark en prosemirror anders tegenaan lopen.
 *
 * **Let op:** electron-vite externaliseert standaard álles wat in `dependencies` van
 * package.json staat. Dat is de reden dat die lijst daar leeg is en de bouwpakketten
 * in `devDependencies` staan. `external` hieronder is de tweede grendel op dezelfde
 * deur, en `npm run check:bundle` is de derde: die faalt als er tóch een bare import
 * in de bundel belandt.
 *
 * Het preload-script blijft CJS: een sandboxed preload kan geen ESM laden, en de
 * sandbox willen we aan houden.
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
