// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilterSection } from "../src/renderer/library/FilterSection.js";
import type { Facet, Selection } from "../src/shared/vault-types.js";

/**
 * The three things the Tags list has to do when a selection arrives from somewhere other
 * than a click on one of its own rows — a `#tag` Mod+clicked in a note (B52) being the
 * only such route today, and the reason all three are properties of the section rather
 * than something its caller arranges.
 *
 * jsdom rather than `renderToStaticMarkup`: two of the three are about what happens
 * *after* a re-render with a new `selected`.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Enough entries to exceed `SHOWN`, busiest first as `ranked()` hands them over. */
const MANY: Facet[] = Array.from({ length: 60 }, (_, index) => ({
  name: `tag${String(index).padStart(2, "0")}`,
  count: 60 - index,
}));

const FEW: Facet[] = [
  { name: "klantx", count: 4 },
  { name: "offerte", count: 2 },
];

const PEOPLE: Facet[] = [{ name: "Jan Jansen", count: 3 }];

let container: HTMLDivElement;
let root: Root;
let onExpand: ReturnType<typeof vi.fn>;
let onSelect: ReturnType<typeof vi.fn>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  onExpand = vi.fn();
  onSelect = vi.fn();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render(
  selected: Selection,
  facets: Facet[] = FEW,
  kind: "tag" | "person" = "tag",
): void {
  act(() => {
    root.render(
      createElement(FilterSection, {
        kind,
        label: kind === "tag" ? "Tags" : "People",
        glyph: kind === "tag" ? "#" : "◍",
        facets,
        available: true,
        selected,
        onSelect,
        onExpand,
        activeRow: "section:tag",
        onActivate: () => {},
        emptyLabel: "Nothing found",
        unavailableLabel: "Unavailable",
        filterLabel: "Filter",
      }),
    );
  });
}

/** The rows inside the list, by the text they show. */
function rowNames(): string[] {
  return [...container.querySelectorAll("li .branch-name")].map((node) => node.textContent ?? "");
}

/**
 * Clicks the section's own heading — the row carrying "Tags"/"People", which is the
 * first `.branch` in the section and, unlike the facet rows, is not inside an `<li>`.
 */
function collapse(): void {
  const heading = container.querySelector(".filter-section > .branch") as HTMLElement;
  act(() => {
    heading.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function selectedRowName(): string | null {
  const row = container.querySelector("li .branch.branch-on");
  return row?.querySelector(".branch-name")?.textContent ?? null;
}

describe("FilterSection unfolds itself for a selection of its own kind", () => {
  it("starts collapsed for a folder selection, and asks for nothing", () => {
    render({ kind: "folder", path: "00 Inbox" });

    expect(rowNames()).toEqual([]);
    // Load-bearing: unfolding is what triggers the vault's first scan, so a library that
    // opens on a folder must not pay for it.
    expect(onExpand).not.toHaveBeenCalled();
  });

  it("opens and asks for the facets when a tag becomes the selection", () => {
    render({ kind: "folder", path: "00 Inbox" });
    render({ kind: "tag", name: "klantx" });

    expect(rowNames()).toEqual(["#klantx", "#offerte"]);
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("leaves the People list folded when the selection is a tag", () => {
    render({ kind: "tag", name: "klantx" }, PEOPLE, "person");

    expect(rowNames()).toEqual([]);
    expect(onExpand).not.toHaveBeenCalled();
  });

  it("does not re-ask once it is already open", () => {
    render({ kind: "tag", name: "klantx" });
    render({ kind: "tag", name: "offerte" });

    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("stays collapsed when it is folded away with the tag still selected", () => {
    // The rule is "unfold when a selection arrives", not "stay unfolded while one is
    // set". Written as its own test because the difference is invisible until you try to
    // close the section: with `open` in the effect's dependency list, collapsing changed
    // a dependency, the effect re-ran against the same tag, and it re-opened on the same
    // commit — the list could not be folded away at all while it was filtering.
    render({ kind: "tag", name: "klantx" });
    expect(rowNames()).toEqual(["#klantx", "#offerte"]);

    collapse();
    expect(rowNames()).toEqual([]);

    // And it survives the parent re-rendering with that same tag still selected, which
    // happens on every keystroke in the reader.
    render({ kind: "tag", name: "klantx" });
    expect(rowNames()).toEqual([]);
  });

  it("unfolds again when a different tag arrives after it was folded away", () => {
    render({ kind: "tag", name: "klantx" });
    collapse();
    render({ kind: "tag", name: "offerte" });

    expect(rowNames()).toEqual(["#klantx", "#offerte"]);
    // Asked again, exactly as `toggle` asks again when the section is reopened by hand:
    // an unfold is an unfold, and `loadFacets` on the other end is idempotent.
    expect(onExpand).toHaveBeenCalledTimes(2);
  });
});

describe("FilterSection highlights the selected facet", () => {
  it("matches a tag regardless of how it was capitalised in the note", () => {
    // `#KlantX` in a body and `klantx` in this list are one tag to `notesMatching`; two
    // strings to `selectionKey`. Without the fold the list would filter correctly while
    // lighting nothing, which reads as the filter not having been applied.
    render({ kind: "tag", name: "KlantX" });

    expect(selectedRowName()).toBe("#klantx");
  });

  it("still lights nothing for a tag the vault does not have", () => {
    render({ kind: "tag", name: "nietbestaand" });

    expect(selectedRowName()).toBeNull();
  });

  it("matches a person exactly, as it always did", () => {
    render({ kind: "person", name: "Jan Jansen" }, PEOPLE, "person");

    expect(selectedRowName()).toBe("Jan Jansen");
  });
});

describe("FilterSection never hides the tag that is doing the filtering", () => {
  it("shows one ranked past the cap, at the top", () => {
    // `tag59` is the least used of sixty, so it falls outside `SHOWN`.
    render({ kind: "tag", name: "tag59" }, MANY);

    expect(rowNames()).toHaveLength(51);
    expect(rowNames()[0]).toBe("#tag59");
    expect(selectedRowName()).toBe("#tag59");
  });

  it("shows one the filter box would otherwise cut", () => {
    render({ kind: "tag", name: "tag07" }, MANY);

    const box = container.querySelector("input.filter-search") as HTMLInputElement;
    expect(box).not.toBeNull();

    // React tracks the last value it wrote, so assigning `.value` directly reads as "no
    // change" and `onChange` never fires. Same helper, same reason, as `note-picker.test.ts`.
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(box, "tag5");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // The query answered with the fifties; `tag07` is not among them, and yet it is the
    // tag the note list is filtered by — so it stays, at the top, and stays clickable to
    // get back out of.
    expect(rowNames()).toContain("#tag50");
    expect(rowNames()[0]).toBe("#tag07");
    expect(selectedRowName()).toBe("#tag07");
  });
});
