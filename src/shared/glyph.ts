/**
 * Het merkteken van emqnote, als pixels berekend in plaats van als bestand.
 *
 * Een tray-icoon moet er scherp uitzien op 16, 22 en 32 pixels, en op macOS ook nog
 * meekleuren met een lichte of donkere menubalk. Dat is met één PNG lastig en met een
 * handvol PNG's onhandig; berekenen is hier eenvoudiger dan beheren.
 *
 * De vorm: een afgeronde rechthoek met drie uitgespaarde tekstregels, waarvan de
 * onderste korter is. Herkenbaar als notitie, ook op 16 pixels.
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

/** Randverzachting: 1 volledig binnen, 0 volledig buiten, daartussen een halve pixel. */
function coverage(distance: number): number {
  return Math.min(Math.max(0.5 - distance, 0), 1);
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Tekent het merkteken als RGBA-buffer, rij voor rij van boven naar beneden.
 *
 * @param size lengte van een zijde in pixels
 * @param color kleur van de vorm; de uitsparingen worden doorzichtig
 */
export function drawGlyph(size: number, color: Rgb): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);

  const center = size / 2;
  const half = size * 0.4;
  const radius = size * 0.13;

  // Drie tekstregels: de onderste korter, zodat het geen streepjescode wordt.
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

/** Electron's createFromBitmap verwacht BGRA in plaats van RGBA. */
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
