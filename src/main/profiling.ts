import { monitorEventLoopDelay } from "node:perf_hooks";
import { cpus, release } from "node:os";
import type { ProfilingAggregate, ProfilingEvent, ProfilingReport, ProfilingSummary, RendererProfilingEvent } from "../shared/profiling.js";

const LIMIT = 5_000;
const SAMPLE_MS = 30_000;
const DETAIL_MS = 50;
// Creating the histogram at import time wakes every Vitest worker (and every app
// process) every 20 ms even though profiling is opt-in. Start it with recording instead.
let histogram: ReturnType<typeof monitorEventLoopDelay> | null = null;

type AggregateInternal = { count: number; failures: number; totalMs: number; values: number[] };
let enabled = false;
let enabledAt: number | null = null;
let activeDurationMs = 0;
let events: ProfilingEvent[] = [];
let droppedEvents = 0;
let aggregates = new Map<string, AggregateInternal>();
let samples: ProfilingReport["resourceSamples"] = [];
let previousCpu = process.cpuUsage();
let previousSampleAt = process.hrtime.bigint();

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!;
}
function round(value: number): number { return Number(value.toFixed(2)); }
function loopDelay(): { p50: number; p95: number; max: number } {
  if (histogram === null) return { p50: 0, p95: 0, max: 0 };
  // nanoseconds; an idle process reports 0 until its first interval.
  const ms = (value: number) => Number.isFinite(value) ? round(value / 1e6) : 0;
  return { p50: ms(histogram.percentile(50)), p95: ms(histogram.max > 0 ? histogram.percentile(95) : 0), max: ms(histogram.max) };
}
function add(event: ProfilingEvent): void {
  if (events.length === LIMIT) { events.shift(); droppedEvents += 1; }
  events.push(event);
}
function safeError(error: unknown): ProfilingEvent["error"] {
  const source = error instanceof Error ? error : new Error(String(error));
  const message = redactMessage(source.message);
  return { category: typeof (error as { code?: unknown })?.code === "string" ? String((error as { code: string }).code) : source.name || "Error", message };
}
function redactMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S+/g, "[url]")
    .replace(/[A-Za-z]:\\[^\r\n]*/g, "[path]")
    .replace(/(?:^|\s)\/[^^\s]+/g, " [path]")
    .slice(0, 240);
}
function sample(): void {
  if (!enabled) return;
  const now = process.hrtime.bigint();
  const elapsed = Number(now - previousSampleAt) / 1e6;
  const currentCpu = process.cpuUsage();
  const cpuMs = (currentCpu.user - previousCpu.user + currentCpu.system - previousCpu.system) / 1000;
  previousCpu = currentCpu; previousSampleAt = now;
  const memory = process.memoryUsage();
  samples.push({ at: new Date().toISOString(), cpuPercent: round(elapsed ? (cpuMs / elapsed) * 100 / Math.max(1, cpus().length) : 0), rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, eventLoopDelay: loopDelay() });
  if (samples.length > 1_000) samples.shift();
  histogram?.reset();
}
setInterval(sample, SAMPLE_MS).unref();

export function setProfilingEnabled(value: boolean): void {
  if (value === enabled) return;
  enabled = value;
  if (value) {
    histogram ??= monitorEventLoopDelay({ resolution: 20 });
    histogram.enable();
    enabledAt = Date.now(); previousCpu = process.cpuUsage(); previousSampleAt = process.hrtime.bigint();
  } else if (enabledAt !== null) {
    activeDurationMs += Date.now() - enabledAt; enabledAt = null;
    histogram?.disable();
  }
}
export function profilingEnabled(): boolean { return enabled; }
export function clearProfiling(): void { events = []; aggregates = new Map(); samples = []; droppedEvents = 0; activeDurationMs = 0; if (enabled) enabledAt = Date.now(); }
export function recordProfiling(event: Omit<ProfilingEvent, "at">, retain = event.durationMs >= DETAIL_MS || event.outcome === "error"): void {
  if (!enabled) return;
  const item: ProfilingEvent = {
    ...event,
    durationMs: round(Math.max(0, event.durationMs)),
    at: new Date().toISOString(),
    ...(event.error === undefined ? {} : { error: { category: event.error.category.slice(0, 80), message: redactMessage(event.error.message) } }),
  };
  const aggregate = aggregates.get(item.operation) ?? { count: 0, failures: 0, totalMs: 0, values: [] };
  aggregate.count++; aggregate.totalMs += item.durationMs; aggregate.values.push(item.durationMs); if (item.outcome === "error") aggregate.failures++; aggregates.set(item.operation, aggregate);
  if (retain) add(item);
}
export async function profile<T>(operation: string, action: () => Promise<T> | T): Promise<T> {
  const start = process.hrtime.bigint();
  try { const result = await action(); recordProfiling({ operation, durationMs: Number(process.hrtime.bigint() - start) / 1e6, outcome: "ok" }); return result; }
  catch (error) { recordProfiling({ operation, durationMs: Number(process.hrtime.bigint() - start) / 1e6, outcome: "error", error: safeError(error) }, true); throw error; }
}
export function recordRendererProfiling(input: RendererProfilingEvent): void { recordProfiling(input); }
export function profilingSummary(capture: { count: number; p50: number; p95: number; max: number }): ProfilingSummary {
  // The tray should be useful immediately after enabling, not only after its first
  // thirty-second interval.
  if (enabled && samples.length === 0) sample();
  const active = activeDurationMs + (enabledAt === null ? 0 : Date.now() - enabledAt);
  const formatted = [...aggregates.entries()].map(([operation, value]) => ({ operation, count: value.count, failures: value.failures, totalMs: round(value.totalMs), p50: percentile(value.values, .5), p95: percentile(value.values, .95), max: Math.max(0, ...value.values) }));
  return { enabled, activeDurationMs: active, retainedEvents: events.length, droppedEvents, eventLoopDelay: samples.at(-1)?.eventLoopDelay ?? null, resource: samples.at(-1) ? { cpuPercent: samples.at(-1)!.cpuPercent, rssBytes: samples.at(-1)!.rssBytes, heapUsedBytes: samples.at(-1)!.heapUsedBytes } : null, captureLatency: capture, slowest: formatted.sort((a,b) => b.max-a.max).slice(0, 5), recentFailures: events.filter((event) => event.outcome === "error").slice(-10).reverse() };
}
export function profilingReport(meta: Omit<ProfilingReport, "schemaVersion" | "generatedAt" | "summary" | "aggregates" | "resourceSamples" | "events">, capture: { count: number; p50: number; p95: number; max: number }): ProfilingReport {
  const summary = profilingSummary(capture);
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), ...meta, summary, aggregates: summary.slowest.concat([...aggregates.entries()].map(([operation, value]) => ({ operation, count: value.count, failures: value.failures, totalMs: round(value.totalMs), p50: percentile(value.values,.5), p95: percentile(value.values,.95), max: Math.max(0,...value.values) })).filter((one) => !summary.slowest.some((top) => top.operation === one.operation))), resourceSamples: samples, events };
}
export function profiledIpcHandler<T extends (...args: any[]) => any>(channel: string, handler: T): T {
  return ((...args: Parameters<T>) => profile(`ipc.${channel}`, () => handler(...args))) as T;
}
