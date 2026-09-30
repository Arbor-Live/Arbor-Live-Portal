import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { renderImagePdfBuffer } from "./render-image";

/** A phone photo with a padded APP0, EXIF, and an MPF preview after the end marker. */
const PHONE_JPEG = new Uint8Array(
  readFileSync(new URL("../../../apps/web/public/promo/coho.jpg", import.meta.url)),
);

function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function solidPng(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x80)]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", pixels),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("renderImagePdfBuffer", () => {
  it("embeds a camera JPEG that react-pdf cannot parse as uploaded", async () => {
    const pdf = await renderImagePdfBuffer(PHONE_JPEG, "jpg");
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("/DCTDecode");
    // 1600×1200 photo → landscape Letter page.
    expect(text).toMatch(/\/MediaBox \[0 0 792 612\]/);
  });

  it("puts a tall PNG on a portrait page", async () => {
    const pdf = await renderImagePdfBuffer(solidPng(40, 100), "png");
    const text = pdf.toString("latin1");
    expect(text).toContain("/Subtype /Image");
    expect(text).toMatch(/\/MediaBox \[0 0 612 792\]/);
  });
});
