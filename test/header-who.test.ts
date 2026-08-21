// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HeaderBlock, type HeaderValues } from "../src/renderer/HeaderBlock.js";
import type { Facet } from "../src/shared/vault-types.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * B81 — the Who field completes from the people the vault's notes already name.
 *
 * `header-where.test.ts`'s harness and its division of labour: the ranking and the token
 * maths are `people-typeahead.ts`, tested directly, and this is the half that needs a DOM
 * — when the list is asked for, what a key does to it, and what reaches the field.
 *
 * This file was owed from the moment the feature shipped: v0.10.3 went out with the
 * ranking covered and this half covered by nothing but its likeness to the field beside
 * it. Two of these are about that likeness — three lists must be able to be open at once
 * without sharing a highlight, and Escape here must not travel on to the window.
 */

const VAULT_PEOPLE: Facet[] = [
  { name: "Jan de Vries", count: 12 },
  { name: "Pieter Jansen", count: 7 },
  { name: "Anne Bakker", count: 4 },
];

let container: HTMLDivElement;
let root: Root | null = null;
let peopleSuggestions: ReturnType<typeof vi.fn>;
let tagSuggestions: ReturnType<typeof vi.fn>;
let locationSuggestions: ReturnType<typeof vi.fn>;

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
    created: "2026-08-21T10:00:00+02:00",
    location: "",
    attendees: [],
    tags: [],
    ...overrides,
  };
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  peopleSuggestions = vi.fn().mockResolvedValue(VAULT_PEOPLE);
  tagSuggestions = vi.fn().mockResolvedValue([]);
  locationSuggestions = vi.fn().mockResolvedValue([]);
  (window as unknown as { emqnote: unknown }).emqnote = {
    peopleSuggestions,
    tagSuggestions,
    locationSuggestions,
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

const whoField = (): HTMLInputElement => container.querySelector("input.attendees")!;
const tagField = (): HTMLInputElement => container.querySelector("input.tags")!;
const rows = (): HTMLButtonElement[] => [
  ...container.querySelectorAll<HTMLButtonElement>(".header-who .tag-suggest button"),
];

/** React delegates focus through `focusin`; a `focus` event does not bubble. */
async function focusIn(input: HTMLInputElement): Promise<void> {
  await act(async () => {
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  });
  await settle();
}

async function press(input: HTMLInputElement, key: string): Promise<KeyboardEvent> {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  await act(async () => {
    input.dispatchEvent(event);
  });
  await settle();
  return event;
}

describe("asking for the list", () => {
  it("asks on the field's first focus and not before", async () => {
    // The component is rendered into the capture window long before the hotkey shows it,
    // so asking at mount would put an index query on the path to a hidden window — B66's
    // rule, kept by all three fields.
    await mount();
    expect(peopleSuggestions).not.toHaveBeenCalled();

    await focusIn(whoField());

    expect(peopleSuggestions).toHaveBeenCalledTimes(1);
    expect(rows().map((row) => row.textContent)).toEqual([
      "Jan de Vries12",
      "Pieter Jansen7",
      "Anne Bakker4",
    ]);
  });

  it("asks once per window, however often the field is focused", async () => {
    await mount();
    await focusIn(whoField());
    await act(async () => whoField().dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    await focusIn(whoField());

    expect(peopleSuggestions).toHaveBeenCalledTimes(1);
  });

  it("goes on being a plain text field when there is no answer", async () => {
    // A failure is swallowed into an empty list on purpose: a dialog about a completion
    // nobody asked for would be worse than no completion.
    peopleSuggestions.mockRejectedValue(new Error("no index"));
    await mount();
    await focusIn(whoField());

    expect(rows()).toHaveLength(0);
    expect(whoField().value).toBe("");
  });
});

describe("what is offered", () => {
  it("narrows to the name being typed, across its space", async () => {
    await mount();
    await focusIn(whoField());
    await act(async () => setInputValue(whoField(), "jan vr"));

    expect(rows().map((row) => row.textContent)).toEqual(["Jan de Vries12"]);
  });

  it("completes the name the caret is in, not the whole field", async () => {
    await mount();
    await focusIn(whoField());
    await act(async () => setInputValue(whoField(), "Anne Bakker, pie"));
    whoField().setSelectionRange(16, 16);
    await act(async () => setInputValue(whoField(), "Anne Bakker, pie"));

    expect(rows().map((row) => row.textContent)).toEqual(["Pieter Jansen7"]);
  });

  it("does not offer a name the field already holds", async () => {
    await mount();
    await focusIn(whoField());
    await act(async () => setInputValue(whoField(), "Jan de Vries, "));

    expect(rows().map((row) => row.textContent)).toEqual(["Pieter Jansen7", "Anne Bakker4"]);
  });

  it("offers a name again as soon as it is deleted from the field", async () => {
    // Read off the live text, never off `values.attendees` — which only catches up on
    // blur. That difference is what made the Tags field hide a tag you had just deleted
    // (v0.10.3), and this field was built the other way round because of it.
    await mount({ values: values({ attendees: ["Jan de Vries"] }) });
    await focusIn(whoField());
    // Caret past the separator, so the token being completed is the empty next name
    // rather than the one already written — with the caret *inside* "Jan de Vries" this
    // list correctly narrows to it, which is a different question.
    await act(async () => setInputValue(whoField(), "Jan de Vries, "));
    whoField().setSelectionRange(14, 14);
    await act(async () => setInputValue(whoField(), "Jan de Vries, "));
    expect(rows().map((row) => row.textContent)).toEqual(["Pieter Jansen7", "Anne Bakker4"]);

    await act(async () => setInputValue(whoField(), ""));

    expect(rows().map((row) => row.textContent)).toEqual([
      "Jan de Vries12",
      "Pieter Jansen7",
      "Anne Bakker4",
    ]);
  });
});

describe("the keys", () => {
  it("walks the list with the arrows and accepts with Enter", async () => {
    await mount();
    await focusIn(whoField());
    await press(whoField(), "ArrowDown");
    expect(rows()[0]!.className).toContain("tag-suggest-on");

    await press(whoField(), "Enter");

    // The separator comes with it, ready for the next name.
    expect(whoField().value).toBe("Jan de Vries, ");
  });

  it("leaves for the note when Enter is pressed with nothing highlighted", async () => {
    // The field has always done this and completion must not take it away: the header is
    // never a place you get stuck when all you want is to type.
    const { onLeave } = await mount();
    await focusIn(whoField());
    await act(async () => setInputValue(whoField(), "Karel Smit"));
    await press(whoField(), "Enter");

    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("keeps the names either side of the one it replaces", async () => {
    await mount();
    await focusIn(whoField());
    await act(async () => setInputValue(whoField(), "Karel Smit, pie, Anne Bakker"));
    whoField().setSelectionRange(15, 15);
    await act(async () => setInputValue(whoField(), "Karel Smit, pie, Anne Bakker"));
    await press(whoField(), "ArrowDown");
    await press(whoField(), "Enter");

    expect(whoField().value).toBe("Karel Smit, Pieter Jansen, Anne Bakker");
  });

  it("closes on Escape without the press going any further", async () => {
    // `preventDefault()` does not end an event. Without `stopPropagation` the same press
    // also runs the library window's Escape branch and jumps out of the header — one
    // press, two things, which is the 18 August 2026 rule.
    await mount();
    await focusIn(whoField());
    expect(rows()).not.toHaveLength(0);

    const seen = vi.fn();
    window.addEventListener("keydown", seen);
    await press(whoField(), "Escape");
    window.removeEventListener("keydown", seen);

    expect(rows()).toHaveLength(0);
    expect(seen).not.toHaveBeenCalled();
  });

  it("leaves its rows out of the Tab order", async () => {
    // The list sits between this input and whatever follows it. Asserted as a property of
    // the rows because jsdom implements no sequential focus navigation at all — a test
    // that pressed Tab would pass whatever the markup said.
    await mount();
    await focusIn(whoField());

    expect(rows()).not.toHaveLength(0);
    expect(rows().every((row) => row.tabIndex === -1)).toBe(true);
  });
});

describe("beside the other two lists", () => {
  it("keeps its own highlight when the Tags list is open as well", async () => {
    // Tab moves from Tags to Where to Who without any of them losing focus first, so more
    // than one panel can be up at once. One shared `active` would move the highlight in a
    // panel nobody is looking at.
    tagSuggestions.mockResolvedValue([{ name: "klantx", count: 24 }]);
    await mount();
    await focusIn(tagField());
    await focusIn(whoField());
    await press(whoField(), "ArrowDown");

    expect(rows()[0]!.className).toContain("tag-suggest-on");
    expect(
      container.querySelectorAll(".header-tags .tag-suggest button.tag-suggest-on"),
    ).toHaveLength(0);
  });

  it("commits the field when it is left, exactly as it did before it completed", async () => {
    const { onChange } = await mount();
    await focusIn(whoField());
    await act(async () => setInputValue(whoField(), "Anne Bakker, Karel Smit"));
    await act(async () => whoField().dispatchEvent(new FocusEvent("focusout", { bubbles: true })));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ attendees: ["Anne Bakker", "Karel Smit"] }),
    );
  });
});
