import { describe, expect, it } from "vitest";
import { parseFrontmatter, serializeFrontmatter } from "@emqnote/core/markdown/frontmatter";
import { parseNote, serializeNote } from "@emqnote/core/markdown";

/**
 * B75's `pinned:` — the one frontmatter field that is a type rather than a shape.
 *
 * Every other field goes out through `emitScalar`, which quotes anything that would come
 * back as something other than a string. A boolean sent that way lands in the file as
 * `pinned: "true"` — a string that happens to spell a boolean, which then reads back as
 * "not pinned" the next time anything asks. `test/corpus/31-vastgeprikt.md` pins the bytes
 * of a note that carries one; this pins the field's own behaviour, including the cases a
 * corpus file cannot show because they leave no trace.
 */
describe("pinned in the frontmatter", () => {
  const base = { title: "Iets", type: "quick" as const, created: "2026-08-20T09:40:00+02:00" };

  it("is written as a real boolean", () => {
    expect(serializeFrontmatter({ ...base, pinned: true })).toContain("pinned: true");
    expect(serializeFrontmatter({ ...base, pinned: true })).not.toContain('"true"');
  });

  it("is absent entirely from a note that is not pinned", () => {
    // Not `pinned: false`. Every note in the vault would otherwise gain a line the first
    // time it was saved, to say something about a feature it is not using.
    expect(serializeFrontmatter(base)).not.toContain("pinned");
  });

  it("comes back as a boolean, not as a string", () => {
    expect(parseFrontmatter("title: Iets\ntype: quick\npinned: true").pinned).toBe(true);
    expect(parseFrontmatter("title: Iets\ntype: quick").pinned).toBeUndefined();
  });

  it("round-trips an explicit false, rather than quietly dropping it", () => {
    // Nothing in this app writes one, but a hand-edited note may carry it, and a field
    // that is silently deleted is a file changed by being opened (B10's neighbourhood).
    const parsed = parseFrontmatter("title: Iets\ntype: quick\npinned: false");
    expect(parsed.pinned).toBe(false);
    expect(serializeFrontmatter(parsed)).toContain("pinned: false");
  });

  it("hands back anything that is not a boolean exactly as it came", () => {
    // `pinned: yes` is a string in YAML 1.2, not a boolean. Guessing what it meant would
    // be writing to a file this app did not understand, so it goes back out untouched —
    // which is what `extra` is for.
    const parsed = parseFrontmatter("title: Iets\ntype: quick\npinned: misschien");
    expect(parsed.pinned).toBeUndefined();
    expect(parsed.extra?.pinned).toBe("misschien");
    expect(serializeFrontmatter(parsed)).toContain("pinned: misschien");
  });

  it("survives a whole-note round trip", () => {
    const file = `---\ntitle: Iets\ntype: quick\ncreated: 2026-08-20T09:40:00+02:00\npinned: true\n---\n\nTekst.\n`;
    expect(serializeNote(parseNote(file))).toBe(file);
  });
});
