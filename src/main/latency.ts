import { app } from "electron";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * De meting die fase 1 moet aantonen: van global hotkey tot een getekend venster met
 * een knipperende cursor, onder de 80 milliseconden.
 *
 * Dit is geen achteraf-optimalisatie maar een acceptatiecriterium. Zit dit getal er nu
 * al boven, dan is dat een architectuurprobleem — geen kwestie van later wat bijschaven.
 */

export const LATENCY_BUDGET_MS = 80;

const HISTORY = 200;

interface Pending {
  startedAt: bigint;
  at: Date;
}

const pending = new Map<number, Pending>();
const samples: number[] = [];
let nextToken = 1;

export function beginMeasurement(): number {
  const token = nextToken;
  nextToken += 1;
  pending.set(token, { startedAt: process.hrtime.bigint(), at: new Date() });

  // Een venster dat nooit meldt dat het geverfd is, mag geen geheugen vasthouden.
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

  void log(started.at, elapsedMs);

  return elapsedMs;
}

async function log(at: Date, elapsedMs: number): Promise<void> {
  try {
    const directory = app.getPath("userData");
    await mkdir(directory, { recursive: true });
    await appendFile(
      join(directory, "latency.log"),
      `${at.toISOString()} ${elapsedMs.toFixed(1)}\n`,
      "utf8",
    );
  } catch {
    // Meten mag nooit de reden zijn dat het vastleggen van een notitie mislukt.
  }
}

export interface LatencyStats {
  count: number;
  p50: number;
  p95: number;
  max: number;
  last: number | null;
  withinBudget: boolean;
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(fraction * sorted.length));
  return sorted[index]!;
}

export function stats(): LatencyStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = percentile(sorted, 0.95);
  return {
    count: samples.length,
    p50: percentile(sorted, 0.5),
    p95,
    max: sorted[sorted.length - 1] ?? 0,
    last: samples[samples.length - 1] ?? null,
    withinBudget: samples.length === 0 || p95 <= LATENCY_BUDGET_MS,
  };
}

export function describeStats(): string {
  const current = stats();
  if (current.count === 0) return "Latency: nog niet gemeten";
  return (
    `Latency: p50 ${current.p50.toFixed(0)} ms, ` +
    `p95 ${current.p95.toFixed(0)} ms, ` +
    `max ${current.max.toFixed(0)} ms (${current.count}x)`
  );
}
