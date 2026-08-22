import { parseNote } from "@emqnote/core/markdown";
import { buildOutboxItem } from "./capture.js";
import { freshDraft, localDateTimeValue, type OutboxItem } from "./draft.js";

/** Which of §3's two write strategies a probe run is exercising. */
export type ProbeStrategy = "direct" | "move";

/**
 * The Phase 0 probe note, built through the capture path the app really uses.
 *
 * `08-iphone-phase-0.md` §4 asks for probe bytes carrying valid frontmatter, Unicode
 * text, an attendee, a body tag and an unchecked task — the five things whose survival
 * across the File Provider is worth knowing about. It deliberately goes through
 * `buildOutboxItem` rather than being a hand-written fixture: a probe typed out by hand
 * is a second place markdown gets written (B6), and a Phase 0 no-go caused by a probe the
 * app would never have produced is a wasted trip to the Mac.
 */
export function buildProbeNote(
  strategy: ProbeStrategy,
  sequence: number,
  now = new Date(),
): OutboxItem {
  const label = `Phase 0 ${strategy} ${String(sequence).padStart(3, "0")}`;
  const draft = {
    ...freshDraft(now),
    title: label,
    when: localDateTimeValue(now),
    where: "iPhone",
    who: "Els Bakker",
    body:
      `Phase 0 probe voor ${label} — geschreven via iOS Files naar OneDrive.\n\n` +
      `Unicode dat heel moet blijven: café, ≠, →, æøå, 🇳🇱.\n\n` +
      `Getagd met #phase0 zodat de scan op de PC iets te vinden heeft.\n\n` +
      `- [ ] Bevestig dat deze notitie ongewijzigd op de PC is aangekomen\n`,
  };

  const item = buildOutboxItem(draft, parseNote(draft.body).doc, `probe-${strategy}-${sequence}`, now);
  if (item === null) throw new Error(`probe note ${label} produced no bytes`);
  return item;
}
