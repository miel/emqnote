import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyVault, isInside, listVaults, tenantOf } from "../src/main/vaults.js";

/**
 * Where notes get written is decided from this list, so it is tested directly — which is
 * why the classification lives in an Electron-free module rather than beside
 * `remembered.ts`, which imports `app` and is therefore untestable.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "emqnote-vaults-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("tenantOf", () => {
  it("reads both spellings OneDrive uses", () => {
    expect(tenantOf("/Users/e/Library/CloudStorage/OneDrive-Contoso")).toBe("Contoso");
    expect(tenantOf("/Users/e/OneDrive - Contoso")).toBe("Contoso");
    expect(tenantOf("C:\\Users\\e\\OneDrive - Contoso Ltd")).toBe("Contoso Ltd");
  });

  it("leaves a folder that is not a OneDrive root alone", () => {
    expect(tenantOf("/Users/e/Documents")).toBe("Documents");
  });
});

describe("isInside", () => {
  it("matches a folder inside the root", () => {
    expect(isInside("/a/OneDrive-Contoso/emqnote", "/a/OneDrive-Contoso")).toBe(true);
    expect(isInside("/a/OneDrive-Contoso", "/a/OneDrive-Contoso")).toBe(true);
  });

  it("does not let a longer name look like a child", () => {
    // The reason the separator guard exists: a bare `startsWith` says this is inside,
    // and the vault gets labelled with a tenant it does not belong to.
    expect(isInside("/a/OneDrive-Contoso-old/emqnote", "/a/OneDrive-Contoso")).toBe(false);
  });

  it("ignores case, because Windows and macOS do", () => {
    expect(isInside("/a/onedrive-contoso/emqnote", "/a/OneDrive-Contoso")).toBe(true);
  });

  it("survives a trailing separator on the root", () => {
    expect(isInside("/a/OneDrive-Contoso/emqnote", "/a/OneDrive-Contoso/")).toBe(true);
  });
});

describe("classifyVault", () => {
  it("calls a folder under a OneDrive root synced, with its tenant", () => {
    const oneDrive = join(root, "OneDrive-Contoso");
    const vault = join(oneDrive, "emqnote");
    mkdirSync(vault, { recursive: true });

    expect(classifyVault(vault, [oneDrive])).toEqual({
      path: vault,
      status: "synced",
      tenant: "Contoso",
    });
  });

  it("calls anything else a local folder", () => {
    const vault = join(root, "notes");
    mkdirSync(vault);

    expect(classifyVault(vault, [join(root, "OneDrive-Contoso")])).toEqual({
      path: vault,
      status: "local",
      tenant: "",
    });
  });

  it("calls a folder that is not there unavailable", () => {
    const vault = join(root, "gone");

    expect(classifyVault(vault, [])).toEqual({
      path: vault,
      status: "unavailable",
      tenant: "",
    });
  });

  it("re-derives the label rather than trusting the path's name", () => {
    // A vault that has *stopped* being a OneDrive path — the folder was moved, the
    // account was unlinked — still has "OneDrive" in its name. A cached label would go
    // on claiming it is synced; deriving it every time is what stops that.
    const vault = join(root, "OneDrive-Contoso", "emqnote");
    mkdirSync(vault, { recursive: true });

    expect(classifyVault(vault, []).status).toBe("local");
  });
});

describe("listVaults", () => {
  it("puts the current vault first and drops the duplicate", () => {
    const a = join(root, "a");
    const b = join(root, "b");
    mkdirSync(a);
    mkdirSync(b);

    const listed = listVaults([b, a], [], a);

    expect(listed.map((entry) => entry.path)).toEqual([a, b]);
  });

  it("keeps unavailable entries in the list", () => {
    const here = join(root, "here");
    const gone = join(root, "gone");
    mkdirSync(here);

    const listed = listVaults([here, gone], [], here);

    expect(listed).toHaveLength(2);
    expect(listed[1]!.status).toBe("unavailable");
  });

  it("de-duplicates case-insensitively, as the filesystem does", () => {
    const vault = join(root, "Notes");
    mkdirSync(vault);

    expect(listVaults([join(root, "notes")], [], vault)).toHaveLength(1);
  });

  it("copes with nothing remembered and no vault chosen yet", () => {
    expect(listVaults([], [], null)).toEqual([]);
  });
});
