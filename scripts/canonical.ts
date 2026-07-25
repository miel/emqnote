/**
 * Toont hoe de serializer een bestand zou schrijven, met de afwijkingen erbij.
 *
 *   npm run canonical -- test/corpus/24-vergadernotitie.md
 *
 * Bedoeld om een verschil te kúnnen beoordelen, niet om het weg te poetsen: als het
 * corpus afwijkt, is dat óf een fout in het corpus óf een fout in de serializer, en
 * dat onderscheid is een besluit.
 */
import { readFileSync } from "node:fs";
import { parseNote, serializeNote } from "../src/markdown/index.js";

const path = process.argv[2];
if (path === undefined) {
  console.error("Gebruik: npm run canonical -- <pad naar .md>");
  process.exit(2);
}

const original = readFileSync(path, "utf8");
const canonical = serializeNote(parseNote(original));

if (canonical === original) {
  console.log(`${path}: bytegelijk`);
  process.exit(0);
}

const originalLines = original.split("\n");
const canonicalLines = canonical.split("\n");

console.log(`${path}: wijkt af\n`);
for (let index = 0; index < Math.max(originalLines.length, canonicalLines.length); index += 1) {
  const before = originalLines[index];
  const after = canonicalLines[index];
  if (before === after) continue;
  if (before !== undefined) console.log(`  ${String(index + 1).padStart(4)} - ${JSON.stringify(before)}`);
  if (after !== undefined) console.log(`  ${String(index + 1).padStart(4)} + ${JSON.stringify(after)}`);
}

console.log("\n--- canoniek ---");
console.log(canonical);
