import { useEffect, useRef, useState } from "react";
import { cleanTagInput } from "../markdown/tags.js";
import type { NoteKind } from "../shared/ipc.js";
import type { Facet } from "../shared/vault-types.js";
import { isoWithOffset } from "../shared/time.js";
import { formatDateTime, type Locale } from "../shared/i18n.js";
import { useActiveRowVisible, useHoverGuard } from "./library/palette-scroll.js";
import { applySuggestion, rankTags, tokenAt } from "./tag-typeahead.js";
import { rankLocations } from "./location-typeahead.js";
import {
  applySuggestion as applyPerson,
  rankPeople,
  tokenAt as personAt,
} from "./people-typeahead.js";

/**
 * How many of the note's own tags are drawn as chips before the rest become one `+N`.
 *
 * The cell is a flex row holding the field, the chips and the completion panel, and the
 * field is the only item in it that shrinks — so a note carrying eight body tags left the
 * input at zero width, a box you could not see and could not type in. Capping the chips
 * bounds what sits beside it; `.header-tags .tags`' `min-width` in `styles.css` is the
 * other half and is what actually guarantees the ten characters.
 *
 * A count and deliberately not a measured fit. Nothing under `test/` puts the stylesheet
 * through a layout engine — jsdom has no cascade and paints nothing, which is what
 * `styles-header.test.ts` exists to work around — so a version that measured the row
 * would be the one piece of this header no test could reach.
 */
const MAX_TAG_CHIPS = 3;

/**
 * Comma and semicolon both separate; Outlook uses semicolons, so fingers expect it.
 *
 * At module scope rather than inside the component because the completion has to agree
 * with it: `people-typeahead.ts`'s `SEPARATOR` is this same set, and `rankPeople` is fed
 * this function's answer for the *live* text of the field.
 */
