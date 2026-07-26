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
 * way to change it would let the two drift — and where the kind toggle is deliberately
 * absent: flipping a meeting to quick discards its location and attendees
 * (`saveNote` in `vault-io.ts`), which is right in capture where you toggle before you
 * type, and destructive on a note that already has them.
 */
export type HeaderVariant = "capture" | "reader";

interface Props {
  values: HeaderValues;
  onChange: (values: HeaderValues) => void;
  knownAttendees: string[];
  knownTags: string[];
  onLeave: () => void;
  locale: Locale;
  t: (key: string) => string;
  variant?: HeaderVariant;
}

/**
 * The header block: two fields for a quick note, five for a meeting.
 *
 * Deliberately two shapes rather than one. Always showing the full block makes "just
 * get a thought down" too heavy, and that is the very action the app has to win at;
 * only ever showing date and time makes meetings too thin, while attendees is exactly
 * what you want to search on later.
 *
 * The same component serves the library reader, so that the parsing of attendees and
 * tags, and the date editing, exist once. Two copies would drift, and the drift would
 * show up as a note whose fields behave differently depending on which window you last
 * touched it in.
 */
export function HeaderBlock({
  values,
  onChange,
  knownAttendees,
  knownTags,
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
      <div className="header-row">
        {inCapture && (
          <input
            className="subject"
            placeholder={isMeeting ? t("capture.meeting") : t("capture.subject")}
            value={values.subject}
            onChange={(event) => set("subject", event.target.value)}
            onKeyDown={leaveOnEnter}
          />
        )}

        {editingTime ? (
          <input
            ref={timeInput}
            className="created"
            type="datetime-local"
            value={asLocalInput(values.created)}
            onChange={(event) => set("created", isoWithOffset(new Date(event.target.value)))}
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

        {/* Capture only. In the library this note already is what it is, and toggling
            it to quick would throw away its location and attendees on the next save. */}
        {inCapture && (
          <button
            type="button"
            className={`kind${isMeeting ? " kind-on" : ""}`}
            title="Ctrl+Shift+G"
            onClick={() => set("kind", isMeeting ? "quick" : "meeting")}
          >
            {t("capture.meeting")}
          </button>
        )}

        {/* The tag field lives in row one, where the "Ctrl+Enter closes" hint used to
            sit — that hint has moved to the status bar. Tags belong on a quick note as
            much as on a meeting, and row two only exists for meetings; adding a row for
            every note would make "just get a thought down" heavier, which is the one
            thing this window may not do. */}
        <input
          className="tags"
          placeholder={t("capture.tags")}
          list="known-tags"
          value={tagText ?? values.tags.map((tag) => `#${tag}`).join(" ")}
          onChange={(event) => setTagText(event.target.value)}
          onBlur={commitTags}
          onKeyDown={leaveOnEnter}
        />
        <datalist id="known-tags">
          {knownTags.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      </div>

      {isMeeting && (
        <div className="header-row">
          <input
            className="location"
            placeholder={t("capture.location")}
            value={values.location}
            onChange={(event) => set("location", event.target.value)}
            onKeyDown={leaveOnEnter}
          />
          <input
            className="attendees"
            placeholder={t("capture.attendees")}
            list="known-attendees"
            value={attendeeText ?? values.attendees.join(", ")}
            onChange={(event) => setAttendeeText(event.target.value)}
            onBlur={commitAttendees}
            onKeyDown={leaveOnEnter}
          />
          <datalist id="known-attendees">
            {knownAttendees.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
      )}
    </div>
  );
}
