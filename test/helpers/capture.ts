import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import type { CaptureApi, ShowPayload, StatusPayload } from "../../src/shared/ipc.js";
import type { OpenedNote, VaultFileEvent } from "../../src/shared/vault-types.js";

/**
 * The capture window's missing harness.
 *
 * Every batch since the disk-change work has closed by saying this window has no test
 * harness. That was two statements in one: it *is* reachable in the real app over CDP
 * (`HISTORY.md`, 15 August 2026), and what it never had is this — a mounted `Capture`
 * against a stubbed `window.emqnote`, the way `test/library-disk-change.test.ts` and
 * `test/library-title-edit.test.ts` have mounted `Library` all along. Nothing about this
 * window ever prevented it; it was simply never pointed at.
 *
 * Mounted for real rather than shallow-rendered, and for the same reason those two give:
 * the interesting bugs in this window are about *state timing* — is `dirtyRef` read at
 * the instant the event arrives, does `session` bump before `HeaderBlock` renders again —
 * and a shallow render answers those by construction.
 *
 * What this cannot answer, and must not be made to fake: jsdom has no layout, so
 * `getBoundingClientRect` is all zeros. The `/` menu flipping above the caret, the table
 * toolbar over a rectangle and `image-resize.ts`'s geometry are unanswerable here — they
 * belong to `scripts/drive-capture.ts`, which now settles the mechanical half of two of
 * them against real boxes, and to a person at a real display for the half that is a
 * judgement (`TEST-PROTOCOL.md` §19b, §19t).
 *
 * Layout is the *only* line, though. Input is not: `typeInBody` types characters the way a
 * browser does and ProseMirror reads them back, input rules and all. This file said
 * otherwise for a week without trying it.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * jsdom's `Range` has no `getClientRects`, and its `Element` does.
 *
 * That inconsistency is the whole reason this is here, and it is not a way of faking
 * layout. jsdom computes no boxes at all: every `Element.getBoundingClientRect()` answers
 * zeros. `Range` simply does not implement the methods, so ProseMirror's `singleRect`
 * throws a `TypeError` rather than reading a zero — and it reaches that line from
 * `scrollToSelection`, which every text-editing transaction sets. So the moment a test
 * types a character into a document that already holds text, an exception escapes
 * `updateState` from inside a MutationObserver callback: an unhandled error, attributed
 * to whichever test happened to be running by then. Twice now this project has chased a
 * failure reported against a test that was not the broken one (`capture-writer.test.ts`'s
 * rename race, `helpers/capture.ts`'s own missing stub members), and this would have been
 * the third.
 *
 * Zeros, then — the same answer jsdom already gives for every element, so nothing here can
 * be mistaken for a real measurement. Where the `/` menu actually lands stays
 * `scripts/drive-capture.ts`'s question and `TEST-PROTOCOL.md` §19t's.
 */
const ZERO_RECT: DOMRect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  toJSON: () => ({}),
};

if (typeof Range !== "undefined" && Range.prototype.getClientRects === undefined) {
  Range.prototype.getClientRects = (): DOMRectList =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = (): DOMRect => ZERO_RECT;
}

export const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

export function openedNote(overrides: Partial<OpenedNote> = {}): OpenedNote {
  return {
    path: "00 Inbox/2026-08-22 1200 Handed over.md",
    title: "Handed over",
    kind: "quick",
    created: "2026-08-22T12:00:00+02:00",
    location: "",
    attendees: [],
    tags: [],
    bodyTags: [],
    doc: EMPTY_DOC,
    editable: true,
    ...overrides,
  };
}

/**
 * The spies a test asserts against.
 *
 * Only the twelve members `Capture.tsx` actually reaches for, plus the three
 * `useBootstrap.ts` and `Editor.tsx` need on mount. Naming them individually rather than
 * handing back the whole stub keeps a test's expectations readable — and keeps it honest
 * about which of them the window is supposed to have called.
 */
