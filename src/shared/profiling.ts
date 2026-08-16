/** Deliberately content-free diagnostics shared by main, preload and renderer. */
export type ProfilingOutcome = "ok" | "error";

export interface ProfilingEvent {
  at: string;
  operation: string;
  durationMs: number;
  outcome: ProfilingOutcome;
  /** Approved numeric facts only (for example changed files), never document data. */
  counts?: Record<string, number>;
  path?: string;
  error?: { category: string; message: string };
}

export interface ProfilingAggregate {
  operation: string;
  count: number;
  failures: number;
  totalMs: number;
  p50: number;
  p95: number;
  max: number;
}

export interface ProfilingSummary {
  enabled: boolean;
  activeDurationMs: number;
  retainedEvents: number;
  droppedEvents: number;
  eventLoopDelay: { p50: number; p95: number; max: number } | null;
  resource: { cpuPercent: number; rssBytes: number; heapUsedBytes: number } | null;
  captureLatency: { count: number; p50: number; p95: number; max: number };
  slowest: ProfilingAggregate[];
  recentFailures: ProfilingEvent[];
}

export interface ProfilingReport {
  schemaVersion: 1;
  generatedAt: string;
  app: { version: string; electron: string; node: string };
  system: { platform: NodeJS.Platform; release: string; arch: string };
  summary: ProfilingSummary;
  aggregates: ProfilingAggregate[];
  resourceSamples: Array<{ at: string; cpuPercent: number; rssBytes: number; heapUsedBytes: number; eventLoopDelay: { p50: number; p95: number; max: number } }>;
  events: ProfilingEvent[];
}

export interface RendererProfilingEvent {
  operation: "renderer.tree" | "renderer.notes" | "renderer.conflicts" | "renderer.facets" | "renderer.refresh";
  durationMs: number;
  outcome: ProfilingOutcome;
  counts?: Record<string, number>;
}
