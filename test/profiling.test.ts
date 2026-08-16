import { afterEach, describe, expect, it } from "vitest";
import {
  clearProfiling,
  profilingReport,
  profilingSummary,
  recordProfiling,
  setProfilingEnabled,
} from "../src/main/profiling.js";

const capture = { count: 0, p50: 0, p95: 0, max: 0 };

afterEach(() => {
  setProfilingEnabled(false);
  clearProfiling();
});

describe("session profiling", () => {
  it("pauses without discarding data and clear keeps its enabled state", () => {
    setProfilingEnabled(true);
    recordProfiling({ operation: "vault.read", durationMs: 75, outcome: "ok" });
    setProfilingEnabled(false);
    recordProfiling({ operation: "ignored", durationMs: 75, outcome: "ok" });
    expect(profilingSummary(capture).retainedEvents).toBe(1);
    setProfilingEnabled(true);
    clearProfiling();
    expect(profilingSummary(capture)).toMatchObject({ enabled: true, retainedEvents: 0, droppedEvents: 0 });
  });

  it("bounds detailed events while preserving aggregates and emits redacted schema v1", () => {
    setProfilingEnabled(true);
    for (let index = 0; index < 5_001; index++) {
      recordProfiling({ operation: "scan.note", durationMs: 50, outcome: "ok" });
    }
    recordProfiling({ operation: "vault.write", durationMs: 1, outcome: "error", error: { category: "EACCES", message: "[path]" } }, true);
    const report = profilingReport({ app: { version: "1", electron: "2", node: "3" }, system: { platform: process.platform, release: "test", arch: "test" } }, capture);
    expect(report.schemaVersion).toBe(1);
    expect(report.events).toHaveLength(5_000);
    expect(report.summary.droppedEvents).toBe(2);
    expect(report.aggregates.find((item) => item.operation === "scan.note")?.count).toBe(5_001);
    expect(JSON.stringify(report)).not.toContain("/Users/");
  });
});
