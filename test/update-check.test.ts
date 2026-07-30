import { describe, expect, it } from "vitest";
import { isNewerVersion, parseLatestRelease } from "../src/main/update-check.js";

describe("parseLatestRelease", () => {
  it("reads the version and URL off a real GitHub release response", () => {
    expect(
      parseLatestRelease({
        tag_name: "v0.2.0",
        html_url: "https://github.com/miel/emqnote/releases/tag/v0.2.0",
      }),
    ).toEqual({ version: "0.2.0", htmlUrl: "https://github.com/miel/emqnote/releases/tag/v0.2.0" });
  });

  it("accepts a tag without a leading v", () => {
    expect(
      parseLatestRelease({ tag_name: "0.2.0", html_url: "https://example.com" }),
    ).toEqual({ version: "0.2.0", htmlUrl: "https://example.com" });
  });

  it("rejects a tag that isn't X.Y.Z", () => {
    expect(
      parseLatestRelease({ tag_name: "v0.2.0-beta", html_url: "https://example.com" }),
    ).toBeNull();
  });

  it("rejects a response missing tag_name or html_url", () => {
    expect(parseLatestRelease({ tag_name: "v0.2.0" })).toBeNull();
    expect(parseLatestRelease({ html_url: "https://example.com" })).toBeNull();
  });

  it("rejects non-object input without throwing", () => {
    expect(parseLatestRelease(null)).toBeNull();
    expect(parseLatestRelease("not json")).toBeNull();
    expect(parseLatestRelease(undefined)).toBeNull();
  });
});

describe("isNewerVersion", () => {
  it("is true when the candidate is ahead", () => {
    expect(isNewerVersion("0.1.0", "0.2.0")).toBe(true);
    expect(isNewerVersion("0.1.0", "1.0.0")).toBe(true);
    expect(isNewerVersion("0.1.0", "0.1.1")).toBe(true);
  });

  it("is false when equal or behind", () => {
    expect(isNewerVersion("0.1.0", "0.1.0")).toBe(false);
    expect(isNewerVersion("0.2.0", "0.1.9")).toBe(false);
  });

  it("compares parts numerically, not lexically", () => {
    expect(isNewerVersion("0.9.0", "0.10.0")).toBe(true);
  });
});
