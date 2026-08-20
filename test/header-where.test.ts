// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HeaderBlock, type HeaderValues } from "../src/renderer/HeaderBlock.js";
import type { Facet } from "../src/shared/vault-types.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * B73 — the Where field completes from the locations the vault has already used.
 *
 * `header-tags.test.ts`'s harness and its division of labour: the ranking is
 * `location-typeahead.ts`, tested directly, and this is the half that needs a DOM — when
 * the list is asked for, what a key does to it, and what reaches `onChange`.
 *
 * Two of these are about the Tags field as much as this one: the two lists must be able to
 * be open at once without sharing a highlight, and Escape here must not travel on to the
 * window (the 18 August 2026 rule), or closing the list also leaves the header.
 */

const VAULT_LOCATIONS: Facet[] = [
  { name: "Teams", count: 12 },
  { name: "Kantoor Amsterdam", count: 7 },
  { name: "Kantoor Utrecht", count: 4 },
];

let container: HTMLDivElement;
let root: Root | null = null;
let locationSuggestions: ReturnType<typeof vi.fn>;
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
    created: "2026-08-19T10:00:00+02:00",
    location: "",
    attendees: [],
    tags: [],
    ...overrides,
  };
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  locationSuggestions = vi.fn().mockResolvedValue(VAULT_LOCATIONS);
  tagSuggestions = vi.fn().mockResolvedValue([]);
  (window as unknown as { emqnote: unknown }).emqnote = { locationSuggestions, tagSuggestions };
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

const whereField = (): HTMLInputElement => container.querySelector("input.location")!;
const tagField = (): HTMLInputElement => container.querySelector("input.tags")!;
const rows = (): HTMLButtonElement[] => [
  ...container.querySelectorAll<HTMLButtonElement>(".header-where .tag-suggest button"),
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
    // This component is rendered into the capture window long before the hotkey shows it,
    // so asking at mount would put an index query on the path to a hidden window — B66's
    // rule, and the reason the Tags field asks where it does.
    await mount();
    expect(locationSuggestions).not.toHaveBeenCalled();

    await focusIn(whereField());

    expect(locationSuggestions).toHaveBeenCalledTimes(1);
    expect(rows().map((row) => row.textContent)).toEqual([
      "Teams12",
      "Kantoor Amsterdam7",
      "Kantoor Utrecht4",
    ]);
  });

  it("asks once per window, however often the field is focused", async () => {
    await mount();
    await focusIn(whereField());
    await act(async () => whereField().dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    await focusIn(whereField());

    expect(locationSuggestions).toHaveBeenCalledTimes(1);
  });

  it("goes on working as a plain field when the ask fails", async () => {
    // A dialog about a completion nobody asked for would be worse than no completion.
    locationSuggestions.mockRejectedValue(new Error("no index"));
    const { onChange } = await mount();
    await focusIn(whereField());

    expect(rows()).toHaveLength(0);
    await act(async () => setInputValue(whereField(), "Teams"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ location: "Teams" }));
  });

  it("narrows to what has been typed, matching across a space", async () => {
    await mount({ values: values({ location: "kantoor a" }) });
    await focusIn(whereField());

    expect(rows().map((row) => row.querySelector(".context-menu-label")!.textContent)).toEqual([
      "Kantoor Amsterdam",
    ]);
  });
});

describe("choosing one", () => {
  it("puts the whole value in the field, replacing what was typed", async () => {
    const { onChange } = await mount({ values: values({ location: "kant" }) });
    await focusIn(whereField());

    await act(async () => rows()[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ location: "Kantoor Utrecht" }),
    );
  });

  it("prevents the row's mousedown, so blur cannot beat the click", async () => {
    await mount();
    await focusIn(whereField());

    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    await act(async () => rows()[0]!.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
  });

  it("walks the rows with the arrows and takes one on Enter", async () => {
    const { onChange, onLeave } = await mount();
    await focusIn(whereField());

    await press(whereField(), "ArrowDown");
    await press(whereField(), "ArrowDown");
    const enter = await press(whereField(), "Enter");

    expect(enter.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ location: "Kantoor Amsterdam" }),
    );
    // Enter took the suggestion; it did not also leave for the note.
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("still leaves for the note on Enter with nothing highlighted", async () => {
    const { onLeave } = await mount();
    await focusIn(whereField());

    await press(whereField(), "Enter");

    expect(onLeave).toHaveBeenCalled();
  });
});

describe("getting out of the list", () => {
  it("closes on Escape and keeps the typed text exactly where it was", async () => {
    const { onChange } = await mount({ values: values({ location: "kant" }) });
    await focusIn(whereField());
    expect(rows().length).toBeGreaterThan(0);

    const escape = await press(whereField(), "Escape");

    expect(rows()).toHaveLength(0);
    expect(whereField().value).toBe("kant");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stops that Escape from travelling on to the window", async () => {
    // `preventDefault()` does not end an event. Without `stopPropagation` the same press
    // also runs `Library.tsx`'s window-level Escape and jumps out of the header entirely —
    // one press, two things, which is the 18 August 2026 rule.
    await mount();
    await focusIn(whereField());

    const seen = vi.fn();
    window.addEventListener("keydown", seen);
    await press(whereField(), "Escape");
    window.removeEventListener("keydown", seen);

    expect(seen).not.toHaveBeenCalled();
  });

  it("lets an Escape through when there is no list to close", async () => {
    await mount();

    const seen = vi.fn();
    window.addEventListener("keydown", seen);
    await press(whereField(), "Escape");
    window.removeEventListener("keydown", seen);

    expect(seen).toHaveBeenCalled();
  });
});

describe("the two completing fields together", () => {
  it("keeps its own list, its own highlight and its own request", async () => {
    // Tab moves from Tags to Where without either field losing focus in between, so both
    // panels can be up at once; one shared `active` would move the highlight in a panel
    // nobody is looking at.
    await mount();
    await focusIn(tagField());
    await focusIn(whereField());

    await press(whereField(), "ArrowDown");

    expect(rows()[0]!.className).toContain("tag-suggest-on");
    expect(
      container.querySelectorAll(".header-tags .tag-suggest button.tag-suggest-on"),
    ).toHaveLength(0);
    expect(tagSuggestions).toHaveBeenCalledTimes(1);
    expect(locationSuggestions).toHaveBeenCalledTimes(1);
  });
});
