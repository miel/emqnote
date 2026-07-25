/**
 * Schrijft `build/icon.png`, waar electron-builder de .icns en .ico van maakt.
 *
 *   npm run icons
 *
 * De PNG wordt hier met de hand gecodeerd in plaats van met een beeldbibliotheek. Dat
 * scheelt een afhankelijkheid voor iets wat één keer per project verandert, en het
 * houdt het icoon in de broncode in plaats van als binair bestand in de repository.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { drawGlyph } from "../src/shared/glyph.js";

const SIZE = 512;

function crc32(data: Buffer): number {
  let table = crcTable;
  if (table === null) {
    table = new Int32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[index] = value;
    }
    crcTable = table;
  }

  let crc = -1;
  for (const byte of data) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

let crcTable: Int32Array | null = null;

function chunk(type: string, payload: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);

  const body = Buffer.concat([Buffer.from(type, "ascii"), payload]);

  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));

  return Buffer.concat([length, body, checksum]);
}

function encodePng(rgba: Uint8Array, size: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits per kanaal
  header[9] = 6; // kleurtype: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // standaard filtering
  header[12] = 0; // niet interlaced

  // Elke rij krijgt een filterbyte; 0 betekent "geen filter".
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let row = 0; row < size; row += 1) {
    const target = row * (size * 4 + 1);
    raw[target] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + row * size * 4, size * 4).copy(
      raw,
      target + 1,
    );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const pixels = drawGlyph(SIZE, { r: 110, g: 168, b: 254 });

mkdirSync("build", { recursive: true });
writeFileSync("build/icon.png", encodePng(pixels, SIZE));

console.log(`build/icon.png geschreven (${SIZE}x${SIZE})`);
