import { clipboard } from "electron";
import { writeFileSync } from "node:fs";

/**
 * Writes out whatever is on the system clipboard right now, for building the phase 4
 * paste pipeline against real Outlook/Word markup instead of a guess at it.
 *
 *   emqnote --dump-clipboard=/tmp/paste-sample
 *
 * `03-markdown-dialect.md`'s corpus is the round-trip spec because it is hand-verified
 * real output, not an invented approximation of the format — the same reasoning applies
 * to `mso-list` reconstruction, and nobody has captured a real fragment yet. Copy
 * something from Outlook first, then run this against the same clipboard.
 *
 * Writes `<prefix>.html` and `<prefix>.txt` whenever present, `<prefix>.png` for an
 * image. Prints which formats were found, since a clipboard with nothing on it (or only
 * plain text, e.g. after `Ctrl+Shift+C` in some clients) is easy to mistake for a
 * capture that silently failed.
 */
export function dumpClipboard(prefix: string): void {
  const formats = clipboard.availableFormats();
  console.log(`clipboard formats: ${formats.length > 0 ? formats.join(", ") : "(empty)"}`);

  const html = clipboard.readHTML();
  if (html !== "") {
    writeFileSync(`${prefix}.html`, html, "utf8");
    console.log(`wrote ${prefix}.html (${html.length} chars)`);
  }

  const text = clipboard.readText();
  if (text !== "") {
    writeFileSync(`${prefix}.txt`, text, "utf8");
    console.log(`wrote ${prefix}.txt (${text.length} chars)`);
  }

  const image = clipboard.readImage();
  if (!image.isEmpty()) {
    const png = image.toPNG();
    writeFileSync(`${prefix}.png`, png);
    console.log(`wrote ${prefix}.png (${png.length} bytes)`);
  }

  if (html === "" && text === "" && image.isEmpty()) {
    console.log("nothing usable on the clipboard — copy something first");
  }
}
