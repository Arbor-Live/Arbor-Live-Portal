const SIGNED_URL_MARKERS = ["X-Amz-Signature", "X-Amz-Algorithm", "sig="];

/** True when Next.js image optimization can safely cache and transform this URL. */
export function isOptimizableRemoteImageUrl(src: string): boolean {
  try {
    const url = new URL(src);
    if (url.protocol !== "https:") return false;

    const search = url.search;
    if (SIGNED_URL_MARKERS.some((marker) => search.includes(marker))) {
      return false;
    }

    // Signed S3 API host — use raw img until R2_PUBLIC_BASE_URL is configured.
    if (url.hostname.endsWith(".r2.cloudflarestorage.com")) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
