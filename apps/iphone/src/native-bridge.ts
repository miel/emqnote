/**
 * What every native Capacitor plugin in this app has in common.
 *
 * There are two of them now — `inbox-bridge.ts` for the iOS Files route and
 * `graph-bridge.ts` for Microsoft Graph — and they answer in the same shape on purpose:
 * `ok` plus `durationMs` on success, a native `errorDomain` and `errorCode` on failure.
 * That shape came out of `08-iphone-phase-0.md` §2 wanting an evidence sheet with columns
 * to fill in, and it is worth keeping for the Graph route for the same reason.
 *
 * Nothing here imports `@capacitor/core`. Capacitor is only installed on the Mac that
 * builds the iOS app, so a hard import would break `npm run typecheck` and
 * `npm run test:iphone` everywhere else. Reading the plugin off the global costs one
 * optional chain and keeps the web build honest.
 */

/** What every operation reports back, whether it succeeded or not. */
export interface ProbeResult {
  ok: boolean;
  durationMs: number;
}

/** A rejected call arrives as an Error carrying the native domain and code. */
export interface BridgeFailure extends Error {
  errorDomain?: string;
  errorCode?: number;
  durationMs?: number;
}

interface CapacitorGlobal {
  Capacitor?: { Plugins?: Record<string, unknown> };
}

/** The named native plugin, or null in the browser — where none of them exist. */
export function nativePlugin<T>(name: string, scope: unknown = globalThis): T | null {
  const plugin = (scope as CapacitorGlobal).Capacitor?.Plugins?.[name];
  return typeof plugin === "object" && plugin !== null ? (plugin as T) : null;
}

/** Narrows a rejected native call into the fields the results sheets have columns for. */
export function failureOf(error: unknown): {
  message: string;
  errorDomain: string | null;
  errorCode: number | null;
} {
  if (typeof error !== "object" || error === null) {
    return { message: String(error), errorDomain: null, errorCode: null };
  }
  const failure = error as BridgeFailure;
  return {
    message: typeof failure.message === "string" ? failure.message : String(error),
    errorDomain: typeof failure.errorDomain === "string" ? failure.errorDomain : null,
    errorCode: typeof failure.errorCode === "number" ? failure.errorCode : null,
  };
}
