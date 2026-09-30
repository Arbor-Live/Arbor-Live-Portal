import { Document, Image, Page, StyleSheet } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";

export type PrintableImageFormat = "png" | "jpg";

const styles = StyleSheet.create({
  page: { padding: 18 },
  image: { width: "100%", height: "100%", objectFit: "contain" },
});

/** Pixel size from a PNG IHDR or a JPEG SOF marker; null when unreadable. */
function imageSize(
  bytes: Uint8Array,
  format: PrintableImageFormat,
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === "png") {
    if (bytes.byteLength < 24) return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  let offset = 2;
  while (offset + 9 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    const length = view.getUint16(offset + 2);
    // SOF0–SOF15 carry the frame size, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * Rebuilds a JPEG with only what decoding needs. react-pdf's JPEG parser
 * ignores segment lengths, so padded metadata (e.g. an APP0 longer than the
 * standard 16 bytes) or a preview image appended after the end marker (MPF, as
 * cameras and phones export) makes it throw — and the image silently drops out
 * of the PDF. APP0–APP13/APP15 are metadata only; APP14 (Adobe) stays because
 * it sets how CMYK data is read.
 */
function sanitizeJpeg(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  // Walk the header segments to the first start-of-scan.
  for (;;) {
    if (offset + 4 > bytes.byteLength || bytes[offset] !== 0xff) return bytes;
    const marker = bytes[offset + 1]!;
    if (marker === 0xda) break;
    const end = offset + 2 + view.getUint16(offset + 2);
    const isMetadata = marker >= 0xe0 && marker <= 0xef && marker !== 0xee;
    if (!isMetadata) kept.push(bytes.subarray(offset, end));
    offset = end;
  }
  // In scan data a literal 0xFF is always followed by 0x00 or a restart
  // marker, so the first FF D9 is the real end of image.
  let scanEnd = bytes.byteLength;
  for (let i = offset; i + 1 < bytes.byteLength; i += 1) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) {
      scanEnd = i + 2;
      break;
    }
  }
  kept.push(bytes.subarray(offset, scanEnd));

  const out = new Uint8Array(kept.reduce((sum, part) => sum + part.byteLength, 0));
  let at = 0;
  for (const part of kept) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

/**
 * Wraps one image in a single Letter page, scaled to fit, so the warehouse
 * printer gets a PDF for every job. Landscape images print on a landscape page.
 */
export async function renderImagePdfBuffer(
  bytes: Uint8Array,
  format: PrintableImageFormat,
): Promise<Buffer> {
  const data = format === "jpg" ? sanitizeJpeg(bytes) : bytes;
  const size = imageSize(data, format);
  const orientation = size && size.width > size.height ? "landscape" : "portrait";
  const pdf = await renderToBuffer(
    <Document>
      <Page size="LETTER" orientation={orientation} style={styles.page}>
        <Image src={{ data: Buffer.from(data), format }} style={styles.image} />
      </Page>
    </Document>,
  );
  return Buffer.from(pdf);
}
