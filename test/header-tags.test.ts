// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HeaderBlock, type HeaderValues } from "../src/renderer/HeaderBlock.js";
import type { Facet } from "../src/shared/vault-types.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The Tags field's two new jobs: showing the note's own `#tag`s beside it (B65) and
 * completing from the vault's list (B66).
 *
 * The ranking itself is not tested here — it is `tag-typeahead.ts`, tested directly, and
 * this is about the half that needs a DOM: when the list is asked for, what a key does to
 * it, and what reaches `onChange`.
 */

const VAULT_TAGS: Facet[] = [
  { name: "klantx", count: 24 },
  { name: "klachten", count: 2 },
  { name: "offerte", count: 7 },
];

let container: HTMLDivElement;
let root: Root | null = null;
let tagSuggestions: ReturnType<typeof vi.fn>;

/** A controlled React input ignores a plain `.value` assignment — see `note-picker.test.ts`. */
function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function values(overrides: Partial<HeaderValues> = {}): HeaderValues {
  return {
    kind: "quick",
    subject: "",
    created: "2026-08-18T10:00:00+02:00",
    location: "",
    attendees: [],
    tags: [],
    ...overrides,
  };
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  tagSuggestions = vi.fn().mockResolvedValue(VAULT_TAGS);
  (window as unknown as { emqnote: { tagSuggestions: typeof tagSuggestions } }).emqnote = {
    tagSuggestions,
  };
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

async function mount(props: Partial<Parameters<typeof HeaderBlock>[0]> = {}) {
  const onChange = vi.fn();
  const onLeave = vi.fn();

  root = createRoot(container);
  await act(async () => {
    root!.render(
      createElement(HeaderBlock, {
        values: values(),
        onChange,
        onLeave,
        locale: "en-US" as const,
        t: (key: string) => key,
        ...props,
      }),
    );
  });

  return { onChange, onLeave };
}

const tagField = (): HTMLInputElement => container.querySelector("input.tags")!;
const rows = (): HTMLButtonElement[] => [
  ...container.querySelectorAll<HTMLButtonElement>(".tag-suggest button"),
];

/**
 * React delegates focus at its root through `focusin`, not `focus` — a `focus` event does
 * not bubble, so dispatching one reaches no `onFocus` prop at all and the field looks as
 * if it never asked main for anything.
 */
async function focusField(): Promise<void> {
  await act(async () => {
    tagField().dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  });
  await settle();
}

describe("the body tags beside the field", () => {
  it("draws a chip for each, and does not put them in the field", async () => {
    // B65: the field owns what it writes; these are removed in the note, so they are
    // shown but not editable here.
    await mount({ bodyTags: ["klantx", "q3"] });

    expect([...container.querySelectorAll(".tag-chip")].map((c) => c.textContent)).toEqual([
      "#klantx",
      "#q3",
    ]);
    expect(tagField().value).toBe("");
  });

  it("draws the field's own tags in the field", async () => {
    await mount({ values: values({ tags: ["offerte"] }), bodyTags: ["klantx"] });
    expect(tagField().value).toBe("#offerte");
  });

  it("collapses everything past the third into one chip, names in its tooltip", async () => {
    // The cell is a flex row and the field is the only thing in it that shrinks, so an
    // unbounded chip row left the Tags input at zero width — a box you could not see and
    // could not type in. The count is capped here and the floor is `.header-tags .tags`'
    // `min-width` in the stylesheet; neither alone is enough.
    await mount({
      bodyTags: ["klantx", "q3", "klachten", "offerte", "intern"],
      // The harness's `t` hands the key straight back, which would leave the placeholders
      // untested — this is the real English string.
      t: (key: string) =>
        key === "capture.tagsMore" ? "{count} more in this note: {tags}" : key,
    });

    const chips = [...container.querySelectorAll(".tag-chip")];
    expect(chips.map((c) => c.textContent)).toEqual(["#klantx", "#q3", "#klachten", "+2"]);
    // Dropped names would be worse than the crowding this fixes.
    expect(chips.at(-1)!.getAttribute("title")).toBe("2 more in this note: #offerte #intern");
  });
});

describe("the raw typing buffer", () => {
  it("belongs to one note, and a keyed remount is what enforces that", async () => {
    // The field keeps its own text while you type, so a separator survives being typed —
    // and nothing inside the component knows when the note underneath it changes. Both
    // callers therefore give it a `key`. Measured in the running app without one: a note
    // whose `tags: [klantx, offerte, klachten]` were replaced by the three characters
    // left in the field from a different note, committed on the next blur.
    const onChange = vi.fn();
    root = createRoot(container);

    const render = (key: string, tags: string[]) =>
      act(() => {
        root!.render(
          createElement(HeaderBlock, {
            key,
            values: values({ tags }),
            onChange,
            onLeave: vi.fn(),
            locale: "en-US" as const,
            t: (k: string) => k,
          }),
        );
      });

    render("note-a", []);
    await act(async () => setInputValue(tagField(), "#kla"));
    expect(tagField().value).toBe("#kla");

    // The other note arrives, and its own tags are what the field shows.
    render("note-b", ["klantx", "offerte"]);
    expect(tagField().value).toBe("#klantx #offerte");

    // And a blur now commits that note's tags, not the leftovers.
    await act(async () => {
      tagField().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ tags: ["kla"] }));
  });
});

