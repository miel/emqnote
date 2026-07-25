/**
 * Shows how the serializer would write a file, with the differences alongside.
 *
 *   npm run canonical -- test/corpus/24-vergadernotitie.md
 *
 * Meant to let you *judge* a difference, not to paper over it: if the corpus differs,
 * either the corpus or the serializer is wrong, and telling those apart is a decision.
 */
import { readFileSync } from "node:fs";
import { parseNote, serializeNote } from "../src/markdown/index.js";

const path = process.argv[2];
if (path === undefined) {
  console.error("Usage: npm run canonical -- <path to .md>");
  process.exit(2);
}

const original = readFileSync(path, "utf8");
const canonical = serializeNote(parseNote(original));

if (canonical === original) {
  console.log(`${path}: byte-identical`);
  process.exit(0);
}

const originalLines = original.split("\n");
const canonicalLines = canonical.split("\n");

console.log(`${path}: differs\n`);
for (let index = 0; index < Math.max(originalLines.length, canonicalLines.length); index += 1) {
  const before = originalLines[index];
  const after = canonicalLines[index];
  if (before === after) continue;
  if (before !== undefined) console.log(`  ${String(index + 1).padStart(4)} - ${JSON.stringify(before)}`);
  if (after !== undefined) console.log(`  ${String(index + 1).padStart(4)} + ${JSON.stringify(after)}`);
}

console.log("\n--- canonical ---");
console.log(canonical);
