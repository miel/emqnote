import { describe, expect, it } from "vitest";
import { attachmentRoute } from "../src/main/attachment-route.js";
import { fitScale } from "../src/shared/pdf-fit.js";
import { attachmentNameFromUrl, attachmentUrl } from "../src/shared/attachment-url.js";

/**
 * B40's two decisions that can be pinned without a window: which route a click takes, and
 * how a page is fitted into a box. The rendering itself needs a real `BrowserWindow` and a
 * real canvas, so it is a `TEST-PROTOCOL.md` item — the same boundary B36's own tests draw.
 */

describe("attachmentRoute", () => {
  it("sends a PDF to this app's own viewer", () => {
    expect(attachmentRoute("2026-08-04-1030-offerte.pdf")).toBe("viewer");
  });

  it("is not fooled by the case of the extension", () => {
    expect(attachmentRoute("Scan.PDF")).toBe("viewer");
  });

  it("finds a PDF at the end of a path-form target", () => {
    expect(attachmentRoute("99 - Attachments/Notulen.pdf")).toBe("viewer");
  });

  it("leaves everything it cannot draw to the OS", () => {
    // Offering to "view" one of these would be a worse answer than handing it to Word:
    // the viewer has no way to draw it, so the escape hatch is the only honest route.
    for (const name of ["begroting.xlsx", "brief.docx", "notities.txt", "logo.png"]) {
      expect(attachmentRoute(name)).toBe("system");
    }
  });
});

describe("fitScale", () => {
  it("fits a page inside the box on its tightest side", () => {
    // 200×100 into 100×100: width is what binds.
    expect(fitScale(200, 100, 100, 100)).toBeCloseTo(0.5);
    expect(fitScale(100, 200, 100, 100)).toBeCloseTo(0.5);
  });

  it("never magnifies for a thumbnail", () => {
    // A small page blown up to fill a 256×320 box is a blurry lie about the document.
    expect(fitScale(50, 50, 256, 320)).toBe(1);
  });

  it("magnifies for the viewer's fit-page, which is the whole point of it", () => {
    expect(fitScale(50, 50, 200, 200, { allowUpscale: true })).toBeCloseTo(4);
  });
});

describe("the URL the viewer fetches", () => {
  it("survives a name the app did not write", () => {
    // The viewer reads the same scheme the embed does, so B38's path form has to carry a
    // capital letter and a slash through unchanged — the measured failure that decided
    // that URL shape in the first place.
    const name = "99 - Attachments/Pasted image 20260812.pdf";
    expect(attachmentNameFromUrl(attachmentUrl("emqnote-attachment", name), "emqnote-attachment")).toBe(
      name,
    );
  });
});
