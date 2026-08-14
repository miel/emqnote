// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { NotePicker } from "../src/renderer/library/NotePicker.js";
import type { LinkCandidateSummary } from "../src/shared/vault-types.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The note picker (B41): what it asks main for, and what it hands back when a row is
 * chosen.
 *
 * The filtering itself is deliberately *not* tested here, because it deliberately does not
 * happen here — unlike `MoveDialog`, which scores a list it was handed, this asks
 * `linkCandidates` on every keystroke and renders whatever comes back. A vault has
 * thousands of notes and the index already answers this with FTS5. So what is worth
 * pinning is the contract with main, not a ranking this component does not own.
 */

const CANDIDATES: LinkCandidateSummary[] = [
  {
    path: "01 Projecten/2026-08-08 0900 Spelregels.md",
    title: "Spelregels",
    folder: "01 Projecten",
    target: "01 Projecten/2026-08-08 0900 Spelregels",
  },
  {
    path: "2026-08-01 1200 Losse notitie.md",
    title: "Losse notitie",
    folder: "",
    target: "2026-08-01 1200 Losse notitie",
  },
];

let container: HTMLDivElement;
let root: Root | null = null;
let linkCandidates: ReturnType<typeof vi.fn>;

/**
 * Types into a *controlled* React input. Assigning `.value` directly does not work:
 * React installs its own value tracker on the element and treats an unchanged tracked
 * value as "no change", so the `input` event arrives and `onChange` never fires. Same
 * helper, same reason, as `library-title-edit.test.ts`.
 */
function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Lets the 150 ms debounce elapse and the answer's `.then()` chain settle. */
async function settle(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(200);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);

  linkCandidates = vi.fn().mockResolvedValue(CANDIDATES);
  (window as unknown as { emqnote: { linkCandidates: typeof linkCandidates } }).emqnote = {
    linkCandidates,
  };
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.useRealTimers();
});

async function mount(props: Partial<Parameters<typeof NotePicker>[0]> = {}) {
  const onPick = vi.fn();
  const onCancel = vi.fn();

  root = createRoot(container);
  await act(async () => {
    root!.render(
      createElement(NotePicker, {
        initialQuery: "",
        onPick,
        onCancel,
        t: (key: string) => key,
        ...props,
      }),
    );
  });
  await settle();

  return { onPick, onCancel };
}

describe("NotePicker", () => {
  it("asks main for everything when nothing is typed", async () => {
    await mount();

    // A blank query is a normal call, not a special case: `searchNotes` already answers
    // it with the whole vault, so opening the picker shows what there is.
    expect(linkCandidates).toHaveBeenCalledWith("");
    expect(container.querySelectorAll(".palette-list li")).toHaveLength(2);
  });

  it("seeds the filter with the words that were selected", async () => {
    await mount({ initialQuery: "spelregels" });
    expect(linkCandidates).toHaveBeenCalledWith("spelregels");
    expect(container.querySelector("input")!.value).toBe("spelregels");
  });

  it("shows the folder beside the title, which is what tells two notes apart", async () => {
    await mount();
    const rows = [...container.querySelectorAll(".palette-list li")];

    expect(rows[0]!.querySelector(".palette-primary")!.textContent).toBe("Spelregels");
    expect(rows[0]!.querySelector(".palette-secondary")!.textContent).toBe("01 Projecten");
    // A note in the vault root has no folder name to show, so it says so.
    expect(rows[1]!.querySelector(".palette-secondary")!.textContent).toBe("library.vaultRoot");
  });

  it("hands back the whole candidate, target included, when a row is clicked", async () => {
    const { onPick } = await mount();

    await act(async () => {
      container.querySelectorAll<HTMLElement>(".palette-list li")[1]!.click();
    });

    // The target is the point: it is what goes into the document, and only main can
    // compute it (B37 decides what a note extension is).
    expect(onPick).toHaveBeenCalledWith(CANDIDATES[1]);
  });

  it("picks the active row on Enter and moves it with the arrows", async () => {
    const { onPick } = await mount();
    const input = container.querySelector("input")!;

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onPick).toHaveBeenCalledWith(CANDIDATES[1]);
  });

  it("cancels on Escape and on a click outside", async () => {
    const { onCancel } = await mount();

    await act(async () => {
      container
        .querySelector("input")!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);

    await act(async () => {
      container
        .querySelector(".overlay")!
        .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("says so rather than showing an empty box when nothing matches", async () => {
    linkCandidates.mockResolvedValue([]);
    await mount({ initialQuery: "nothing like this" });

    expect(container.querySelector(".palette-empty")!.textContent).toBe("link.noNoteMatch");
  });

  /**
   * The list has always had `max-height: 46vh; overflow-y: auto`, and nothing ever
   * scrolled it — focus stays in the filter box, so a highlight arrowed past the bottom
   * edge simply walked on out of sight. jsdom implements no scrolling at all, which is
   * why this stubs the method rather than measuring a `scrollTop`: what is worth pinning
   * is that the *row that just became active* is the one asked to come into view.
   */
  it("scrolls the row the arrow keys land on into view", async () => {
    const scrollIntoView = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView =
      scrollIntoView;

    await mount();
    const input = container.querySelector("input")!;
    scrollIntoView.mockClear();

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // `nearest`, so a row already on screen is left exactly where it is — the mouse sets
    // `active` too, and a list that re-centred on hover would twitch under the pointer.
    expect(scrollIntoView.mock.calls[0]![0]).toEqual({ block: "nearest" });
    expect(scrollIntoView.mock.instances[0]).toBe(
      container.querySelectorAll(".palette-list li")[1],
    );

    delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("debounces, so a typed word is one question and not five", async () => {
    await mount();
    linkCandidates.mockClear();

    const input = container.querySelector("input")!;
    for (const value of ["s", "sp", "spe", "spel"]) {
      await act(async () => {
        setInputValue(input, value);
        vi.advanceTimersByTime(20);
      });
    }
    await settle();

    expect(linkCandidates).toHaveBeenCalledTimes(1);
    expect(linkCandidates).toHaveBeenCalledWith("spel");
  });
});
