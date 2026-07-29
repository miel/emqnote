import { useEffect, useRef, useState } from "react";
import { cleanTagInput } from "../markdown/tags.js";
import type { NoteKind } from "../shared/ipc.js";
import { isoWithOffset } from "../shared/time.js";
import { formatDateTime, type Locale } from "../shared/i18n.js";

export interface HeaderValues {
  kind: NoteKind;
  subject: string;
  created: string;
  location: string;
  attendees: string[];
  tags: string[];
}

/**
 * Where the block is being shown, which decides what belongs in it.
 *
 * `capture` is the original: subject, time, the meeting toggle and tags. `reader` is the
 * library, where the title is owned by Rename — that renames the file too, so a second
 * way to change it would let the two drift.
 *
 * The fields themselves no longer differ. Both variants show When, Where, Who and Tags;
 * only the subject and which direction the kind button goes depend on the window.
 */
export type HeaderVariant = "capture" | "reader";

interface Props {
  values: HeaderValues;
  onChange: (values: HeaderValues) => void;
  onLeave: () => void;
  locale: Locale;
  t: (key: string) => string;
  variant?: HeaderVariant;
}

/**
 * The header block: one shape, on every note, in both windows.
 *
 * It used to be two shapes — date and tags for a quick note, five fields for a meeting —
 * on the argument that always showing the full block makes "just get a thought down"
 * too heavy. Six weeks of use answered that the other way (B20): where and who are
 * wanted on ordinary notes too, the row appearing and disappearing made the window jump
 * while typing, and the gating was what made `type: meeting` a destructive switch
 * instead of a label.
 *
 * A fixed two-row grid, so nothing moves. A narrow first column of muted labels — When,
 * Where, Who, Tags — removes the guesswork that a row of bare placeholder text left
 * behind, and one grid replaces the old special case where the tag field was 22% wide
 * in capture and `1 1 auto` in the reader.
 *
 * Rejected: chips for the people field. A free-text list of names wants to be wide and
 * to stay one line; the reader header's own history is of a header that grew and shrank.
 *
 * **The tag and people fields have no completion, deliberately.** They used to carry a
 * `<datalist>` fed from `remembered.ts` — the names and tags typed on *this machine*.
 * Two things were wrong with it and only one was fixable. The list was thin and
 * personal where the vault holds the real one, and a native datalist will not close on
 * a second click, which is Chromium's behaviour and not reachable from here. Serving
 * the vault's own list meant either putting a scan on the capture path, which B-nothing
 * permits and `CLAUDE.md` forbids outright, or building a real combobox — new UI, on
 * the one window with a 16 ms keystroke budget, to complete fields that hold a word or
 * two. Plain inputs are the better trade. The vault-wide lists still exist where they
 * belong: the library's Tags and People filters, from `facets()`.
 *
 * The same component serves both windows, so that the parsing of attendees and tags, and
 * the date editing, exist once. Two copies would drift, and the drift would show up as a
 * note whose fields behave differently depending on which window you last touched it in.
 */
