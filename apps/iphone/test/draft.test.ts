import { describe, expect, it } from "vitest";
import { parseNote, serializeBody } from "@emqnote/core/markdown";
import { buildOutboxItem } from "../src/capture.js";
import {
  ACTIVE_DRAFT_KEY,
  OUTBOX_KEY,
  attendeeNames,
  clearDraft,
  createdValue,
  enqueue,
  freshDraft,
  loadDraft,
  loadOutbox,
  localDateTimeValue,
  storeDraft,
  type DraftStorage,
} from "../src/draft.js";

function memoryStorage(): DraftStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

describe("active capture draft", () => {
  it("starts with the current editable local time", () => {
    const now = new Date(2026, 7, 20, 14, 32, 5);
    expect(freshDraft(now)).toEqual({
      version: 1,
      title: "",
      when: "2026-08-20T14:32:05",
      where: "",
      who: "",
      body: "",
    });
    expect(localDateTimeValue(now)).toBe("2026-08-20T14:32:05");
  });

  it("persists and restores exactly one active draft", () => {
    const storage = memoryStorage();
    const draft = { ...freshDraft(), title: "Call Els", body: "One line\n" };
    storeDraft(storage, draft);
    expect(loadDraft(storage)).toEqual(draft);
    clearDraft(storage);
    expect(loadDraft(storage)).toBeNull();
  });

  it("ignores malformed or old storage instead of crashing launch", () => {
    const storage = memoryStorage();
    storage.setItem(ACTIVE_DRAFT_KEY, "not json");
    expect(loadDraft(storage)).toBeNull();
    storage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify({ version: 0, title: "old" }));
    expect(loadDraft(storage)).toBeNull();
  });
});

describe("capture field conversion", () => {
  it("keeps an offset on the created value", () => {
    expect(createdValue("2026-08-20T14:32:05")).toMatch(
      /^2026-08-20T14:32:05[+-]\d{2}:\d{2}$/,
    );
  });

  it("splits Who on commas and semicolons", () => {
    expect(attendeeNames(" Els Bakker, Jo ; ; Mia ")).toEqual(["Els Bakker", "Jo", "Mia"]);
  });
});

describe("local outbox", () => {
  it("appends the exact serialized bytes without changing earlier items", () => {
    const storage = memoryStorage();
    const first = {
      id: "one",
      filename: "2026-08-20 1432 One.md",
      bytes: "---\ntitle: One\n---\n",
      queuedAt: "2026-08-20T12:32:00.000Z",
    };
    const second = { ...first, id: "two", filename: "2026-08-20 1433 Two.md" };
    enqueue(storage, first);
    enqueue(storage, second);
    expect(loadOutbox(storage)).toEqual([first, second]);
    expect(JSON.parse(storage.getItem(OUTBOX_KEY)!)[0].bytes).toBe(first.bytes);
  });

  it("constructs desktop-compatible bytes once before enqueueing", () => {
    const draft = {
      ...freshDraft(new Date(2026, 7, 20, 14, 32, 5)),
      title: "Follow up with Els",
      where: " Teams ",
      who: "Els Bakker; Jo",
      body: "Discussed #planning.\n\n- [ ] Send the dates\n",
    };
    const item = buildOutboxItem(
      draft,
      parseNote(draft.body).doc,
      "capture-one",
      new Date("2026-08-20T12:33:00.000Z"),
    );

    expect(item).not.toBeNull();
    expect(item!.filename).toBe("2026-08-20 1432 Follow up with Els.md");
    const note = parseNote(item!.bytes);
    expect(note.frontmatter).toEqual({
      title: "Follow up with Els",
      type: "quick",
      created: expect.stringMatching(/^2026-08-20T14:32:05[+-]\d{2}:\d{2}$/),
      location: "Teams",
      attendees: ["Els Bakker", "Jo"],
      tags: ["planning"],
      source: "manual",
    });
    expect(serializeBody(note.doc)).toBe(draft.body);
  });
});