describe("completing a tag", () => {
  it("asks main only once the field is focused", async () => {
    // Never on mount: this component is rendered into the capture window long before the
    // hotkey shows it, and an IPC round trip there is what the 80 ms budget is measured
    // against.
    await mount();
    expect(tagSuggestions).not.toHaveBeenCalled();

    await focusField();
    expect(tagSuggestions).toHaveBeenCalledTimes(1);
  });

  it("asks once per window, not once per focus", async () => {
    await mount();
    await focusField();
    await focusField();
    expect(tagSuggestions).toHaveBeenCalledTimes(1);
  });

  it("narrows to what has been typed", async () => {
    await mount();
    await focusField();

    await act(async () => setInputValue(tagField(), "#kl"));
    expect(rows().map((r) => r.textContent)).toEqual(["#klantx24", "#klachten2"]);
  });

  it("completes the token the caret is in, leaving the others alone", async () => {
    await mount();
    await focusField();

    await act(async () => setInputValue(tagField(), "#offerte #kl"));
    await act(async () => rows()[0]!.click());

    expect(tagField().value).toBe("#offerte #klantx ");
  });

  it("Enter accepts the highlighted row instead of leaving for the note", async () => {
    const { onLeave } = await mount();
    await focusField();
    await act(async () => setInputValue(tagField(), "#kl"));

    await act(async () => {
      tagField().dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });
    await act(async () => {
      tagField().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(tagField().value).toBe("#klantx ");
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("Enter still commits and leaves when no row is highlighted", async () => {
    const { onChange, onLeave } = await mount();
    await focusField();
    await act(async () => setInputValue(tagField(), "#klantx"));

    await act(async () => {
      tagField().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onLeave).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tags: ["klantx"] }));
  });

  it("Escape closes the list and stops the key going any further", async () => {
    // `preventDefault()` does not end an event. Without `stopPropagation` the same press
    // also runs the library window's Escape branch and jumps out of the header — one
    // press, two things.
    await mount();
    await focusField();
    await act(async () => setInputValue(tagField(), "#kl"));
    expect(rows()).not.toHaveLength(0);

    const seen = vi.fn();
    window.addEventListener("keydown", seen);
    await act(async () => {
      tagField().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    window.removeEventListener("keydown", seen);

    expect(rows()).toHaveLength(0);
    expect(seen).not.toHaveBeenCalled();
  });

  it("leaves the rows out of the Tab order, so Tab reaches Where", async () => {
    // The list sits between its own input and the next field in DOM order and is open
    // from the moment the field is focused, so tabbable rows meant one Tab moved into the
    // first row, blur closed the list and unmounted the button holding focus, and the
    // press after that started from the top of the document — the reported "extra Tab".
    //
    // Asserted as a property of the rows rather than by pressing Tab: jsdom implements no
    // sequential focus navigation at all, so a Tab keydown moves nothing there and a test
    // that dispatched one would pass whatever this markup said.
    await mount();
    await focusField();

    expect(rows()).not.toHaveLength(0);
    expect(rows().every((row) => row.tabIndex === -1)).toBe(true);
  });

  it("does not offer a tag the field already holds", async () => {
    await mount({ values: values({ tags: [] }), bodyTags: [] });
    await focusField();
    await act(async () => setInputValue(tagField(), "#klantx #kl"));

    // `#klantx` is in the field, so completing to it would write nothing. `#kl` — the
    // token the caret is in — is excluded from that check, or a half-typed tag would
    // disappear from its own list.
    expect(rows().map((r) => r.textContent)).toEqual(["#klachten2"]);
  });

  it("offers a tag again once it is deleted from the field", async () => {
    // The reported bug, and the reason `applied` is read off the live text rather than
    // off `values.tags`. That array is the *committed* one — `commitTags` runs on blur or
    // Enter and not before — so a tag deleted from the field went on being filtered out
    // of the vault's own list until the field was left and re-entered. Twenty other notes
    // still carry it; the field is not where that is decided.
    await mount({ values: values({ tags: ["klantx"] }), bodyTags: [] });
    await focusField();
    await act(async () => setInputValue(tagField(), "#offerte #kl"));

    expect(rows().map((r) => r.textContent)).toEqual(["#klantx24", "#klachten2"]);
  });

  it("does not offer a tag the note body already carries", async () => {
    // It is already on the note — B65 hoists it into the frontmatter on save — so
    // completing the field to it would write nothing, and the chip saying so is drawn an
    // inch to the left. The first version of this offered it, and it read as the same
    // tag twice on one row.
    await mount({ bodyTags: ["klantx"] });
    await focusField();
    await act(async () => setInputValue(tagField(), "#kl"));

    expect(rows().map((r) => r.textContent)).toEqual(["#klachten2"]);
  });
});
