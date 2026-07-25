import { useEffect, useRef, useState } from "react";
import type { NoteKind } from "../shared/ipc.js";
import { isoWithOffset } from "../shared/time.js";
import { formatDateTime, type Locale } from "../shared/i18n.js";

export interface HeaderValues {
  kind: NoteKind;
  subject: string;
  created: string;
  location: string;
  attendees: string[];
}

interface Props {
  values: HeaderValues;
  onChange: (values: HeaderValues) => void;
  knownAttendees: string[];
  onLeave: () => void;
  locale: Locale;
  t: (key: string) => string;
}

/**
 * The header block: two fields for a quick note, five for a meeting.
 *
 * Deliberately two shapes rather than one. Always showing the full block makes "just
 * get a thought down" too heavy, and that is the very action the app has to win at;
 * only ever showing date and time makes meetings too thin, while attendees is exactly
 * what you want to search on later.
 */
export function HeaderBlock({
  values,
  onChange,
  knownAttendees,
  onLeave,
  locale,
  t,
}: Props): React.ReactElement {
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

  // Enter moves on into the note; the header should never be a place you get stuck
  // when all you want is to type.
  const leaveOnEnter = (event: React.KeyboardEvent): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitAttendees();
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
    <div className="header">
      <div className="header-row">
        <input
          className="subject"
          placeholder={isMeeting ? t("capture.meeting") : t("capture.subject")}
          value={values.subject}
          onChange={(event) => set("subject", event.target.value)}
          onKeyDown={leaveOnEnter}
        />

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

        <button
          type="button"
          className={`kind${isMeeting ? " kind-on" : ""}`}
          title="Ctrl+Shift+G"
          onClick={() => set("kind", isMeeting ? "quick" : "meeting")}
        >
          {t("capture.meeting")}
        </button>

        <span className="dismiss-hint">{t("capture.dismiss")}</span>
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