export interface CaptureSpies {
  change: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  discard: ReturnType<typeof vi.fn>;
  openLibrary: ReturnType<typeof vi.fn>;
  /**
   * Reached from `attachment-view.ts`, never from `Capture.tsx` — a remote picture that has
   * not loaded is a chip, and clicking a chip raises the browser. The same "cover the
   * children, not just the window" rule the four suggestion endpoints are here for.
   */
  openExternal: ReturnType<typeof vi.fn>;
  painted: ReturnType<typeof vi.fn>;
  pickAttachment: ReturnType<typeof vi.fn>;
  reloadNote: ReturnType<typeof vi.fn>;
}

export interface MountedCapture {
  container: HTMLDivElement;
  spies: CaptureSpies;
  /** Main pushing what main really pushes. Each goes through `act`, so a test can assert straight after. */
  fireShow: (payload?: ShowPayload) => Promise<void>;
  fireReset: () => Promise<void>;
  fireLoad: (note?: OpenedNote) => Promise<void>;
  fireStatus: (payload: StatusPayload) => Promise<void>;
  fireVaultFileChanged: (event: VaultFileEvent) => Promise<void>;
  /** A key on `window`, where `Capture.tsx` listens — not on an element inside it. */
  pressKey: (init: KeyboardEventInit) => Promise<void>;
  /** A key on the editor's own element, where ProseMirror listens. Bubbles to `window` too, exactly as a real one would. */
  pressKeyInBody: (init: KeyboardEventInit) => Promise<void>;
  /** A key on a named element — an overlay that handles its own keys rather than listening on the window. */
  pressKeyOn: (selector: string, init: KeyboardEventInit) => Promise<void>;
  /**
   * Types characters into the note body, the way a browser does it: the text goes into the
   * DOM and ProseMirror reads it back. See `typeInBody` below for why this works at all.
   */
  typeInBody: (text: string) => Promise<void>;
  /** Puts the caret in the note, from wherever the window put it — see `focusBody` below. */
  focusBody: () => Promise<void>;
  /** Puts the window in the state `dirtyRef` describes, through a real edit. See below. */
  makeDirty: () => Promise<void>;
  /** Types into the subject field, the header's own route to `dirtyRef`. Brand-new notes only — a handed-over note has no subject field (B20). */
  typeSubject: (value: string) => Promise<void>;
  /** Types into any header field by selector — `input.tags`, `input.location`, `input.attendees`. */
  typeField: (selector: string, value: string) => Promise<void>;
  /** Clicks a button by its visible text, so a route is reached the way a person reaches it. */
  clickButton: (label: string) => Promise<void>;
  /** Clicks an item in the open `ContextMenu`, matched on its own label element rather than the row's text — the row concatenates the label and the shortcut. */
  clickMenuItem: (label: string) => Promise<void>;
  /** Clicks an item in the open `/` menu — a plain-DOM panel on `document.body`, not a `ContextMenu` (B51). */
  clickSlashItem: (label: string) => Promise<void>;
  /** Picks a size in the open `TableGrid` — one-based, the way the grid counts. */
  clickGridCell: (rows: number, columns: number) => Promise<void>;
  /** Lets pending promises and effects settle, the way `library-disk-change.test.ts` does. */
  flush: (rounds?: number) => Promise<void>;
  /** Waits out real animation frames — `painted()` is deliberately two deep (see `Capture.tsx:228`). */
  nextFrames: (count?: number) => Promise<void>;
  unmount: () => void;
}