export function HeaderBlock({
  values,
  onChange,
  onLeave,
  locale,
  t,
  variant = "capture",
}: Props): React.ReactElement {
  const inCapture = variant === "capture";
  const [editingTime, setEditingTime] = useState(false);
  const timeInput = useRef<HTMLInputElement>(null);

  /**
   * The attendee field keeps its own raw text while you type.
   *
   * It used to derive its value from the array on every keystroke, which meant a space
   * or a comma was parsed away the instant it was typed: "Jan" + space became ["Jan"]
   * became "Jan", with the space gone. Two names could never be entered at all. The
   * text is only split into names when the field is left.
   */
  const [attendeeText, setAttendeeText] = useState<string | null>(null);

  /** Same for tags, and for the same reason: a separator has to survive being typed. */
  const [tagText, setTagText] = useState<string | null>(null);

  useEffect(() => {
    if (editingTime) timeInput.current?.focus();
  }, [editingTime]);

  const set = <K extends keyof HeaderValues>(key: K, value: HeaderValues[K]): void => {
    onChange({ ...values, [key]: value });
  };

  const isMeeting = values.kind === "meeting";

  // Comma and semicolon both separate; Outlook uses semicolons, so fingers expect it.
  const parseAttendees = (text: string): string[] =>
    text
      .split(/[,;]/)
      .map((name) => name.trim())
      .filter((name) => name !== "");

  const commitAttendees = (): void => {
    if (attendeeText === null) return;
    set("attendees", parseAttendees(attendeeText));
    setAttendeeText(null);
  };

  // Space separates too: nobody types commas between hashtags.
  const parseTags = (text: string): string[] =>
    text
      .split(/[,;\s]/)
      .map(cleanTagInput)
      .filter((tag) => tag !== "");

  const commitTags = (): void => {
    if (tagText === null) return;
    set("tags", parseTags(tagText));
    setTagText(null);
  };

  // Enter moves on into the note; the header should never be a place you get stuck
  // when all you want is to type.
  const leaveOnEnter = (event: React.KeyboardEvent): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitAttendees();
      commitTags();
      onLeave();
    }
  };

  /** `datetime-local` wants no timezone and no seconds. */
  const asLocalInput = (iso: string): string => {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return "";
    const pad = (value: number): string => String(value).padStart(2, "0");
    return (
      `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}` +
      `T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
    );
  };

  return (
    <div className={`header header-${variant}`}>
      {inCapture && (
        <input
          className="subject"
          placeholder={isMeeting ? t("capture.meeting") : t("capture.subject")}
          value={values.subject}
          onChange={(event) => set("subject", event.target.value)}
          onKeyDown={leaveOnEnter}
        />
      )}

      <div className="header-grid">
        <span className="header-label">{t("capture.when")}</span>
        <div className="header-cell header-when">
          {editingTime ? (
            <input
              ref={timeInput}
              className="created"
              type="datetime-local"
              value={asLocalInput(values.created)}
              onChange={(event) =>
                set("created", isoWithOffset(new Date(event.target.value)))
              }
              onBlur={() => setEditingTime(false)}
              onKeyDown={leaveOnEnter}
            />
          ) : (
            <button
              type="button"
              className="created"
              title={t("capture.changeTime")}
              onClick={() => setEditingTime(true)}
            >
              {formatDateTime(locale, values.created)}
            </button>
          )}

          {/* Two-way in capture, where you set it before typing. In the reader it
              appears only on a note that is not a meeting yet, so the button only ever
              promotes — with the fields no longer gated on the kind, that is a one-line
              change to `type:` and nothing else, which is what B10 wants. */}
          {(inCapture || !isMeeting) && (
            <button
              type="button"
              className={`kind${isMeeting ? " kind-on" : ""}`}
              title="Ctrl+Shift+G"
              onClick={() => set("kind", isMeeting ? "quick" : "meeting")}
            >
              {inCapture ? t("capture.meeting") : t("capture.markMeeting")}
            </button>
          )}
        </div>

        <span className="header-label">{t("capture.tagsLabel")}</span>
        <div className="header-cell">
          <input
            className="tags"
            placeholder={t("capture.tags")}
            value={tagText ?? values.tags.map((tag) => `#${tag}`).join(" ")}
            onChange={(event) => setTagText(event.target.value)}
            onBlur={commitTags}
            onKeyDown={leaveOnEnter}
          />
        </div>

        <span className="header-label">{t("capture.where")}</span>
        <div className="header-cell">
          <input
            className="location"
            placeholder={t("capture.location")}
            value={values.location}
            onChange={(event) => set("location", event.target.value)}
            onKeyDown={leaveOnEnter}
          />
        </div>

        <span className="header-label">{t("capture.who")}</span>
        <div className="header-cell">
          <input
            className="attendees"
            placeholder={t("capture.people")}
            value={attendeeText ?? values.attendees.join(", ")}
            onChange={(event) => setAttendeeText(event.target.value)}
            onBlur={commitAttendees}
            onKeyDown={leaveOnEnter}
          />
        </div>
      </div>
    </div>
  );
}
