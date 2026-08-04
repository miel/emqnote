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
import { readdirSync, readFileSync, type Dirent } from "node:fs";
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

/**
 * Every file the main build emits, not just its entry points.
 *
 * The main process is two entries since the scan moved into a worker (§7.2), and rollup
 * puts what they share in a chunk beside them. Checking only the entries would then pass
 * while the bare import sat one `import "./chunk-abc.js"` away — the exact failure this
 * script exists to catch, hidden by the indirection.
 */
function mainBundleFiles(directory = "out/main"): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return ["out/main/index.js"]; // Not built: let the read below report it as missing.
  }

  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...mainBundleFiles(path));
    else if (entry.name.endsWith(".js")) files.push(path);
  }
  return files;
}

/** Relative specifiers only — where a chunk's own imports point, resolved against it. */
function localImports(path: string, source: string): string[] {
  const base = path.slice(0, path.lastIndexOf("/"));
  const [imports] = parse(source);

  return imports
    .map((entry) => entry.n)
    .filter((specifier): specifier is string => specifier?.startsWith(".") === true)
    .map((specifier) => {
      const parts = `${base}/${specifier}`.split("/");
      const resolved: string[] = [];
      for (const part of parts) {
        if (part === "." || part === "") continue;
        if (part === "..") resolved.pop();
        else resolved.push(part);
      }
      return resolved.join("/");
    });
}

/**
 * The worker runs on a plain Node thread, where Electron's own modules do not exist.
 *
 * `scan-worker.ts` and everything it reaches were written Electron-free on purpose, but
 * what actually reaches the worker at runtime is a rollup chunk, and which modules land
 * in a chunk is rollup's decision, not the source tree's. One new import in a module the
 * two entries happen to share would put `electron` in front of the worker and it would
 * fail to load — recoverably (`scan-host.ts` falls back to the main thread) and
 * silently enough to be noticed only as "the scan got slow again". Cheaper to fail here.
 */
function checkWorkerIsElectronFree(): boolean {
  const queue = ["out/main/scan-worker.js"];
  const seen = new Set<string>();
  const offenders: string[] = [];

  while (queue.length > 0) {
    const path = queue.pop()!;
    if (seen.has(path)) continue;
    seen.add(path);

    const source = read(path);
    if (source === null) {
      console.error(`✗ ${path} does not exist — has it been built?`);
      return false;
    }

    if (parse(source)[0].some((entry) => entry.n === "electron")) offenders.push(path);

    queue.push(...localImports(path, source));
  }

  if (offenders.length > 0) {
    console.error(`✗ the scan worker reaches Electron via: ${offenders.sort().join(", ")}`);
    console.error(
      "  A worker thread has no Electron modules. Keep what the worker imports Electron-free,",
    );
    console.error("  or the scan silently falls back to the main thread (scan-host.ts).");
    return false;
  }

  console.log(`✓ out/main/scan-worker.js reaches no Electron module (${seen.size} files)`);
  return true;
}

await init;

let failures = 0;

for (const [path, scan] of [
  ...mainBundleFiles().map((path) => [path, externalsInEsm] as const),
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

if (!checkWorkerIsElectronFree()) failures += 1;

process.exit(failures === 0 ? 0 : 1);