export async function mountCapture(
  options: { platform?: NodeJS.Platform; loadRemoteImages?: boolean } = {},
): Promise<MountedCapture> {
  const platform = options.platform ?? "linux";
  // The window reads B50's switch once, at bootstrap, and hands its own copy down to
  // every image node view — which is exactly the wiring `capture-remote-images.test.ts`
  // is about, so it has to be settable from here.
  const loadRemoteImages = options.loadRemoteImages ?? true;

  const spies: CaptureSpies = {
    change: vi.fn(),
    close: vi.fn(),
    discard: vi.fn(),
    openLibrary: vi.fn(),
    openExternal: vi.fn(async () => {}),
    painted: vi.fn(),
    pickAttachment: vi.fn(async () => null),
    reloadNote: vi.fn(async () => {}),
  };

  let showHandler: ((payload: ShowPayload) => void) | null = null;
  let resetHandler: (() => void) | null = null;
  let statusHandler: ((payload: StatusPayload) => void) | null = null;
  let loadHandler: ((note: OpenedNote) => void) | null = null;
  let fileChangedHandler: ((event: VaultFileEvent) => void) | null = null;

  // Deliberately not the whole `CaptureApi`: this window never reaches for `library`, the
  // vault chooser or the conflict endpoints, and a stub listing methods the subject cannot
  // call would only invite a test to assert on one. `Capture.tsx` is typechecked against
  // the real interface; this is the subset the window and its children reach for.
  //
  // "And its children" is the part worth saying out loud, because leaving it out is what
  // broke first: `Capture.tsx` itself never mentions the three suggestion endpoints, but
  // `HeaderBlock` calls them the moment anything is typed into Tags, Where or Who, and an
  // absent one throws out of a `void` promise chain — an unhandled rejection attributed to
  // whichever test happened to be running by then. Empty answers, not spies: what the
  // panels do with a *populated* list is `header-tags`/`header-who`/`header-where`'s job.
  const emqnote = {
    platform,
    onShow: (handler: (payload: ShowPayload) => void) => {
      showHandler = handler;
      return () => {
        showHandler = null;
      };
    },
    onReset: (handler: () => void) => {
      resetHandler = handler;
      return () => {
        resetHandler = null;
      };
    },
    onStatus: (handler: (payload: StatusPayload) => void) => {
      statusHandler = handler;
      return () => {
        statusHandler = null;
      };
    },
    onLoad: (handler: (note: OpenedNote) => void) => {
      loadHandler = handler;
      return () => {
        loadHandler = null;
      };
    },
    onVaultFileChanged: (handler: (event: VaultFileEvent) => void) => {
      fileChangedHandler = handler;
      return () => {
        fileChangedHandler = null;
      };
    },
    // `Editor.tsx` subscribes to the chords main claims ahead of the page
    // (`editor-keys.ts`); nothing here drives them, since `Input.dispatchKeyEvent` and a
    // synthetic `KeyboardEvent` both arrive past `before-input-event` anyway.
    onEditorCommand: () => () => {},
    tagSuggestions: async () => [],
    // Reached from `attachment-view.ts` the moment a `.pdf` embed gets a node view, not
    // from `Capture.tsx`. Null is the honest answer here: there is no pdf.js in jsdom, and
    // the page counter is meant to stay absent rather than guess when nobody knows yet.
    pdfPageCount: async () => null,
    checkAttachments: async () => [],
    peopleSuggestions: async () => [],
    locationSuggestions: async () => [],
    bootstrap: async () => ({
      locale: "en-US" as const,
      platform,
      hotkey: "CommandOrControl+Shift+Y",
      libraryHotkey: "CommandOrControl+Shift+B",
      vaultPath: "/vault",
      libraryPaneWidths: null,
      librarySort: "modified" as const,
      loadRemoteImages,
      keepPinnedInView: false,
    }),
    ...spies,
  };

  (window as unknown as { emqnote: unknown }).emqnote = emqnote;

  // Imported here rather than at the top of the file, and this is load-bearing:
  // `useBootstrap.ts`'s `FALLBACK` reads `window.emqnote.platform` at *module* scope, so
  // importing `Capture` before the stub is installed throws on the import itself. The
  // same dance `test/library-disk-change.test.ts` does in its `beforeAll`, for the same
  // line of code. (`platform` therefore only reaches `FALLBACK` on the first mount in a
  // file; `bootstrap()` supplies it properly on every mount, which is what the window
  // actually renders from.)
  const { Capture } = await import("../../src/renderer/Capture.js");

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(createElement(Capture));
  });

  const flush = async (rounds = 12): Promise<void> => {
    for (let i = 0; i < rounds; i++) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await Promise.resolve();
      });
    }
  };

  await flush();

  const typeField = async (selector: string, value: string): Promise<void> => {
    const input = container.querySelector<HTMLInputElement>(selector);
    if (input === null) throw new Error(`no field matching ${selector}`);
    await act(async () => {
      // React installs its own value setter on the element; going through the prototype's
      // is what makes React see the change, the same dance `library-disk-change.test.ts`
      // does for the title field.
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(
        input,
        value,
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();
  };

  const body = (): HTMLElement => {
    const editable = container.querySelector<HTMLElement>(".ProseMirror");
    if (editable === null) throw new Error("no editor mounted in the capture window");
    return editable;
  };

  return {
    container,
    spies,
    fireShow: async (payload = { token: 1 }) => {
      await act(async () => {
        showHandler?.(payload);
      });
    },
    fireReset: async () => {
      await act(async () => {
        resetHandler?.();
      });
    },
    fireLoad: async (note = openedNote()) => {
      await act(async () => {
        loadHandler?.(note);
      });
    },
    fireStatus: async (payload) => {
      await act(async () => {
        statusHandler?.(payload);
      });
    },
    fireVaultFileChanged: async (event) => {
      await act(async () => {
        fileChangedHandler?.(event);
      });
      await flush();
    },
    pressKey: async (init) => {
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
        );
      });
    },
    pressKeyInBody: async (init) => {
      await act(async () => {
        body().dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
        );
      });
      await flush();
    },
    /**
     * Presses Enter in the note body, through ProseMirror's own `keydown` listener and
     * the real keymap, which splits the block and so dispatches a document-changing
     * transaction — `Editor.tsx:218`'s `dispatchTransaction` then calls `onChange`, which
     * is the only thing that sets `dirtyRef`.
     *
     * A keystroke rather than a flag, deliberately. `dirtyRef` is a private ref with no
     * seam onto it, and adding one for the tests would make every assertion below an
     * assertion about the seam. Enter rather than typed text because a keymap command
     * needs only the event and nothing else — this used to say typed text was unreachable
     * in jsdom, which turned out to be wrong; see `typeInBody` below.
     */
    makeDirty: async () => {
      await act(async () => {
        body().dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      await flush();
    },
    clickButton: async (label) => {
      const match = [...container.querySelectorAll("button")].find(
        (node) => (node.textContent ?? "").trim() === label,
      );
      if (match === undefined) throw new Error(`no button reading ${label}`);
      await act(async () => {
        match.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await flush();
    },
    clickMenuItem: async (label) => {
      const menu = container.querySelector(".context-menu");
      if (menu === null) throw new Error("no menu is open");
      // The label element, not the row: a row's own `textContent` runs the label and its
      // shortcut together, which is the same reason `captureWindowTo`'s `--click-button`
      // matcher reads `.context-menu-label` rather than the button.
      const match = [...menu.querySelectorAll(".context-menu-label")].find(
        (node) => (node.textContent ?? "").trim() === label,
      );
      if (match === undefined) throw new Error(`no menu item reading ${label}`);
      await act(async () => {
        match.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await flush();
    },
    clickSlashItem: async (label) => {
      // Not `container`: B51's panel is plain DOM appended to `document.body` by a
      // ProseMirror plugin, so it is outside the React tree entirely. It draws
      // `ContextMenu`'s two spans under the same class names on purpose — that is what
      // keeps `--click-button` able to reach it — so the label is read the same way.
      const menu = document.querySelector(".slash-menu");
      if (menu === null) throw new Error("the / menu is not open");
      const match = [...menu.querySelectorAll<HTMLElement>(".context-menu-item")].find(
        (node) => (node.querySelector(".context-menu-label")?.textContent ?? "").trim() === label,
      );
      if (match === undefined) throw new Error(`no item reading ${label} in the / menu`);
      await act(async () => {
        match.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      await flush();
    },
    pressKeyOn: async (selector, init) => {
      const target = container.querySelector(selector);
      if (target === null) throw new Error(`nothing matching ${selector} to press a key on`);
      await act(async () => {
        target.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
        );
      });
      await flush();
    },
    /**
     * Types into the note body by writing into the DOM and letting ProseMirror read it
     * back — which is what a browser does, and which turns out to work here.
     *
     * This file used to say character input was unreachable in jsdom, "through
     * `beforeinput` and the DOM observer, neither of which jsdom drives for a
     * `contenteditable`". Half of that was wrong, and it is the half that matters: jsdom
     * implements `MutationObserver`, and ProseMirror's `DOMObserver` is built on it —
     * `readDOMChange` runs, `handleTextInput` fires, input rules apply. What jsdom really
     * lacks is layout, which is a different sentence and the one that stays true. It was
     * never tried; it was inferred from `beforeinput` and written down as settled.
     *
     * A character at a time, and through the *current* DOM selection each time rather than
     * a remembered node, because ProseMirror re-renders between them and the node a
     * previous character went into may no longer be in the document.
     *
     * `Editor.tsx`'s own dispatch runs synchronously inside the observer callback, so
     * `flush()` is all the waiting there is — nothing here waits out a duration.
     */
    /**
     * Gets the caret into the note, by the route a person takes.
     *
     * A brand-new note does not start there: `Capture.tsx:190` focuses the subject field on
     * show, and Enter in any header field is what moves on into the note ("the header
     * should never be a place you get stuck when all you want is to type"). A handed-over
     * note has no subject field at all (B20), and the same line focuses the editor
     * directly, so there is nothing to leave.
     */
    focusBody: async () => {
      if (container.querySelector("input.subject") !== null) {
        const subject = container.querySelector<HTMLInputElement>("input.subject")!;
        await act(async () => {
          subject.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
          );
        });
        await flush();
      }
      const selection = window.getSelection();
      if (
        selection === null ||
        selection.rangeCount === 0 ||
        !body().contains(selection.getRangeAt(0).startContainer)
      ) {
        throw new Error("the caret did not end up in the note body");
      }
    },
    typeInBody: async (text) => {
      for (const character of text) {
        // eslint-disable-next-line no-await-in-loop
        await act(async () => {
          const editable = body();
          const selection = window.getSelection();
          if (selection === null || selection.rangeCount === 0) {
            throw new Error("no caret to type at — show the window first, or click into it");
          }

          const range = selection.getRangeAt(0);
          if (!editable.contains(range.startContainer)) {
            throw new Error("the caret is not in the note body");
          }

          let node: Text;
          let offset: number;
          if (range.startContainer.nodeType === Node.TEXT_NODE) {
            node = range.startContainer as Text;
            offset = range.startOffset;
            node.insertData(offset, character);
          } else {
            // An empty paragraph holds ProseMirror's own trailing `<br>` and no text node
            // at all, so the first character has to make one.
            const parent = range.startContainer as Element;
            node = document.createTextNode(character);
            parent.insertBefore(node, parent.childNodes[range.startOffset] ?? null);
            offset = 0;
          }

          const after = document.createRange();
          after.setStart(node, offset + character.length);
          after.collapse(true);
          selection.removeAllRanges();
          selection.addRange(after);
        });
        // eslint-disable-next-line no-await-in-loop
        await flush();
      }
    },
    clickGridCell: async (rows, columns) => {
      const cells = container.querySelectorAll(".table-grid-cell");
      if (cells.length === 0) throw new Error("no table grid is open");
      // The grid is a square of `MAX` per side laid out in one flow, so the cell for
      // `rows`×`columns` is at the row-major index the component itself computes.
      const side = Math.round(Math.sqrt(cells.length));
      const cell = cells[(rows - 1) * side + (columns - 1)];
      if (cell === undefined) throw new Error(`no ${rows}x${columns} cell in the grid`);
      await act(async () => {
        cell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await flush();
    },
    typeSubject: async (value) => {
      if (container.querySelector("input.subject") === null) {
        throw new Error("no subject field — is this a handed-over note?");
      }
      await typeField("input.subject", value);
    },
    typeField,
    flush,
    nextFrames: async (count = 2) => {
      await act(async () => {
        await new Promise<void>((done) => {
          const step = (left: number): void => {
            if (left === 0) {
              done();
              return;
            }
            requestAnimationFrame(() => step(left - 1));
          };
          step(count);
        });
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
      // B51's panel is appended to `document.body` by a ProseMirror plugin, never into the
      // window's own tree (`styles-overlay.test.ts` says the same of it), so unmounting the
      // React root does not take it with it. A leftover would then be found by the next
      // test in the file, which is the kind of pass nobody wants.
      document.querySelectorAll(".slash-menu").forEach((node) => node.remove());
    },
  };
}
