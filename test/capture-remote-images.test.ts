// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mountCapture, openedNote, type MountedCapture } from "./helpers/capture.js";
import { spyOnImageSrc } from "./helpers/image-probe.js";
import { docFromMarkdown } from "./helpers/editing.js";

/**
 * A picture from the web (B50) in the capture window.
 *
 * What each layer does with one is settled elsewhere and is not repeated: `remote-image`
 * holds the allowlist, `remote-images` what `serveRemoteImage` refuses, `remote-cache` the
 * naming, and `attachment-view` the node view's own two states. The open item is the one
 * `TODO.md` has carried since 14 August 2026 — none of it had ever been exercised *in this
 * window*, and the setting has a route through it that exists nowhere else.
 *
 * That route is the point. `loadRemoteImages` is read once at bootstrap, kept by the
 * window, and handed down to every image node view — and the reason the renderer holds a
 * copy at all is a measurement rather than a preference: main refuses correctly when the
 * switch is off, but Chromium answers a *repeat* of a URL it has already drawn out of its
 * own image cache without going near the protocol handler, `no-store` and all, so a note
 * reopened after switching it off went on showing its pictures. A window that failed to
 * pass the setting down would put that bug straight back, with main still looking correct.
 *
 * The half that is not here, and is not simulated: whether the picture then *decodes*.
 * jsdom loads nothing, so the probe never fires its `load` and the chip never becomes a
 * picture. `scripts/drive-capture.ts` asserts `naturalWidth !== 0` on a real one in this
 * very window, which is the assertion four features spent months without.
 */

const NOTE = "Zie het schema:\n\n![](https://cdn.example.com/plan.png)\n";
/** What `remoteImageKey`'s scheme makes of that address — the whole URL, encoded, as one segment. */
const SERVED = "emqnote-remote://vault/https%3A%2F%2Fcdn.example.com%2Fplan.png";

describe("a web picture in the capture window", () => {
  let capture: MountedCapture;
  let probes: ReturnType<typeof spyOnImageSrc>;

  afterEach(() => {
    probes.restore();
    capture.unmount();
  });

  async function open(loadRemoteImages: boolean, markdown = NOTE): Promise<void> {
    // Patched before the mount: the node view builds its probe the moment the document
    // reaches the editor, which is inside `fireLoad`.
    probes = spyOnImageSrc();
    capture = await mountCapture({ loadRemoteImages });
    await capture.fireLoad(openedNote({ doc: docFromMarkdown(markdown).toJSON() }));
  }

  it("draws the chip first, labelled with the host it would come from", async () => {
    await open(true);

    const chip = capture.container.querySelector(".external-image");
    expect(chip).not.toBeNull();
    // The chip is what is drawn first and what stays if anything goes wrong — a refusal in
    // main, the setting off, or being offline on a cold cache all end here, with no flash
    // of a broken image to undo.
    expect(chip!.textContent).toBe("cdn.example.com");
    expect(chip!.getAttribute("title")).toBe("https://cdn.example.com/plan.png");
  });

  it("asks main for it exactly once, over emqnote-remote:// (B50)", async () => {
    await open(true);

    // Never the `https://` address itself: this window's CSP allows no remote host in
    // `img-src` at all, so a node view that took the short cut would draw nothing here and
    // the vault would never get its copy.
    expect(probes.seen).toEqual([SERVED]);
  });

  it("asks for nothing at all when the switch is off, in this window too", async () => {
    await open(false);

    expect(probes.seen).toEqual([]);
    // Still a chip, and still the address on it — the setting turns off the asking, not
    // the note's own record of what is meant to be there.
    expect(capture.container.querySelector(".external-image")!.textContent).toBe(
      "cdn.example.com",
    );
  });

  it("sends a data: address the same way round, which only this window forces", async () => {
    await open(true, "![](data:image/png;base64,AAA)\n");

    // `index.html`'s CSP allows no `data:` in `img-src`; `library.html`'s does. So the
    // short cut of putting the address straight into the `<img>` would draw in the reader
    // and quietly fail here — which is the one asymmetry between the two windows that this
    // whole path exists to remove. Through main it is decoded, sniffed and capped like any
    // other picture.
    expect(probes.seen).toEqual(["emqnote-remote://vault/data%3Aimage%2Fpng%3Bbase64%2CAAA"]);
  });

  it("opens the chip's own address in the browser on a plain click", async () => {
    await open(true);

    const chip = capture.container.querySelector(".external-image")!;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    chip.dispatchEvent(click);

    // A chip is a thing you can follow, not a thing you can only look at — the same as
    // every other chip in a note, and the reason `openExternal` has to be reachable from
    // this window at all.
    expect(click.defaultPrevented).toBe(true);
    expect(capture.spies.openExternal).toHaveBeenCalledWith("https://cdn.example.com/plan.png");
  });

  it("asks once per picture and no more, however many a note holds", async () => {
    await open(
      true,
      "![](https://cdn.example.com/plan.png)\n\n![](https://cdn.example.com/tweede.png)\n",
    );

    expect(probes.seen).toEqual([
      SERVED,
      "emqnote-remote://vault/https%3A%2F%2Fcdn.example.com%2Ftweede.png",
    ]);
  });

  it("leaves an attachment in the vault alone — that is not this path", async () => {
    await open(true, "![[Pasted image 20260822.png]]\n");

    // A `wikiEmbed`, drawn by `attachmentNodeView` and served over
    // `emqnote-attachment://` — a different protocol, a different handler, and no fetch
    // pipeline behind it. The two are told apart by node type rather than by inspecting
    // the address, and the scheme is how that shows from out here.
    expect(probes.seen).toEqual(["emqnote-attachment://vault/Pasted%20image%2020260822.png"]);
    expect(capture.container.querySelector(".external-image")).toBeNull();
    expect(capture.container.querySelector(".wiki-embed-image-box")).not.toBeNull();
  });
});
