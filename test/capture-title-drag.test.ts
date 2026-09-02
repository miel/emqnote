// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { mountCapture, openedNote, type MountedCapture } from "./helpers/capture.js";

/**
 * Moving the capture window by its title band (B94).
 *
 * The library's reader has had this since B94 — press and travel moves the window, press
 * and release opens the rename — and `test/library-title-edit.test.ts` pins that half.
 * This window is the same problem with one state fewer and one state harder: a
 * handed-over note's title is a plain `<h2>` inside the band, so it drags with no help at
 * all, and a brand-new note's is an `<input>` that has to be `no-drag` to be typed into —
 * which, since the field is the only thing in the band, left the whole 40px strip
 * ungrabbable.
 *
 * What can be asked here is which messages a press sends, and that is the whole of the
 * renderer's side: main owns the position (`IPC.windowDrag`), and jsdom has neither
 * `-webkit-app-region` nor a window that can be moved. Whether the window actually ends
 * up somewhere else is `scripts/drive-capture.ts`'s step, with a real pointer.
 */

describe("dragging the capture window by its title", () => {
  let capture: MountedCapture;

  afterEach(() => {
    capture.unmount();
  });

  /** One press on the subject field, travelling `dx`/`dy` screen pixels before it lets go. */
  async function pressAndTravel(dx: number, dy: number): Promise<void> {
    const subject = capture.container.querySelector<HTMLInputElement>("input.subject");
    if (subject === null) throw new Error("no subject field to press on");
    await act(async () => {
      subject.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0, screenX: 300, screenY: 100 }),
      );
      window.dispatchEvent(new MouseEvent("mousemove", { screenX: 300 + dx, screenY: 100 + dy }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
    });
    await capture.flush();
  }

  it("asks main to move the window when the press travels", async () => {
    capture = await mountCapture();
    await capture.fireShow();

    await pressAndTravel(60, 40);

    // From where the press was, not from where the threshold was crossed: the window has
    // to keep the grip it was picked up by, or it jumps on the first move.
    expect(capture.spies.dragWindow.mock.calls).toEqual([
      ["start", 300, 100],
      ["move", 360, 140],
    ]);
  });

  it("does not move it when the press barely travels, as a hand on a trackpad does", async () => {
    capture = await mountCapture();
    await capture.fireShow();

    await pressAndTravel(2, 1);

    expect(capture.spies.dragWindow).not.toHaveBeenCalled();
  });

  it("leaves the field typeable — a press is still a press on a text field", async () => {
    capture = await mountCapture();
    await capture.fireShow();

    await pressAndTravel(60, 0);
    await capture.typeSubject("Board meeting");

    expect(capture.container.querySelector<HTMLInputElement>("input.subject")?.value).toBe(
      "Board meeting",
    );
  });

  it("only picks the window up by the left button", async () => {
    capture = await mountCapture();
    await capture.fireShow();

    const subject = capture.container.querySelector<HTMLInputElement>("input.subject")!;
    await act(async () => {
      // A right-click is a context menu and a middle click is nothing here; neither
      // should pick the window up.
      subject.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 2, screenX: 300, screenY: 100 }),
      );
      window.dispatchEvent(new MouseEvent("mousemove", { screenX: 360, screenY: 140 }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
    });
    await capture.flush();

    expect(capture.spies.dragWindow).not.toHaveBeenCalled();
  });

  it("needs nothing at all for a handed-over note: its title is a plain heading (B20)", async () => {
    // The band is the window's grab area and a heading in it carries no `no-drag`, so
    // Chromium moves the window itself. This asserts the shape that makes that true —
    // there is no field in the band to swallow the press — which is why the handler above
    // exists for exactly one of this window's two states.
    capture = await mountCapture();
    await capture.fireLoad(openedNote({ title: "Handed over" }));
    await capture.flush();

    expect(capture.container.querySelector("input.subject")).toBeNull();
    expect(capture.container.querySelector(".pane-header .pane-title")?.textContent).toBe(
      "Handed over",
    );
  });
});
