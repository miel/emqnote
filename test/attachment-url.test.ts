import { describe, expect, it } from "vitest";
import { attachmentNameFromUrl, attachmentUrl } from "../src/shared/attachment-url.js";

/**
 * The two custom protocol URLs, both directions.
 *
 * The name lives in the URL's *path* rather than its host, and that is not a style
 * choice — Chromium canonicalises the host of a `standard: true` scheme, which was
 * measured against a real Electron build rather than reasoned about. Two facts came out
 * of it, and both are regressions this file pins:
 *
 * - `emq-a://Pasted%20image.png` reached the handler as `emq-a://pasted%20image.png/`.
 *   Every attachment the app itself writes is lower case already (`attachmentName`
 *   lowercases), so a vault of only app-written files never noticed; a vault written in
 *   Obsidian is full of names that are not.
 * - `emq-a://99%20-%20Attachments%2Ffoo.png` did not reach the handler at all — `fetch`
 *   threw "Failed to parse URL". A `%2F` is not a legal host, so a target naming a path
 *   could not be expressed at all, whatever `resolveAttachment` was willing to find.
 *
 * The same two cases through the path form both arrived verbatim, trailing slash and all
 * absent.
 */

describe("attachmentUrl", () => {
  it("puts the name in the path, behind a fixed host", () => {
    expect(attachmentUrl("emqnote-attachment", "foto.png")).toBe(
      "emqnote-attachment://vault/foto.png",
    );
  });

  it("keeps a path-form target in one segment, so Chromium cannot normalise it", () => {
    expect(attachmentUrl("emqnote-thumb", "99 - Attachments/offerte.pdf")).toBe(
      "emqnote-thumb://vault/99%20-%20Attachments%2Fofferte.pdf",
    );
  });

  it("round-trips every shape a real vault produces", () => {
    const names = [
      "foto.png",
      "Pasted image 20260526104144.png",
      "99 - Attachments/7337fdd5393e2f65959966ee448a92e8_MD5.png",
      "foto (2).png",
      "a/b/c.pdf",
      "naam met #hekje.png",
    ];

    for (const name of names) {
      expect(attachmentNameFromUrl(attachmentUrl("emqnote-attachment", name), "emqnote-attachment"))
        .toBe(name);
    }
  });
});

describe("attachmentNameFromUrl", () => {
  it("reads the name back out of the path form", () => {
    expect(
      attachmentNameFromUrl("emqnote-thumb://vault/mijn%20offerte.pdf", "emqnote-thumb"),
    ).toBe("mijn offerte.pdf");
  });

  it("keeps the case Chromium would have flattened in a host", () => {
    expect(
      attachmentNameFromUrl("emqnote-attachment://vault/Pasted%20image.PNG", "emqnote-attachment"),
    ).toBe("Pasted image.PNG");
  });

  /**
   * The host form is still read, for one reason: clipboard HTML copied inside the app
   * before this change carries it, and `paste-images.ts` parses exactly that string back
   * into a target. Nothing on disk ever holds one of these URLs.
   *
   * It also remains the regression B36 was: Chromium normalises `emqnote-thumb://offerte.pdf`
   * to `emqnote-thumb://offerte.pdf/`, `isPreviewable` read the extension as `.pdf/`, and
   * the thumbnail handler 404'd for every PDF on every platform.
   */
  it("still reads the old host form, with and without Chromium's trailing slash", () => {
    expect(attachmentNameFromUrl("emqnote-thumb://offerte.pdf/", "emqnote-thumb")).toBe(
      "offerte.pdf",
    );
    expect(attachmentNameFromUrl("emqnote-thumb://offerte.pdf", "emqnote-thumb")).toBe(
      "offerte.pdf",
    );
    expect(
      attachmentNameFromUrl("emqnote-attachment://2026-08-05-1030-foto.png/", "emqnote-attachment"),
    ).toBe("2026-08-05-1030-foto.png");
  });

  it("decodes percent-escapes, and does so after the slash is stripped", () => {
    expect(attachmentNameFromUrl("emqnote-thumb://mijn%20offerte.pdf/", "emqnote-thumb")).toBe(
      "mijn offerte.pdf",
    );

    // `%2F` is part of the name, not Chromium's punctuation: stripping after decoding
    // would eat it and change which file was asked for.
    expect(attachmentNameFromUrl("emqnote-thumb://a%2F", "emqnote-thumb")).toBe("a/");
    expect(attachmentNameFromUrl("emqnote-thumb://vault/a%2F", "emqnote-thumb")).toBe("a/");
  });
});
