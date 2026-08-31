// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountCapture, type MountedCapture } from "./helpers/capture.js";

/**
 * The capture window saying that it could not save (B93).
 *
 * The half of the 31 August 2026 data loss that was about the *window* rather than the
 * write: for a whole day this footer read "Saved as 2026-08-31 0914 …" while nothing was
 * being written, because "saved as" only ever named the file the app meant to write to. A
 * window whose one job is to not lose what you type has to be able to say when it is
 * losing it.
 *
 * So the assertion that matters here is not that the failure appears — it is that
 * "Saved as …" **disappears** while it does. A 28px band reads as one line, and of a
 * contradiction it is the reassuring half that gets believed.
 */

const SAVED_AS = ".filename";
const FAILURE = ".save-error";

describe("the capture window's save-failure notice", () => {
  let capture: MountedCapture;

  const savedAs = (): string | null =>
    capture.container.querySelector(SAVED_AS)?.textContent ?? null;
  const failure = (): string | null =>
    capture.container.querySelector(FAILURE)?.textContent ?? null;

  beforeEach(async () => {
    capture = await mountCapture();
  });

  afterEach(() => {
    capture.unmount();
  });

  it("says nothing while writes are landing", async () => {
    await capture.fireStatus({
      lastLatencyMs: 30,
      savedAs: "00 Inbox/2026-08-31 0914 Handed over.md",
      saveError: null,
    });

    expect(savedAs()).toContain("2026-08-31 0914 Handed over.md");
    expect(failure()).toBeNull();
  });

  it("replaces the file name rather than sitting beside it", async () => {
    await capture.fireStatus({
      lastLatencyMs: 30,
      savedAs: "00 Inbox/2026-08-31 0914 Handed over.md",
      saveError: {
        code: "EPERM",
        message: "Could not write …: EPERM: operation not permitted, rename",
        recoveryPath: "/tmp/userData/recovered/2026-08-31T09-14-22-note.md",
      },
    });

    expect(failure()).toContain("EPERM");
    // The whole point of the row.
    expect(savedAs()).toBeNull();
  });

  it("offers the path the text was preserved at", async () => {
    await capture.fireStatus({
      lastLatencyMs: null,
      savedAs: null,
      saveError: {
        code: "EPERM",
        message: "Could not write …",
        recoveryPath: "/tmp/userData/recovered/2026-08-31T09-14-22-note.md",
      },
    });

    const copy = capture.container.querySelector<HTMLButtonElement>(".save-error-copy");
    expect(copy).not.toBeNull();
    // `title`, because the footer has no room for a path and a hover is where one goes.
    expect(copy?.title).toBe("/tmp/userData/recovered/2026-08-31T09-14-22-note.md");

    copy?.click();
    expect(capture.spies.copyText).toHaveBeenCalledWith(
      "/tmp/userData/recovered/2026-08-31T09-14-22-note.md",
    );
  });

  it("does not offer a path when there was nowhere to preserve the text", async () => {
    await capture.fireStatus({
      lastLatencyMs: null,
      savedAs: null,
      saveError: { code: "ENOSPC", message: "no space left", recoveryPath: null },
    });

    expect(failure()).toContain("ENOSPC");
    // Better to say nothing than to offer a link to a file that was never written.
    expect(capture.container.querySelector(".save-error-copy")).toBeNull();
  });

  it("clears itself once a write lands again", async () => {
    await capture.fireStatus({
      lastLatencyMs: null,
      savedAs: null,
      saveError: { code: "EPERM", message: "…", recoveryPath: null },
    });
    expect(failure()).not.toBeNull();

    await capture.fireStatus({
      lastLatencyMs: 30,
      savedAs: "00 Inbox/2026-08-31 0914 Handed over.md",
      saveError: null,
    });

    expect(failure()).toBeNull();
    expect(savedAs()).toContain("2026-08-31 0914 Handed over.md");
  });
});
