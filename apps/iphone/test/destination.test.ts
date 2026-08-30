import { describe, expect, it } from "vitest";
import type { DraftStorage } from "../src/draft.js";
import {
  ACCOUNT_KIND_KEY,
  DEFAULT_VAULT_FOLDER,
  loadDestination,
  loadExpectedAccountKind,
  loadVaultFolder,
  storeExpectedAccountKind,
  storeVaultFolder,
} from "../src/delivery/destination.js";

function memoryStorage(): DraftStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

describe("which destination is in use", () => {
  it("is Graph unless something explicitly says otherwise", () => {
    // The Files route exists for iCloud Drive and Dropbox and is not reachable from the
    // capture UI. Anything unrecognised in storage must not silently switch routes.
    const storage = memoryStorage();
    expect(loadDestination(storage)).toBe("graph");
    storage.setItem("emqnote.iphone.destination.v1", "nonsense");
    expect(loadDestination(storage)).toBe("graph");
    storage.setItem("emqnote.iphone.destination.v1", "files");
    expect(loadDestination(storage)).toBe("files");
  });
});

describe("the vault folder", () => {
  it("defaults to the name the desktop uses", () => {
    // `VAULT_FOLDER_NAME` in src/main/vault.ts. If these drift, `resolveInbox` 404s.
    expect(DEFAULT_VAULT_FOLDER).toBe("emqnote");
    expect(loadVaultFolder(memoryStorage())).toBe("emqnote");
  });

  it("falls back rather than asking Graph for an empty path", () => {
    const storage = memoryStorage();
    storeVaultFolder(storage, "   ");
    expect(loadVaultFolder(storage)).toBe(DEFAULT_VAULT_FOLDER);
  });

  it("trims, because a trailing space in a path segment is not the same folder", () => {
    const storage = memoryStorage();
    storeVaultFolder(storage, "  emqnote  ");
    expect(loadVaultFolder(storage)).toBe("emqnote");
  });
});

describe("which Microsoft account this vault lives on", () => {
  it("is the personal one by default", () => {
    // B80: the business tenant permits no app registration and there is no portal access
    // to ask for one, so both the registration and the vault are personal.
    expect(loadExpectedAccountKind(memoryStorage())).toBe("personal");
  });

  it("can be set to work, for an install that does have a tenant", () => {
    const storage = memoryStorage();
    storeExpectedAccountKind(storage, "work");
    expect(loadExpectedAccountKind(storage)).toBe("work");
    expect(storage.getItem(ACCOUNT_KIND_KEY)).toBe("work");
  });

  it("treats anything unrecognised as personal rather than guessing work", () => {
    const storage = memoryStorage();
    storage.setItem(ACCOUNT_KIND_KEY, "");
    expect(loadExpectedAccountKind(storage)).toBe("personal");
  });
});
