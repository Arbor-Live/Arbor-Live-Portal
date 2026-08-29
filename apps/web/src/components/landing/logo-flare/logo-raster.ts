import { logoPixelSize } from "./pipeline";

/** Arbor Live mark — filled white for luma/alpha sampling in the flare pipeline. */
const LOGO_SVG =
  '<svg width="307" height="408" viewBox="0 0 307 408" fill="none" ' +
  'xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M306.123 282.262L232.616 143.318L159.109 4.37317C156.024 -1.4577 ' +
  "150.976 -1.4577 147.891 4.37317L74.3843 143.318L0.877873 282.262C-1.61592 " +
  "286.974 1.50023 292.865 6.48677 292.865H124.51C130.823 292.865 135.187 " +
  "297.169 132.957 301.195L113.905 335.579L79.4612 397.746C76.9355 402.304 " +
  "80.092 408 85.1423 408H154.031H220.401C226.571 408 230.427 401.041 227.342 " +
  "395.473L194.157 335.579L174.737 300.529C172.684 296.824 176.7 292.865 " +
  "182.509 292.865H300.514C305.499 292.865 308.615 286.974 306.123 282.262Z\" " +
  'fill="white"/></svg>';

export async function rasterizeLogo(
  size: number,
  signal?: AbortSignal,
): Promise<HTMLCanvasElement> {
  if (signal?.aborted) {
    throw new DOMException("Logo rasterization aborted.", "AbortError");
  }
  const [width, height] = logoPixelSize(size);
  const pad = 3;
  const canvas = document.createElement("canvas");
  canvas.width = width + pad * 2;
  canvas.height = height + pad * 2;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create the logo raster canvas.");
  const image = new Image();
  let abort: (() => void) | undefined;
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not decode the Arbor logo SVG."));
    abort = () => {
      image.onload = null;
      image.onerror = null;
      image.src = "";
      reject(new DOMException("Logo rasterization aborted.", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
  if (signal?.aborted) abort?.();
  else {
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG)}`;
  }
  try {
    await loaded;
  } finally {
    image.onload = null;
    image.onerror = null;
    if (abort) signal?.removeEventListener("abort", abort);
  }
  if (signal?.aborted) {
    throw new DOMException("Logo rasterization aborted.", "AbortError");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, pad, pad, width, height);
  return canvas;
}
