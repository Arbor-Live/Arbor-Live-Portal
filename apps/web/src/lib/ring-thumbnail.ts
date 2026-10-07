/**
 * Ring stores clip thumbnails as a single H.264 keyframe, not an image. This
 * decodes one with WebCodecs into a JPEG object URL; real images pass through.
 */

const MAX_CONCURRENT = 4;
const cache = new Map<string, Promise<string | null>>();
const waiting: (() => void)[] = [];
let running = 0;

async function withSlot<T>(run: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await run();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

function startsWithStartCode(bytes: Uint8Array) {
  return bytes[0] === 0 && bytes[1] === 0 && (bytes[2] === 1 || (bytes[2] === 0 && bytes[3] === 1));
}

/** `avc1.PPCCLL` from the stream's sequence parameter set. */
function h264Codec(bytes: Uint8Array) {
  for (let index = 0; index + 4 < bytes.length; index++) {
    if (bytes[index] !== 0 || bytes[index + 1] !== 0 || bytes[index + 2] !== 1) continue;
    if ((bytes[index + 3] & 0x1f) !== 7) continue;
    const hex = (byte: number) => byte.toString(16).padStart(2, "0");
    return `avc1.${hex(bytes[index + 4])}${hex(bytes[index + 5])}${hex(bytes[index + 6])}`;
  }
  return null;
}

function decodeKeyframe(bytes: Uint8Array): Promise<Blob | null> {
  const codec = h264Codec(bytes);
  if (!codec || typeof VideoDecoder === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    let gotFrame = false;
    const decoder = new VideoDecoder({
      output: (frame) => {
        gotFrame = true;
        const canvas = document.createElement("canvas");
        canvas.width = frame.displayWidth;
        canvas.height = frame.displayHeight;
        canvas.getContext("2d")?.drawImage(frame, 0, 0);
        frame.close();
        canvas.toBlob(resolve, "image/jpeg", 0.85);
      },
      error: () => resolve(null),
    });
    try {
      decoder.configure({ codec, optimizeForLatency: true });
      decoder.decode(new EncodedVideoChunk({ type: "key", timestamp: 0, data: bytes }));
      decoder.flush().then(
        () => {
          decoder.close();
          if (!gotFrame) resolve(null);
        },
        () => resolve(null),
      );
    } catch {
      resolve(null);
    }
  });
}

async function load(url: string) {
  const response = await fetch(url);
  if (!response.ok) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!startsWithStartCode(bytes)) return url;
  const jpeg = await decodeKeyframe(bytes);
  return jpeg ? URL.createObjectURL(jpeg) : null;
}

/** A URL an `<img>` can show for this thumbnail, or null if it can't be shown. */
export function ringThumbnailSrc(url: string): Promise<string | null> {
  let src = cache.get(url);
  if (!src) {
    src = withSlot(() => load(url)).catch(() => null);
    cache.set(url, src);
  }
  return src;
}
