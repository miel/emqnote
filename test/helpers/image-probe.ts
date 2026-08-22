/**
 * Records what a probe `Image` was pointed at, without letting jsdom try to load it.
 *
 * The setter is patched on the prototype rather than the constructor swapped: the module
 * under test calls the bare `Image` global, and which object that resolves to under vitest
 * is not something a test should have to know.
 *
 * Shared rather than copied, because two files now ask the same question of B50 from
 * opposite ends — `attachment-view.test.ts` of the node view itself, and
 * `capture-remote-images.test.ts` of whether the capture window hands it the setting — and
 * a patched global prototype is exactly the kind of helper that must not come to exist
 * twice with two ideas of how to put it back.
 */
export function spyOnImageSrc(): { seen: string[]; restore: () => void } {
  const seen: string[] = [];
  const prototype = globalThis.Image.prototype as unknown as object;
  const original = Object.getOwnPropertyDescriptor(prototype, "src");

  Object.defineProperty(prototype, "src", {
    configurable: true,
    set(value: string) {
      seen.push(value);
    },
    get() {
      return seen[seen.length - 1] ?? "";
    },
  });

  return {
    seen,
    restore: () => {
      if (original === undefined) delete (prototype as Record<string, unknown>).src;
      else Object.defineProperty(prototype, "src", original);
    },
  };
}
