import { recordProfiling } from "./profiling.js";

/**
 * The measurement phase 1 has to demonstrate: from global hotkey to a painted window
 * with a blinking caret, under 80 milliseconds.
 *
 * This is not an afterthought optimisation but an acceptance criterion. If the number
 * is already above budget now, that is an architectural problem — not something to
 * shave down later.
 */

export const LATENCY_BUDGET_MS = 80;

const HISTORY = 200;

interface Pending {
  startedAt: bigint;
}

const pending = new Map<number, Pending>();
const samples: number[] = [];
let nextToken = 1;

export function beginMeasurement(): number {
  const token = nextToken;
  nextToken += 1;
  pending.set(token, { startedAt: process.hrtime.bigint() });

  // A window that never reports having painted must not hold on to memory.
  setTimeout(() => pending.delete(token), 10_000);

  return token;
}

export function completeMeasurement(token: number): number | null {
  const started = pending.get(token);
  if (started === undefined) return null;
  pending.delete(token);

  const elapsedMs = Number(process.hrtime.bigint() - started.startedAt) / 1e6;

  samples.push(elapsedMs);
  if (samples.length > HISTORY) samples.shift();

  recordProfiling({ operation: "capture.hotkey-to-caret", durationMs: elapsedMs, outcome: "ok" });

  return elapsedMs;
}

export interface Outlier {
  /** Which appearance this was, counting from one. */
  round: number;
  ms: number;
}

export interface LatencyStats {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  last: number | null;
  withinBudget: boolean;
  /** The slowest few, with their position — a stall in round 1 means something else than one in round 37. */
  worst: Outlier[];
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(fraction * sorted.length));
  return sorted[index]!;
}

export function stats(): LatencyStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = percentile(sorted, 0.95);

  const worst = samples
    .map((ms, index) => ({ round: index + 1, ms: Number(ms.toFixed(1)) }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 3);

  return {
    count: samples.length,
    p50: percentile(sorted, 0.5),
    p95,
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1] ?? 0,
    last: samples[samples.length - 1] ?? null,
    withinBudget: samples.length === 0 || p95 <= LATENCY_BUDGET_MS,
    worst,
  };
}

export function describeStats(): string {
  const current = stats();
  if (current.count === 0) return "Latency: not measured yet";
  return (
    `Latency: p50 ${current.p50.toFixed(0)} ms, ` +
    `p95 ${current.p95.toFixed(0)} ms, ` +
    `max ${current.max.toFixed(0)} ms (${current.count}x)`
  );
}
