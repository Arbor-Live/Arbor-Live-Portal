export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/** Posters render at 4:5 on the site and Instagram's feed crop. */
export const POSTER_ASPECT_RATIO = 4 / 5;

/** Work-post cover images render into short landscape cards. */
export const HERO_LANDSCAPE_ASPECT_RATIO = 16 / 9;

/** Avatars render inside a circle. */
export const AVATAR_ASPECT_RATIO = 1;

/** Backend avatar limit (`account.ts` MAX_AVATAR_BYTES). */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const MAX_OUTPUT_EDGE = 2048;
const MAX_DECODE_EDGE = 2560;

export function aspectRatioLabel(aspect: number): string {
  if (Math.abs(aspect - POSTER_ASPECT_RATIO) < 0.001) return "4:5 (poster shape)";
  if (Math.abs(aspect - HERO_LANDSCAPE_ASPECT_RATIO) < 0.001) return "16:9 (landscape)";
  if (Math.abs(aspect - 1) < 0.001) return "square (1:1)";
  return "its recommended shape";
}

/**
 * Center-crops a raster image to a square and downscales it to `maxEdge`,
 * returning a small JPEG. Non-raster inputs (SVG/GIF) pass through untouched.
 * Avatars upload straight to Convex storage, so they skip the R2 compression
 * path; this keeps them small without a full crop UI.
 */
export async function normalizeAvatarFile(file: File, maxEdge = 512): Promise<File> {
  if (!isRasterImageFile(file)) return file;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(objectUrl);
    const source = Math.min(image.naturalWidth, image.naturalHeight);
    if (source <= 0) return file;
    const edge = Math.min(maxEdge, source);
    const canvas = document.createElement("canvas");
    drawWithWhiteMatte(
      canvas,
      image,
      {
        sx: (image.naturalWidth - source) / 2,
        sy: (image.naturalHeight - source) / 2,
        sw: source,
        sh: source,
      },
      edge,
      edge,
    );
    const blob = await encodeUnderLimit(canvas, MAX_AVATAR_BYTES, "image/jpeg");
    return new File([blob], jpegFileName(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * GIF (animation) and SVG (vector) are intentionally left untouched; canvas
 * re-encoding would flatten or rasterize them.
 */
export function isRasterImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") &&
    file.type !== "image/svg+xml" &&
    file.type !== "image/gif"
  );
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read that image."));
    image.src = src;
  });
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image."))),
      type,
      quality,
    );
  });
}

/** Encodes `canvas` at decreasing quality until it fits under `maxBytes`. */
export async function encodeUnderLimit(
  canvas: HTMLCanvasElement,
  maxBytes: number,
  type: "image/jpeg" | "image/webp",
): Promise<Blob> {
  let quality = 0.92;
  let blob = await canvasToBlob(canvas, type, quality);
  while (blob.size > maxBytes && quality > 0.5) {
    quality = Math.max(0.5, quality - 0.1);
    blob = await canvasToBlob(canvas, type, quality);
  }
  return blob;
}

export function jpegFileName(name: string): string {
  const base = name.trim().replace(/\.[^./\\]+$/, "") || "poster";
  return `${base}.jpg`;
}

/** Draws to a white matte so transparent PNGs don't turn black as JPEG. */
export function drawWithWhiteMatte(
  canvas: HTMLCanvasElement,
  image: CanvasImageSource,
  source: { sx: number; sy: number; sw: number; sh: number },
  width: number,
  height: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, source.sx, source.sy, source.sw, source.sh, 0, 0, width, height);
}

/**
 * Downscales and re-encodes an oversized raster image so it fits under the
 * backend's 5 MB upload limit. Returns the original file when it is already
 * small enough or cannot be processed.
 */
export async function compressImageToLimit(file: File): Promise<File> {
  if (!isRasterImageFile(file) || file.size <= IMAGE_UPLOAD_MAX_BYTES) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(objectUrl);
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = longest > MAX_DECODE_EDGE ? MAX_DECODE_EDGE / longest : 1;
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    drawWithWhiteMatte(
      canvas,
      image,
      { sx: 0, sy: 0, sw: image.naturalWidth, sh: image.naturalHeight },
      width,
      height,
    );

    const webp = await encodeUnderLimit(canvas, IMAGE_UPLOAD_MAX_BYTES, "image/webp");
    const jpeg =
      webp.size > IMAGE_UPLOAD_MAX_BYTES
        ? await encodeUnderLimit(canvas, IMAGE_UPLOAD_MAX_BYTES, "image/jpeg")
        : null;
    const best = jpeg && jpeg.size < webp.size ? { blob: jpeg, type: "image/jpeg" } : { blob: webp, type: "image/webp" };

    const extension = best.type === "image/jpeg" ? "jpg" : "webp";
    const base = file.name.trim().replace(/\.[^./\\]+$/, "") || "image";
    return new File([best.blob], `${base}.${extension}`, {
      type: best.type,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export { MAX_OUTPUT_EDGE };
