import type { DiffLine } from "../shared/vault-types.js";

export type { DiffLine };

/**
 * A line-by-line diff for the conflict banner's "regel-voor-regel-diff" —
 * `02-technisch-ontwerp.md` §5.2. Pure, no Electron, no filesystem: the caller reads
 * both files and hands over their lines.
 *
 * The classic O(n·m) longest-common-subsequence table, not the O(ND) Myers algorithm a
 * real diff tool uses. That trade is deliberate at this scale: a note is at most a few
 * hundred lines, `n·m` there is a few tens of thousands of table cells, and the simpler
 * algorithm is also the simpler one to read and get right. If conflicts ever show up on
 * something large enough for that to matter, that is the moment to revisit it — not
 * before.
 */

export function diffLines(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:].
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ kind: "same", text: a[i]! });
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      result.push({ kind: "removed", text: a[i]! });
      i += 1;
    } else {
      result.push({ kind: "added", text: b[j]! });
      j += 1;
    }
  }
  while (i < n) {
    result.push({ kind: "removed", text: a[i]! });
    i += 1;
  }
  while (j < m) {
    result.push({ kind: "added", text: b[j]! });
    j += 1;
  }

  return result;
}

/** `diffLines` for whole file contents, splitting on `\n` — what the conflict banner actually has. */
export function diffText(a: string, b: string): DiffLine[] {
  return diffLines(a.split("\n"), b.split("\n"));
}