export function parseAttendees(text: string): string[] {
  return text
    .split(/[,;]/)
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

/**
 * Space separates too: nobody types commas between hashtags.
 *
 * Module scope for `parseAttendees`' reason, and here it is load-bearing: what the field
 * already holds is worked out from the text on screen, so this runs on every keystroke
 * that the completion is open for. `tag-typeahead.ts`'s `SEPARATOR` is the same set and
 * says so.
 */
export function parseTags(text: string): string[] {
  return text
    .split(/[,;\s]/)
    .map(cleanTagInput)
    .filter((tag) => tag !== "");
}

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
 * `capture` is the original: subject, time and tags. `reader` is the library, where the
 * title is owned by Rename — that renames the file too, so a second way to change it
 * would let the two drift.
 *
 * The fields themselves no longer differ. Both variants show When, Where, Who and Tags;
 * only the subject depends on the window.
 */
export type HeaderVariant = "capture" | "reader";

interface Props {
  values: HeaderValues;
  onChange: (values: HeaderValues) => void;
  onLeave: () => void;
  locale: Locale;
  t: (key: string) => string;
  variant?: HeaderVariant;
  /**
   * The `#tag`s the note body carries, drawn beside the field as read-only chips (B65).
   *
   * A separate prop and not part of `values`, because `values.tags` is what this field
   * *writes* and these are not: they are removed in the note, where they were written.
   * The window computes them on load and on its own save debounce — never per keystroke,
   * `bodyTagsOf` serializing the body to get at them.
   */
  bodyTags?: string[];
  /**
   * The subject input, so the capture window can put the caret there on `show()`
   * instead of in the editor. Only meaningful in the `capture` variant — the reader
   * renders no subject field at all, since its title belongs to Rename.
   */
  subjectRef?: React.RefObject<HTMLInputElement | null>;
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
 * **The Tags, Where and Who fields all complete from the vault's own lists** (B66, B73,
 * B81). This used to say none of them did, with an argument that has since expired.
 * Two of its three findings still hold and are why the completion is shaped as it is: a
 * native `<datalist>` will not close on a second click, which is Chromium's behaviour and
 * not reachable from here — so this is a real combobox drawn as plain elements — and
 * `remembered.ts`'s per-machine list was the wrong source, thin and personal where the
 * vault holds the real one. The third finding was that serving the vault's list would put
 * a scan on the capture path, and that was true before phase 5: `IPC.tagSuggestions` is a
 * read of the index the launch scan already fills, asked on the field's **first focus**
 * and never at startup, so nothing about it is on the hotkey's way — and the same is true
 * of the two lists that followed it.
 *
 * People were left out of B66 on the argument that a name is not drawn from a closed set
 * the way a tag is. Use answered that the other way (B81), and it is B73's answer for
 * Where: there are a handful of colleagues, and they get typed again and again with a
 * slightly different spelling each time. The set is as closed as the vault's own history
 * of it, which is the only set any of these three complete from.
 *
 * The chips after the field are the other half of B65: tags written in the note body are
 * shown here but not editable here, since the note is where they are removed.
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
  bodyTags = [],
  subjectRef,
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
   *
   * **This buffer and `tagText` below belong to one note, and nothing in here knows when
   * that note changes** — which is why both callers give this component a `key` that
   * changes with the note, so switching remounts it and the buffers go with it. Without
   * that, half-typed text from the note you just left is shown for the note you just
   * opened, and the next blur *commits* it: measured in the running app, a note whose
   * `tags: [klantx, offerte, klachten]` were replaced by the three characters left in the
   * field from a different note. It is the same reasoning `Editor`'s `setDoc` states for
   * replacing the whole state rather than swapping the document — leftovers from a file
   * you are no longer looking at must not be able to reach it.
   */
  const [attendeeText, setAttendeeText] = useState<string | null>(null);

  /** Same for tags, and for the same reason: a separator has to survive being typed. */
  const [tagText, setTagText] = useState<string | null>(null);

  /**
   * The Tags field's completion (B66).
   *
   * `vaultTags` is fetched **once, on the field's first focus** — not on mount, and above
   * all not at startup: this component is rendered into the capture window before the
   * hotkey ever shows it, and an IPC round trip on that path is exactly what the 80 ms
   * budget is measured against. `null` means "not asked yet".
   *
   * `active` is the highlighted row and `-1` means the list is up with nothing chosen, so
   * Enter falls through to committing the field rather than accepting a suggestion
   * nobody moved to.
   */
  const [vaultTags, setVaultTags] = useState<Facet[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [active, setActive] = useState(-1);
  const tagInput = useRef<HTMLInputElement>(null);
  const suggestList = useRef<HTMLUListElement>(null);
  const hoverGuard = useHoverGuard();

  /**
   * The same four pieces again for the Where field (B73), deliberately not shared with the
   * four above: two lists can be open at once — Tab moves from Tags to Where without either
   * field losing focus in between — and one `active` between them would move the highlight
   * in a panel nobody is looking at. `null` means not asked, exactly as `vaultTags` does.
   */
  const [vaultLocations, setVaultLocations] = useState<Facet[] | null>(null);
  const [suggestingWhere, setSuggestingWhere] = useState(false);
  const [activeWhere, setActiveWhere] = useState(-1);
  const whereInput = useRef<HTMLInputElement>(null);
  const whereList = useRef<HTMLUListElement>(null);
  const whereHoverGuard = useHoverGuard();

  /**
   * And again for the Who field (B81). Three sets of the same six, for the reason above:
   * Tab walks Tags → Where → Who without any of them losing focus first, so more than one
   * panel can be up at once and a shared `active` would move the highlight in a panel
   * nobody is looking at.
   */
  const [vaultPeople, setVaultPeople] = useState<Facet[] | null>(null);
  const [suggestingWho, setSuggestingWho] = useState(false);
  const [activeWho, setActiveWho] = useState(-1);
  const whoInput = useRef<HTMLInputElement>(null);
  const whoList = useRef<HTMLUListElement>(null);
  const whoHoverGuard = useHoverGuard();

  const tagValue = tagText ?? values.tags.map((tag) => `#${tag}`).join(" ");
  const caret = tagInput.current?.selectionStart ?? tagValue.length;
  // The note's own body tags go in as *applied*, not as candidates: B65 already hoists
  // them into the frontmatter on save, so completing the field to one would write nothing
  // — and the chip saying so is an inch to the left.
  //
  // **The field's half is read off the live text, never off `values.tags`.** That array is
  // the *committed* one — `commitTags` only runs on blur or Enter — so a tag deleted from
  // the field went on being filtered out of its own vault list until the field was left
  // and re-entered, which is exactly the reported bug: delete `#klantx`, type `#kl`, and
  // the tag twenty other notes carry is not offered. `rankTags` already excludes the token
  // being typed from this check, so a half-typed tag does not disappear from its own list.
  // The Where field never had this because it has no buffer to disagree with.
  const suggestions = suggesting
    ? rankTags(vaultTags ?? [], tokenAt(tagValue, caret).value, [
        ...parseTags(tagValue),
        ...bodyTags,
      ])
    : [];
  const listOpen = suggestions.length > 0;

  // The whole field, not a token: a location is one value that may hold spaces, so there
  // is no caret arithmetic here at all — see `location-typeahead.ts`.
  const whereSuggestions = suggestingWhere
    ? rankLocations(vaultLocations ?? [], values.location)
    : [];
  const whereListOpen = whereSuggestions.length > 0;

  // A token again, like Tags and unlike Where — the field holds a list. `applied` is the
  // live text for the reason written above it; here it is that way from the first version.
  const whoValue = attendeeText ?? values.attendees.join(", ");
  const whoCaret = whoInput.current?.selectionStart ?? whoValue.length;
  const whoSuggestions = suggestingWho
    ? rankPeople(vaultPeople ?? [], personAt(whoValue, whoCaret).value, parseAttendees(whoValue))
    : [];
  const whoListOpen = whoSuggestions.length > 0;

  useActiveRowVisible(suggestList, active, suggestions);
  useActiveRowVisible(whereList, activeWhere, whereSuggestions);
  useActiveRowVisible(whoList, activeWho, whoSuggestions);

  useEffect(() => {
    if (editingTime) timeInput.current?.focus();
  }, [editingTime]);

  const set = <K extends keyof HeaderValues>(key: K, value: HeaderValues[K]): void => {
    onChange({ ...values, [key]: value });
  };

  const commitAttendees = (): void => {
    if (attendeeText === null) return;
    set("attendees", parseAttendees(attendeeText));
    setAttendeeText(null);
  };

  const commitTags = (): void => {
    if (tagText === null) return;
    set("tags", parseTags(tagText));
    setTagText(null);
  };

  const closeSuggestions = (): void => {
    setSuggesting(false);
    setActive(-1);
  };

  /**
   * Asked once per window, on the first focus of the field. A failure is swallowed into
   * an empty list on purpose: the field goes on working as a plain input, which is what
   * it was, and a dialog about a completion nobody asked for would be worse than none.
   */
  const openSuggestions = (): void => {
    setSuggesting(true);
    setActive(-1);
    if (vaultTags !== null) return;
    setVaultTags([]);
    void window.emqnote
      .tagSuggestions()
      .then(setVaultTags)
      .catch(() => setVaultTags([]));
  };

  const closeWhereSuggestions = (): void => {
    setSuggestingWhere(false);
    setActiveWhere(-1);
  };

  /** `openSuggestions`' rule for the other field: once per window, on first focus. */
  const openWhereSuggestions = (): void => {
    setSuggestingWhere(true);
    setActiveWhere(-1);
    if (vaultLocations !== null) return;
    setVaultLocations([]);
    void window.emqnote
      .locationSuggestions()
      .then(setVaultLocations)
      .catch(() => setVaultLocations([]));
  };

  /**
   * Accepting is a plain replacement, and there is no caret to put back.
   *
   * `accept` below has to restore one because a tag lands in the middle of a list; a
   * location *is* the field, so the browser parking the caret at the end is exactly right.
   * The focus call stays: the row's `mousedown` is prevented, so a click never moved focus
   * off the input, but a keyboard accept has nothing to restore and this costs nothing.
   */
  const acceptWhere = (location: string): void => {
    set("location", location);
    closeWhereSuggestions();
    whereInput.current?.focus();
  };

  const closeWhoSuggestions = (): void => {
    setSuggestingWho(false);
    setActiveWho(-1);
  };

  /** `openSuggestions`' rule for the third field: once per window, on first focus. */
  const openWhoSuggestions = (): void => {
    setSuggestingWho(true);
    setActiveWho(-1);
    if (vaultPeople !== null) return;
    setVaultPeople([]);
    void window.emqnote
      .peopleSuggestions()
      .then(setVaultPeople)
      .catch(() => setVaultPeople([]));
  };

  /**
   * Accepting a name, which lands in the middle of a list — so this is `accept`'s shape
   * rather than `acceptWhere`'s, caret arithmetic included. The text goes into the raw
   * buffer, not through `set`: a name is only split out into `values.attendees` when the
   * field is left, and completing one is not leaving it.
   */
  const acceptWho = (name: string): void => {
    const input = whoInput.current;
    const next = applyPerson(whoValue, input?.selectionStart ?? whoValue.length, name);
    setAttendeeText(next.text);
    closeWhoSuggestions();
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(next.caret, next.caret);
    });
  };

  /** `onTagKeyDown`'s rules, including the Escape one, for the Who field. */
  const onWhoKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape" && suggestingWho) {
      event.preventDefault();
      event.stopPropagation();
      closeWhoSuggestions();
      return;
    }

    if (!whoListOpen) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      whoHoverGuard.keyboardMoved();
      const count = whoSuggestions.length;
      setActiveWho((current) =>
        event.key === "ArrowDown"
          ? (current + 1) % count
          : current <= 0
            ? count - 1
            : current - 1,
      );
      return;
    }

    if ((event.key === "Enter" || event.key === "Tab") && activeWho >= 0) {
      event.preventDefault();
      acceptWho(whoSuggestions[activeWho]!.name);
    }
  };

  /** `onTagKeyDown`'s rules, including the Escape one, for the Where field. */
  const onWhereKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape" && suggestingWhere) {
      event.preventDefault();
      event.stopPropagation();
      closeWhereSuggestions();
      return;
    }

    if (!whereListOpen) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      whereHoverGuard.keyboardMoved();
      const count = whereSuggestions.length;
      setActiveWhere((current) =>
        event.key === "ArrowDown"
          ? (current + 1) % count
          : current <= 0
            ? count - 1
            : current - 1,
      );
      return;
    }

    if ((event.key === "Enter" || event.key === "Tab") && activeWhere >= 0) {
      event.preventDefault();
      acceptWhere(whereSuggestions[activeWhere]!.name);
    }
  };

  const accept = (tag: string): void => {
    const input = tagInput.current;
    const next = applySuggestion(tagValue, input?.selectionStart ?? tagValue.length, tag);
    setTagText(next.text);
    closeSuggestions();
    // The caret has to be put back after React has written the new value, or the browser
    // parks it at the end of the field — which is where it happens to belong when the
    // completed tag was the last one, and nowhere near it when it was not.
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(next.caret, next.caret);
    });
  };

  /**
   * The Tags field's own keys, which run ahead of `leaveOnEnter` below.
   *
   * Enter and Tab accept the highlighted suggestion *while the list is open with a row
   * chosen*; with the list closed, or open with nothing highlighted, Enter still commits
   * and leaves for the note, which is what the field has always done.
   *
   * Escape closes the list and calls `stopPropagation()`. That is not tidiness: a
   * `preventDefault()` does not end an event, and without stopping it here the same press
   * also runs `Library.tsx`'s window-level Escape branch and jumps out of the header
   * entirely — one press, two things, which is the bug the 18 August 2026 batch fixed
   * everywhere else.
   */
  const onTagKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape" && suggesting) {
      event.preventDefault();
      event.stopPropagation();
      closeSuggestions();
      return;
    }

    if (!listOpen) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      hoverGuard.keyboardMoved();
      const count = suggestions.length;
      setActive((current) =>
        event.key === "ArrowDown"
          ? (current + 1) % count
          : current <= 0
            ? count - 1
            : current - 1,
      );
      return;
    }

    if ((event.key === "Enter" || event.key === "Tab") && active >= 0) {
      event.preventDefault();
      accept(suggestions[active]!.name);
    }
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
          ref={subjectRef}
          // `.title-field` is the note editor's title, shared; `.subject` is only the
          // margin below it, which the reader's title does not want.
          className="title-field subject"
          placeholder={t("capture.title")}
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
              // Two lines, and the value comes first. `.created` truncates with an
              // ellipsis now (`styles.css`) rather than painting out of its cell at a
              // narrow window, and a truncated date you cannot read anywhere is a worse
              // bug than the one that fixed — the tooltip is where it stays reachable.
              // The action hint keeps its place underneath, since that is what the
              // tooltip was for and a button still has to say what clicking it does.
              // Composed rather than a new string: nothing here needs translating that
              // is not already translated.
              title={[
                formatDateTime(locale, values.created),
                t("capture.changeTime"),
              ]
                .filter((line) => line !== "")
                .join("\n")}
              onClick={() => setEditingTime(true)}
            >
              {/* A note this app did not write has no `created:`, and `formatDateTime`
                  hands an unparseable date straight back — so an empty string rendered an
                  empty button, a cell with nothing in it, and a header that read as
                  broken. `openNote` now falls back to the file's mtime, which covers the
                  case that produced the report; this covers every other way the field can
                  arrive empty, since a control with no label is never the right answer. */}
              {formatDateTime(locale, values.created) || t("capture.noTime")}
            </button>
          )}
        </div>

        <span className="header-label">{t("capture.tagsLabel")}</span>
        <div className="header-cell header-tags">
          <input
            ref={tagInput}
            className="tags"
            placeholder={t("capture.tags")}
            value={tagValue}
            onChange={(event) => {
              setTagText(event.target.value);
              openSuggestions();
            }}
            onFocus={openSuggestions}
            // The list closes with the field, and committing here is what it has always
            // done. A row's own `mousedown` is prevented, so clicking a suggestion cannot
            // reach this first — which it otherwise would, blur running ahead of click.
            onBlur={() => {
              closeSuggestions();
              commitTags();
            }}
            onKeyDown={(event) => {
              onTagKeyDown(event);
              if (!event.defaultPrevented) leaveOnEnter(event);
            }}
          />

          {/* Tags written in the note body (B65). Shown, never edited — a chip is not a
              control, and the tooltip says where the tag does come out. */}
          {bodyTags.slice(0, MAX_TAG_CHIPS).map((tag) => (
            <span key={tag} className="tag-chip" title={t("capture.tagsInNote")}>
              #{tag}
            </span>
          ))}

          {/* The rest as one chip, so a note with a dozen body tags cannot crowd the
              field out of its own cell. Still a `.tag-chip` and still not a control:
              unfolding it would be a second place these are read, and they are already
              in the note, which is where they are removed. The names are in the tooltip
              rather than dropped — a count with no way to see what it counts is worse
              than the crowding it fixes. */}
          {bodyTags.length > MAX_TAG_CHIPS && (
            <span
              className="tag-chip tag-chip-more"
              title={t("capture.tagsMore")
                .replace("{count}", String(bodyTags.length - MAX_TAG_CHIPS))
                .replace(
                  "{tags}",
                  bodyTags
                    .slice(MAX_TAG_CHIPS)
                    .map((tag) => `#${tag}`)
                    .join(" "),
                )}
            >
              +{bodyTags.length - MAX_TAG_CHIPS}
            </span>
          )}

          {listOpen && (
            <ul className="tag-suggest" ref={suggestList}>
              {suggestions.map((facet, index) => (
                <li key={facet.name}>
                  {/* A real button with the tag as visible text, and the name carrying
                      `.context-menu-label` — which is not decoration: that is the class
                      `library-window.ts`'s `--click-button` reads a row's name off, and
                      the button's own `textContent` runs the count on (`#klantx24`), so
                      without it the self-test could only reach a row by a label that
                      changes whenever the vault does. */}
                  <button
                    type="button"
                    className={index === active ? "tag-suggest-on" : undefined}
                    // **Not a tab stop.** This list sits between its own input and the
                    // next field in DOM order, and it is open from the moment the field
                    // is focused — so a plain Tab moved focus into the first row instead
                    // of on to Where, the input's blur then closed the list and unmounted
                    // the button holding focus, and the press after that started again
                    // from the top of the document. That is the whole of "tabbing from
                    // Tags to Where needs an extra press". A completion list is walked
                    // with the arrows, exactly like `ContextMenu` and the task rows.
                    tabIndex={-1}
                    // Ahead of blur, which would commit the field and close this list
                    // before the click ever landed.
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={(event) => {
                      if (hoverGuard.hover(event)) setActive(index);
                    }}
                    onClick={() => accept(facet.name)}
                  >
                    <span className="context-menu-label tag-suggest-name">#{facet.name}</span>
                    <span className="tag-suggest-count">{facet.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <span className="header-label">{t("capture.where")}</span>
        <div className="header-cell header-where">
          <input
            ref={whereInput}
            className="location"
            placeholder={t("capture.location")}
            value={values.location}
            onChange={(event) => {
              set("location", event.target.value);
              openWhereSuggestions();
            }}
            onFocus={openWhereSuggestions}
            onBlur={closeWhereSuggestions}
            onKeyDown={(event) => {
              onWhereKeyDown(event);
              if (!event.defaultPrevented) leaveOnEnter(event);
            }}
          />

          {whereListOpen && (
            <ul className="tag-suggest" ref={whereList}>
              {whereSuggestions.map((facet, index) => (
                <li key={facet.name}>
                  {/* The Tags list's row, verbatim — including `.context-menu-label` on
                      the name, which `--click-button` reads a row off. One surface, so the
                      two completions in this header cannot come to look like two things. */}
                  <button
                    type="button"
                    className={index === activeWhere ? "tag-suggest-on" : undefined}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={(event) => {
                      if (whereHoverGuard.hover(event)) setActiveWhere(index);
                    }}
                    onClick={() => acceptWhere(facet.name)}
                  >
                    <span className="context-menu-label tag-suggest-name">{facet.name}</span>
                    <span className="tag-suggest-count">{facet.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <span className="header-label">{t("capture.who")}</span>
        <div className="header-cell header-who">
          <input
            ref={whoInput}
            className="attendees"
            placeholder={t("capture.people")}
            value={whoValue}
            onChange={(event) => {
              setAttendeeText(event.target.value);
              openWhoSuggestions();
            }}
            onFocus={openWhoSuggestions}
            onBlur={() => {
              closeWhoSuggestions();
              commitAttendees();
            }}
            onKeyDown={(event) => {
              onWhoKeyDown(event);
              if (!event.defaultPrevented) leaveOnEnter(event);
            }}
          />

          {whoListOpen && (
            <ul className="tag-suggest" ref={whoList}>
              {whoSuggestions.map((facet, index) => (
                <li key={facet.name}>
                  {/* The other two lists' row again, verbatim — one surface, so the three
                      completions in this header cannot come to look like three things. */}
                  <button
                    type="button"
                    className={index === activeWho ? "tag-suggest-on" : undefined}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={(event) => {
                      if (whoHoverGuard.hover(event)) setActiveWho(index);
                    }}
                    onClick={() => acceptWho(facet.name)}
                  >
                    <span className="context-menu-label tag-suggest-name">{facet.name}</span>
                    <span className="tag-suggest-count">{facet.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
