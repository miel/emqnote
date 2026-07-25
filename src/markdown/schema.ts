import { Schema } from "prosemirror-model";
import type { MarkSpec, NodeSpec } from "prosemirror-model";

/**
 * Het ProseMirror-schema van emqnote, één-op-één afgeleid van 03-markdown-dialect.md.
 *
 * De twee dingen die dit schema anders maken dan een standaard-schema, en die de
 * aanleiding voor het hele project waren:
 *
 *  1. `listItem` accepteert blok-inhoud (`paragraph block+`), niet alleen inline.
 *     Daarmee kan een alinea, tabel of geneste lijst ónder een bullet hangen.
 *  2. `underline` en `highlight` bestaan als mark, omdat markdown ze niet kent maar
 *     het dagelijkse Outlook-gebruik ze wel gebruikt.
 */

const nodes: Record<string, NodeSpec> = {
  doc: { content: "block+" },

  paragraph: { group: "block", content: "inline*" },

  heading: {
    group: "block",
    content: "inline*",
    attrs: { level: { default: 1 } },
    defining: true,
  },

  blockquote: { group: "block", content: "block+", defining: true },

  codeBlock: {
    group: "block",
    content: "text*",
    attrs: { language: { default: null } },
    code: true,
    marks: "",
    defining: true,
  },

  /** Ruwe HTML op blokniveau — in de praktijk een tabel met samengevoegde cellen. */
  htmlBlock: {
    group: "block",
    content: "text*",
    code: true,
    marks: "",
    defining: true,
  },

  horizontalRule: { group: "block" },

  bulletList: { group: "block", content: "listItem+" },

  orderedList: {
    group: "block",
    content: "listItem+",
    attrs: { start: { default: 1 } },
  },

  listItem: {
    content: "paragraph block*",
    // null = geen takenlijst-item; true/false = aangevinkt of niet
    attrs: { checked: { default: null } },
    defining: true,
  },

  /**
   * GFM-tabel. De eerste rij is altijd de koprij; een aparte koprij-node zou een
   * onderscheid introduceren dat markdown zelf niet maakt.
   */
  table: {
    group: "block",
    content: "tableRow+",
    // per kolom: "left" | "right" | "center" | null
    attrs: { align: { default: [] } },
    isolating: true,
  },

  tableRow: { content: "tableCell+" },

  tableCell: { content: "inline*", isolating: true },

  text: { group: "inline" },

  hardBreak: { group: "inline", inline: true, selectable: false },

  /** Externe afbeelding: ![alt](url). Bijlagen gebruiken wikiEmbed. */
  image: {
    group: "inline",
    inline: true,
    draggable: true,
    attrs: {
      src: { default: "" },
      alt: { default: null },
      title: { default: null },
    },
  },

  /** ![[bestand.png]] — een bijlage uit _attachments/, opgelost op naam. */
  wikiEmbed: {
    group: "inline",
    inline: true,
    draggable: true,
    atom: true,
    attrs: { target: { default: "" } },
  },

  /** [[Notitie]] of [[Notitie|alias]] */
  wikiLink: {
    group: "inline",
    inline: true,
    atom: true,
    attrs: { target: { default: "" }, alias: { default: null } },
  },
};

const marks: Record<string, MarkSpec> = {
  link: {
    attrs: { href: { default: "" }, title: { default: null } },
    inclusive: false,
  },
  highlight: {},
  underline: {},
  strong: {},
  em: {},
  strike: {},
  code: { code: true, excludes: "_" },
};

export const schema = new Schema({ nodes, marks });

/**
 * Nestvolgorde bij het schrijven van markdown, van buiten naar binnen.
 *
 * Deze volgorde is willekeurig gekozen maar ligt vást: marks zijn in ProseMirror een
 * ongeordende verzameling, terwijl markdown een boom is. Zonder een vaste volgorde
 * zou `**<u>x</u>**` en `<u>**x**</u>` allebei kunnen ontstaan uit hetzelfde document,
 * en is de rondgang niet bytegelijk.
 */
export const MARK_NESTING_ORDER = [
  "link",
  "highlight",
  "underline",
  "strong",
  "em",
  "strike",
  "code",
] as const;
