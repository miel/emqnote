import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the `--selftest` report actually counts.
 *
 * Two things it got wrong, both found by reading a real Windows run rather than by a
 * failure (§59, and §8). That run does one deliberate warm-up appearance before the
 * measured loop — the first time a window is shown always costs the OS something that
 * says nothing about a resident app — and then measured it along with everything else.
 * So fifty rounds were reported over fifty-one samples: `max` and `p99` were the warm-up
 * (169 ms against a p95 of 53), and `worst` named a round 51 that the loop never ran.
 *
 * And the summary said `missed: 0` beside that 169 ms, which is true and reads as false.
 * `missed` counts appearances that never painted at all; nothing counted the ones that
 * painted too late, which is what the `[latency]` line printed beside the run is about.
 *
 * `electron` is mocked down to the one call this module makes — `app.getPath`, for the
 * log file beside the samples. The measurement itself is `process.hrtime`.
 */

const directory = mkdtempSync(join(tmpdir(), "emqnote-latency-"));

vi.mock("electron", () => ({ app: { getPath: () => directory } }));

const { beginMeasurement, completeMeasurement, resetMeasurements, stats, LATENCY_BUDGET_MS } =
  await import("../src/main/latency.js");

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(() => {
  resetMeasurements();
});

/** One appearance, taking about `ms` between the hotkey and the painted frame. */
async function appearance(ms = 0): Promise<void> {
  const token = beginMeasurement();
  if (ms > 0) await new Promise((done) => setTimeout(done, ms));
  completeMeasurement(token);
}

describe("the latency report", () => {
  it("counts every sample it was given", async () => {
    await appearance();
    await appearance();
    await appearance();

    expect(stats().count).toBe(3);
  });

  it("forgets the warm-up when asked, so the round numbers start at one", async () => {
    // The warm-up: slow, and deliberately not part of the answer.
    await appearance(90);
    expect(stats().count).toBe(1);

    resetMeasurements();
    await appearance();
    await appearance();

    const result = stats();
    expect(result.count).toBe(2);
    // Round 3 of a two-round run is exactly the "round 51" the real report printed.
    expect(result.worst.map((outlier) => outlier.round)).toEqual([1, 2]);
    expect(result.max).toBeLessThan(90);
  });

  it("counts the appearances that were too slow, which no number used to", async () => {
    // Twenty fast and one slow, rather than two and one: `percentile` reads an index out
    // of the sorted samples, so with three of them the 95th percentile *is* the slowest
    // one. The point being made needs a run long enough for a p95 to mean anything —
    // which the real one, at fifty rounds, is.
    for (let round = 0; round < 20; round += 1) {
      // eslint-disable-next-line no-await-in-loop
      await appearance();
    }
    await appearance(LATENCY_BUDGET_MS + 20);

    const result = stats();
    expect(result.overBudget).toBe(1);
    // And the flag beside it still answers for the p95, which is the acceptance
    // criterion: one slow appearance in twenty-one does not fail a run — it just never
    // showed up anywhere in the report either.
    expect(result.withinBudget).toBe(true);
  });

  it("answers zero for everything when nothing has been measured", () => {
    const result = stats();
    expect(result.count).toBe(0);
    expect(result.overBudget).toBe(0);
    expect(result.worst).toEqual([]);
    expect(result.withinBudget).toBe(true);
  });
});
