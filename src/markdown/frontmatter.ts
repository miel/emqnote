import { parse as parseYaml } from "yaml";

export type NoteType = "quick" | "meeting";
export type NoteSource = "manual" | "email" | "import";

export interface Frontmatter {
  title: string;
  type: NoteType;
  created: string;
  modified?: string;
  location?: string;
  attendees?: string[];
  attachments?: string[];
  tags?: string[];
  source?: NoteSource;
  /** Fields we do not know about — added by Obsidian, for instance. Preserved as-is. */
  extra?: Record<string, unknown>;
}

/** Fixed order. Not alphabetical, not insertion order — fixed, for readable diffs. */
const FIELD_ORDER = [
  "title",
  "type",
  "created",
  "modified",
  "location",
  "attendees",
  "attachments",
  "tags",
  "source",
] as const;

const ARRAY_FIELDS = new Set(["attendees", "attachments", "tags"]);

const MAX_INLINE_ARRAY_WIDTH = 100;

/** Characters a YAML scalar may not start with unless it is quoted. */
const LEADING_INDICATORS = new Set([
  "-", "?", ":", ",", "[", "]", "{", "}", "#", "&", "*", "!",
  "|", ">", "'", '"', "%", "@", "`",
]);

/**
 * Would this string come back as something other than a string?
 * `true`, `12`, `null`, `~` and friends therefore need quoting.
 */
function reparsesAsNonString(value: string): boolean {
  if (value === "") return true;
  try {
    return typeof parseYaml(value, { version: "1.2" }) !== "string";
  } catch {
    return true;
  }
}

function needsQuotes(value: string): boolean {
  if (value === "") return true;
  if (value !== value.trim()) return true;
  if (LEADING_INDICATORS.has(value[0]!)) return true;
  // Only a colon *followed by a space* breaks YAML, which is what keeps timestamps
  // like 2026-07-25T14:32:00+02:00 unquoted.
  if (value.includes(": ") || value.endsWith(":")) return true;
  if (value.includes(" #")) return true;
  if (value.includes("\n")) return true;
  return reparsesAsNonString(value);
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function emitScalar(value: string): string {
  return needsQuotes(value) ? quote(value) : value;
}

/** Inside an inline array a comma or bracket is a problem too. */
function emitInlineItem(value: string): string {
  if (needsQuotes(value) || /[,[\]{}]/.test(value)) return quote(value);
  return value;
}

function emitArray(key: string, items: string[]): string[] {
  const inline = `${key}: [${items.map(emitInlineItem).join(", ")}]`;
  if (inline.length <= MAX_INLINE_ARRAY_WIDTH) return [inline];
  return [`${key}:`, ...items.map((item) => `  - ${emitScalar(item)}`)];
}

function emitUnknown(key: string, value: unknown): string[] {
  if (Array.isArray(value)) {
    return emitArray(key, value.map((entry) => String(entry)));
  }
  if (value === null || value === undefined) return [];
  if (typeof value === "object") {
    // Nested structures do not occur in our own notes; if Obsidian adds one we hand it
    // back unchanged using the JSON-like flow notation.
    return [`${key}: ${JSON.stringify(value)}`];
  }
  if (typeof value === "string") return [`${key}: ${emitScalar(value)}`];
  return [`${key}: ${String(value)}`];
}

/**
 * Writes frontmatter deterministically: fixed field order, empty fields omitted.
 * Includes the `---` delimiters and the closing newline.
 */
export function serializeFrontmatter(frontmatter: Frontmatter): string {
  const lines: string[] = ["---"];

  for (const key of FIELD_ORDER) {
    const value = frontmatter[key];
    if (value === undefined || value === null) continue;

    if (ARRAY_FIELDS.has(key)) {
      const items = value as string[];
      if (items.length === 0) continue;
      lines.push(...emitArray(key, items));
    } else {
      const text = String(value);
      if (text === "") continue;
      lines.push(`${key}: ${emitScalar(text)}`);
    }
  }

  for (const [key, value] of Object.entries(frontmatter.extra ?? {})) {
    lines.push(...emitUnknown(key, value));
  }

  lines.push("---");
  return lines.join("\n");
}

function asStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  return [String(value)];
}

export function parseFrontmatter(yaml: string): Frontmatter {
  const raw = (parseYaml(yaml, { version: "1.2" }) ?? {}) as Record<string, unknown>;

  const known = new Set<string>(FIELD_ORDER);
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!known.has(key)) extra[key] = value;
  }

  const frontmatter: Frontmatter = {
    title: raw.title === undefined ? "" : String(raw.title),
    type: raw.type === "meeting" ? "meeting" : "quick",
    created: raw.created === undefined ? "" : String(raw.created),
  };

  if (raw.modified !== undefined) frontmatter.modified = String(raw.modified);
  if (raw.location !== undefined) frontmatter.location = String(raw.location);

  const attendees = asStringArray(raw.attendees);
  if (attendees) frontmatter.attendees = attendees;
  const attachments = asStringArray(raw.attachments);
  if (attachments) frontmatter.attachments = attachments;
  const tags = asStringArray(raw.tags);
  if (tags) frontmatter.tags = tags;

  if (raw.source !== undefined) frontmatter.source = String(raw.source) as NoteSource;
  if (Object.keys(extra).length > 0) frontmatter.extra = extra;

  return frontmatter;
}
