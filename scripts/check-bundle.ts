/**
 * Verifies the built bundles expect nothing from node_modules.
 *
 *   npm run check:bundle
 *
 * Why this exists: electron-vite externalises *everything* listed in package.json's
 * `dependencies` by default. The package then contains an
 * `import ... from "prosemirror-model"` without that folder being shipped, and the app
 * dies on startup with ERR_MODULE_NOT_FOUND.
 *
 * That happened exactly once, and it went unnoticed because the packaged app was
 * tested from the project directory — where node_modules happened to be present. This
 * check is static and fast, and catches it without a window having to open.
 *
 * Imports are read with a real ESM parser rather than a regular expression: the first
 * version raised the alarm on an `import {unified} from 'unified'` inside a JSDoc
 * comment.
 */
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { init, parse } from "es-module-lexer";

/** Only these may stay unbundled: Electron itself and the Node built-ins. */
const ALLOWED = new Set([
  "electron",
  // Shipped via package.json `dependencies` + electron-builder's dependency walk, not
  // bundled — see the comment on `external` in electron.vite.config.ts.
  "electron-updater",
  "better-sqlite3",
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

/** For scoped packages, scope plus name is the unit that counts. */
function packageRoot(specifier: string): string {
  return specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0]!;
}

function read(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function externalsInEsm(source: string): Set<string> {
  const [imports] = parse(source);
  const external = new Set<string>();

  for (const entry of imports) {
    const specifier = entry.n;
    if (specifier === undefined) continue;
    if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
    const root = packageRoot(specifier);
    if (!ALLOWED.has(root)) external.add(root);
  }

  return external;
}

/**
 * The preload script is CJS and therefore not readable with the ESM parser. It is a
 * handful of lines in which only `require("electron")` should appear; comment blocks
 * are stripped first so a JSDoc example does not count.
 */
function externalsInCjs(source: string): Set<string> {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const external = new Set<string>();

  for (const match of stripped.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    const specifier = match[1]!;
    if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
    const root = packageRoot(specifier);
    if (!ALLOWED.has(root)) external.add(root);
  }

  return external;
}

await init;

let failures = 0;

for (const [path, scan] of [
  ["out/main/index.js", externalsInEsm],
  ["out/preload/index.cjs", externalsInCjs],
] as const) {
  const source = read(path);
  if (source === null) {
    console.error(`✗ ${path} does not exist — has it been built?`);
    failures += 1;
    continue;
  }

  const external = scan(source);
  if (external.size === 0) {
    console.log(`✓ ${path} is self-contained`);
    continue;
  }

  console.error(
    `✗ ${path} expects node_modules at runtime: ${[...external].sort().join(", ")}`,
  );
  console.error(
    "  Move those packages to devDependencies, or ship them deliberately via electron-builder.yml.",
  );
  failures += 1;
}

process.exit(failures === 0 ? 0 : 1);
