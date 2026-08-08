import { describe, expect, it, vi } from "vitest";
import { PdfThumbQueue } from "../src/main/pdf-thumb-queue.js";

/**
 * The Electron-free half of B36's PDF-thumbnail renderer — scheduling only. `pdf-thumb.ts`
 * is the other half, the one that actually owns a hidden `BrowserWindow`; it needs a real
 * Electron process to exercise and is not tested directly here for the same reason
 * `thumbnails.ts` never was (see `thumbnail-cache.test.ts`'s own comment on that split).
 *
 * `vi.useFakeTimers()` throughout: a 10 s render timeout and a 60 s idle timeout would
 * otherwise make this the slowest file in the suite, which `CLAUDE.md`'s "stay under
 * about two seconds" rule exists to prevent.
 */

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("PdfThumbQueue", () => {
  it("resolves a single request with what render produced", async () => {
    vi.useFakeTimers();
    try {
      const render = vi.fn().mockResolvedValue(Buffer.from("png-bytes"));
      const queue = new PdfThumbQueue(render, vi.fn());

      const result = await queue.request(new Uint8Array([1, 2, 3]));

      expect(result).toEqual(Buffer.from("png-bytes"));
      expect(render).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never runs two renders at once — the second waits for the first to settle", async () => {
    vi.useFakeTimers();
    try {
      const first = deferred<Buffer>();
      const second = deferred<Buffer>();
      let concurrent = 0;
      let maxConcurrent = 0;

      const render = vi
        .fn()
        .mockImplementationOnce(async () => {
          concurrent += 1;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          const result = await first.promise;
          concurrent -= 1;
          return result;
        })
        .mockImplementationOnce(async () => {
          concurrent += 1;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          const result = await second.promise;
          concurrent -= 1;
          return result;
        });

      const queue = new PdfThumbQueue(render, vi.fn());

      const a = queue.request(new Uint8Array([1]));
      const b = queue.request(new Uint8Array([2]));

      // The second render must not have started yet — only one call so far.
      await Promise.resolve();
      await Promise.resolve();
      expect(render).toHaveBeenCalledTimes(1);

      first.resolve(Buffer.from("a"));
      await a;
      second.resolve(Buffer.from("b"));
      await b;

      expect(maxConcurrent).toBe(1);
      expect(render).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a rejected render does not break the next queued request", async () => {
    vi.useFakeTimers();
    try {
      const render = vi
        .fn()
        .mockRejectedValueOnce(new Error("first render failed"))
        .mockResolvedValueOnce(Buffer.from("second-ok"));
      const queue = new PdfThumbQueue(render, vi.fn());

      const first = queue.request(new Uint8Array([1]));
      const second = queue.request(new Uint8Array([2]));

      await expect(first).rejects.toThrow("first render failed");
      await expect(second).resolves.toEqual(Buffer.from("second-ok"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out a render that takes too long, and the next request still runs", async () => {
    vi.useFakeTimers();
    try {
      const stuck = deferred<Buffer>();
      const render = vi
        .fn()
        .mockImplementationOnce(() => stuck.promise)
        .mockResolvedValueOnce(Buffer.from("ok"));

      const queue = new PdfThumbQueue(render, vi.fn(), { renderTimeoutMs: 10_000 });

      const first = queue.request(new Uint8Array([1]));
      const assertion = expect(first).rejects.toThrow(/timed out/);

      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;

      const second = queue.request(new Uint8Array([2]));
      await expect(second).resolves.toEqual(Buffer.from("ok"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("calls onIdle once idleTimeoutMs has passed since the last request settled", async () => {
    vi.useFakeTimers();
    try {
      const render = vi.fn().mockResolvedValue(Buffer.from("ok"));
      const onIdle = vi.fn();
      const queue = new PdfThumbQueue(render, onIdle, { idleTimeoutMs: 60_000 });

      await queue.request(new Uint8Array([1]));
      expect(onIdle).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(59_999);
      expect(onIdle).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(onIdle).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not call onIdle if another request arrives before the idle timeout", async () => {
    vi.useFakeTimers();
    try {
      const render = vi.fn().mockResolvedValue(Buffer.from("ok"));
      const onIdle = vi.fn();
      const queue = new PdfThumbQueue(render, onIdle, { idleTimeoutMs: 60_000 });

      await queue.request(new Uint8Array([1]));
      await vi.advanceTimersByTimeAsync(50_000);
      expect(onIdle).not.toHaveBeenCalled();

      await queue.request(new Uint8Array([2]));
      await vi.advanceTimersByTimeAsync(50_000);
      // 100 s of wall time has passed, but the idle clock restarted at the second
      // request 50 s in, so only 50 s of *idle* time has elapsed since — not enough.
      expect(onIdle).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(10_000);
      expect(onIdle).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels the pending idle timer once a new request starts", async () => {
    vi.useFakeTimers();
    try {
      const render = vi.fn().mockResolvedValue(Buffer.from("ok"));
      const onIdle = vi.fn();
      const queue = new PdfThumbQueue(render, onIdle, { idleTimeoutMs: 1_000 });

      await queue.request(new Uint8Array([1]));
      await vi.advanceTimersByTimeAsync(900);

      // Starting a new request before the idle timer fires must clear it — not just
      // race a fresh one against the stale one.
      const second = queue.request(new Uint8Array([2]));
      await vi.advanceTimersByTimeAsync(900);
      expect(onIdle).not.toHaveBeenCalled();

      await second;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(onIdle).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
