/**
 * The box a marker hangs off, so that it sits on the line the item's text sits on.
 *
 * Three things can stand in the marker slot and the bullet is the reference: it is a
 * native `::marker`, which is laid out against the **baseline of the item's first line
 * box**. The star and the checkbox were positioned against the *item* instead — `top: 0`
 * on a `position: relative` `li` — and on a plain one-line item those two frames land in
 * the same place, which is why they measured as aligned and read as aligned.
 *
 * Paste a picture into the line and they come apart. `.wiki-embed-image-box` is
 * `vertical-align: text-bottom`, so the line box grows *upward*: the text and the bullet
 * ride down to the bottom of the picture together, and the star and the box stay pinned
 * to the top of the item, a picture's height away from the line they belong to.
 *
 * The fix is to give them the frame the bullet has. This anchor is an empty inline-block
 * of no size, so it joins the first line box, contributes nothing to it, and — an empty
 * inline-block taking its baseline from its bottom margin edge — sits exactly *on* that
 * line's baseline. Markers are then positioned against the anchor with `bottom`, which
 * makes every offset a distance from the baseline, the same thing the bullet is placed
 * by. A picture in the line moves the anchor and the marker goes with it.
 *
 * It also has to be a widget rather than a pseudo-element, which is the change from how
 * B72's star shipped: `listItem` is `paragraph block*`, so an inline `::before` on the
 * `li` is wrapped in an anonymous block of its own and never joins the paragraph's first
 * line at all. That is what forced `position: absolute` there in the first place.
 */
export function markerAnchor(marker: HTMLElement): HTMLElement {
  const anchor = document.createElement("span");
  anchor.className = "marker-anchor";
  // It is furniture, not text: nothing in it is editable and the caret has no business
  // landing inside it.
  anchor.contentEditable = "false";
  anchor.appendChild(marker);
  return anchor;
}
