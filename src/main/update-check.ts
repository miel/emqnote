/**
 * Parsing and comparison for the GitHub "latest release" check. Kept Electron-free, like
 * vault-io.ts and vault-scan.ts, so the rules are testable without a window — the
 * network call and the dialogs that use these functions live in updater.ts instead.
 */

export interface LatestRelease {
  version: string;
  htmlUrl: string;
}

/**
 * Extracts what the update check needs from a GitHub releases API response
 * (`GET /repos/:owner/:repo/releases/latest`). Returns null for anything that doesn't
 * look like a real release — a malformed response should mean "no update found", not a
 * crash on someone else's server error.
 */
export function parseLatestRelease(json: unknown): LatestRelease | null {
  if (typeof json !== "object" || json === null) return null;

  const tagName = (json as Record<string, unknown>).tag_name;
  const htmlUrl = (json as Record<string, unknown>).html_url;
  if (typeof tagName !== "string" || typeof htmlUrl !== "string") return null;

  const version = tagName.startsWith("v") ? tagName.slice(1) : tagName;
  if (!/^\d+\.\d+\.\d+$/.test(version)) return null;

  return { version, htmlUrl };
}

/**
 * Plain `X.Y.Z` numeric comparison — emqnote's own tags are always that shape, so a full
 * semver dependency (pre-release tags, build metadata) would be more than is needed.
 */
export function isNewerVersion(current: string, candidate: string): boolean {
  const currentParts = current.split(".").map(Number);
  const candidateParts = candidate.split(".").map(Number);

  for (let index = 0; index < 3; index += 1) {
    const currentPart = currentParts[index] ?? 0;
    const candidatePart = candidateParts[index] ?? 0;
    if (candidatePart !== currentPart) return candidatePart > currentPart;
  }

  return false;
}
