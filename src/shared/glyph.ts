/**
 * The emqnote mark, computed as pixels rather than shipped as a file.
 *
 * A tray icon has to look crisp at 16, 22 and 32 pixels, and on macOS it also has to
 * adapt to a light or dark menu bar. That is awkward with one PNG and unwieldy with a
 * handful of them; computing it is simpler than maintaining it.
 *
 * The shape: a rounded rectangle with three cut-out text lines, the bottom one shorter.
 * Recognisable as a note even at 16 pixels.
 */

function roundedRectDistance(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  halfWidth: number,
  halfHeight: number,
  radius: number,
): number {
  const dx = Math.abs(x - centerX) - (halfWidth - radius);
  const dy = Math.abs(y - centerY) - (halfHeight - radius);
  const outsideX = Math.max(dx, 0);
  const outsideY = Math.max(dy, 0);
  const outside = Math.sqrt(outsideX * outsideX + outsideY * outsideY);
  const inside = Math.min(Math.max(dx, dy), 0);
  return outside + inside - radius;
}

/** Antialiasing: 1 fully inside, 0 fully outside, half a pixel of transition between. */
function coverage(distance: number): number {
  return Math.min(Math.max(0.5 - distance, 0), 1);
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Draws the mark as an RGBA buffer, row by row from top to bottom.
 *
 * @param size length of one side in pixels
 * @param color colour of the shape; the cut-outs become transparent
 */
export function drawGlyph(size: number, color: Rgb): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);

  const center = size / 2;
  const half = size * 0.4;
  const radius = size * 0.13;

  // Three text lines: the bottom one shorter, so it does not read as a barcode.
  const lines = [
    { y: size * 0.36, halfWidth: size * 0.23 },
    { y: size * 0.5, halfWidth: size * 0.23 },
    { y: size * 0.64, halfWidth: size * 0.13 },
  ];
  const lineHalfHeight = Math.max(size * 0.035, 0.5);
  const lineRadius = Math.min(lineHalfHeight, size * 0.03);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      const body = coverage(
        roundedRectDistance(px, py, center, center, half, half, radius),
      );

      let cut = 0;
      for (const line of lines) {
        const lineCoverage = coverage(
          roundedRectDistance(
            px,
            py,
            center,
            line.y,
            line.halfWidth,
            lineHalfHeight,
            lineRadius,
          ),
        );
        cut = Math.max(cut, lineCoverage);
      }

      const alpha = body * (1 - cut);
      const offset = (y * size + x) * 4;
      pixels[offset] = color.r;
      pixels[offset + 1] = color.g;
      pixels[offset + 2] = color.b;
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }

  return pixels;
}

/** Electron's createFromBitmap expects BGRA rather than RGBA. */
export function rgbaToBgra(rgba: Uint8Array): Buffer {
  const bgra = Buffer.allocUnsafe(rgba.length);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    bgra[offset] = rgba[offset + 2]!;
    bgra[offset + 1] = rgba[offset + 1]!;
    bgra[offset + 2] = rgba[offset]!;
    bgra[offset + 3] = rgba[offset + 3]!;
  }
  return bgra;
}
