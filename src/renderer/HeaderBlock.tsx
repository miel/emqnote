import { useEffect, useRef, useState } from "react";
import type { NoteKind } from "../shared/ipc.js";
import { isoWithOffset } from "../shared/time.js";

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
}

/**
 * Shows the date and time in the local format, from an ISO value with an offset. The
 * stored value stays ISO; only what you read is localised.
 */
function formatCreated(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
}: Props): React.ReactElement {
  const [editingTime, setEditingTime] = useState(false);
  const timeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTime) timeInput.current?.focus();
  }, [editingTime]);

  const set = <K extends keyof HeaderValues>(key: K, value: HeaderValues[K]): void => {
    onChange({ ...values, [key]: value });
  };

  const isMeeting = values.kind === "meeting";

  // Enter and Tab both move on into the note; the header should never be a place you
  // get stuck when all you want is to type.
  const leaveOnEnter = (event: React.KeyboardEvent): void => {
    if (event.key === "Enter") {
      event.preventDefault();
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
          placeholder={isMeeting ? "Meeting" : "Subject (optional)"}
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
            title="Click to change the date and time"
            onClick={() => setEditingTime(true)}
          >
            {formatCreated(values.created)}
          </button>
        )}

        <button
          type="button"
          className={`kind${isMeeting ? " kind-on" : ""}`}
          title="Ctrl+Shift+G"
          onClick={() => set("kind", isMeeting ? "quick" : "meeting")}
        >
          Meeting
        </button>

        <span className="dismiss-hint">Ctrl+Enter closes</span>
      </div>

      {isMeeting && (
        <div className="header-row">
          <input
            className="location"
            placeholder="Location"
            value={values.location}
            onChange={(event) => set("location", event.target.value)}
            onKeyDown={leaveOnEnter}
          />
          <input
            className="attendees"
            placeholder="Attendees, comma separated"
            list="known-attendees"
            value={values.attendees.join(", ")}
            onChange={(event) =>
              set(
                "attendees",
                event.target.value
                  .split(",")
                  .map((name) => name.trim())
                  .filter((name) => name !== ""),
              )
            }
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
