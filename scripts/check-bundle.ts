/**
 * Controleert dat de gebouwde bundels niets uit node_modules verwachten.
 *
 *   npm run check:bundle
 *
 * Waarom dit bestaat: electron-vite externaliseert standaard álles wat in
 * `dependencies` van package.json staat. Het pakket bevat dan een
 * `import ... from "prosemirror-model"` zonder dat die map is meegeleverd, en de app
 * valt bij het starten om met ERR_MODULE_NOT_FOUND.
 *
 * Dat is precies één keer gebeurd, en het viel niet op omdat de verpakte app werd
 * getest vanuit de projectmap — waar node_modules toevallig wél stond. Deze controle
 * is statisch en snel, en vangt het af zonder dat er een venster open hoeft.
 *
 * De imports worden met een echte ESM-parser gelezen en niet met een reguliere
 * expressie: de eerste versie sloeg alarm op een `import {unified} from 'unified'` in
 * een JSDoc-commentaar.
 */
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { init, parse } from "es-module-lexer";

/** Alleen deze mogen ongebundeld blijven: Electron zelf en de Node-ingebouwden. */
const ALLOWED = new Set([
  "electron",
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

/** Voor scoped pakketten telt scope plus naam als eenheid. */
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
 * Het preload-script is CJS en dus niet met de ESM-parser te lezen. Het is een handvol
 * regels waarin alleen `require("electron")` hoort voor te komen; commentaarblokken
 * gaan er eerst uit zodat een JSDoc-voorbeeld niet meetelt.
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
    console.error(`✗ ${path} bestaat niet — is er wel gebouwd?`);
    failures += 1;
    continue;
  }

  const external = scan(source);
  if (external.size === 0) {
    console.log(`✓ ${path} is zelfstandig`);
    continue;
  }

  console.error(
    `✗ ${path} verwacht node_modules bij het draaien: ${[...external].sort().join(", ")}`,
  );
  console.error(
    "  Zet die pakketten in devDependencies, of neem ze bewust mee in electron-builder.yml.",
  );
  failures += 1;
}

process.exit(failures === 0 ? 0 : 1);
