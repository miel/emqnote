/**
 * The Electron-free half of B36's PDF-thumbnail renderer — everything about
 * *scheduling* a render lives here: one at a time, a timeout per render, and an idle
 * timer that fires once nothing has been asked for in a while. `pdf-thumb.ts` is the
 * other half, the one that actually owns a hidden `BrowserWindow` and shuttles bytes to
 * and from it, for the same reason `thumbnail-cache.ts` sits apart from `thumbnails.ts`:
 * none of the scheduling logic needs Electron, so none of it needs a build to test.
 */

export type RenderFn = (bytes: Uint8Array) => Promise<Buffer>;

export interface PdfThumbQueueOptions {
  /** Per-render ceiling. A render that takes longer than this is treated as failed. */
  renderTimeoutMs?: number;
  /** How long the queue must sit empty before `onIdle` fires. */
  idleTimeoutMs?: number;
  /** Injectable for tests — real timers would make the idle/timeout cases slow. */
  setTimeout?: (fn: () => void, ms: number) => ReturnType<typeof globalThis.setTimeout>;
  clearTimeout?: (handle: ReturnType<typeof globalThis.setTimeout>) => void;
}

const DEFAULT_RENDER_TIMEOUT_MS = 10_000;
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

/**
 * Serialises calls to `render` (never two in flight at once — pdf.js in a single hidden
 * window is not asked to do two pages at a time), times each one out at
 * `renderTimeoutMs`, and calls `onIdle` once `idleTimeoutMs` has passed with nothing new
 * queued since the last one finished. `onIdle` is `pdf-thumb.ts`'s cue to destroy the
 * window — this module knows nothing about windows, only about when one would no longer
 * be worth keeping open.
 */
export class PdfThumbQueue {
  private readonly renderTimeoutMs: number;
  private readonly idleTimeoutMs: number;
  private readonly setTimer: (fn: () => void, ms: number) => ReturnType<typeof globalThis.setTimeout>;
  private readonly clearTimer: (handle: ReturnType<typeof globalThis.setTimeout>) => void;

  /** The tail of the chain — every new request is appended behind whatever is running. */
  private tail: Promise<void> = Promise.resolve();
  private idleHandle: ReturnType<typeof globalThis.setTimeout> | null = null;

  constructor(
    private readonly render: RenderFn,
    private readonly onIdle: () => void,
    options: PdfThumbQueueOptions = {},
  ) {
    this.renderTimeoutMs = options.renderTimeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS;
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.setTimer = options.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.clearTimer = options.clearTimeout ?? ((handle) => globalThis.clearTimeout(handle));
  }

  /**
   * Queues one render behind whatever is already running and answers its own result —
   * a rejection from one request never fails a sibling queued behind or ahead of it.
   * Cancels the idle timer the moment something is asked for, and restarts it once this
   * request (successful or not) has settled and nothing else is waiting.
   */
  request(bytes: Uint8Array): Promise<Buffer> {
    this.cancelIdle();

    const started = this.tail.then(() => this.runOne(bytes));
    // Keep the chain moving regardless of outcome — the next queued request must not
    // inherit this one's rejection.
    this.tail = started.then(
      () => undefined,
      () => undefined,
    );

    // `.finally()` returns a *new* promise, distinct from `started` — Node tracks each
    // one's rejection handling separately, so a rejected `started` awaited by the caller
    // does not stop this derived one from being reported as an unhandled rejection too.
    // The trailing `.catch(() => {})` is that promise's own handler; it does not affect
    // what `started` (returned below) resolves or rejects with.
    started.finally(() => this.scheduleIdle()).catch(() => {});
    return started;
  }

  private async runOne(bytes: Uint8Array): Promise<Buffer> {
    let timer: ReturnType<typeof globalThis.setTimeout> | null = null;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = this.setTimer(() => {
        reject(new Error(`PDF render timed out after ${this.renderTimeoutMs} ms`));
      }, this.renderTimeoutMs);
    });

    try {
      return await Promise.race([this.render(bytes), timeout]);
    } finally {
      if (timer !== null) this.clearTimer(timer);
    }
  }

  private scheduleIdle(): void {
    this.cancelIdle();
    this.idleHandle = this.setTimer(() => {
      this.idleHandle = null;
      this.onIdle();
    }, this.idleTimeoutMs);
  }

  private cancelIdle(): void {
    if (this.idleHandle === null) return;
    this.clearTimer(this.idleHandle);
    this.idleHandle = null;
  }
}
