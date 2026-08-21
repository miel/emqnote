function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * ISO 8601 with a timezone offset — never `Z`, never milliseconds.
 *
 * `Date.toISOString()` gives UTC, and that is wrong here for a reason that only shows
 * up months later: a note taken at 14:32 in summer reads back as 12:32, and in winter
 * as 13:32. The offset keeps the time you actually wrote it.
 *
 * Shared between main and renderer on purpose. It existed twice, and the copy in the
 * header block quietly used `toISOString()` — so changing the date and time of a note
 * by hand wrote a value the dialect does not allow.
 */
export function isoWithOffset(when: Date): string {
  const offsetMinutes = -when.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);

  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    `T${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}` +
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  );
}
