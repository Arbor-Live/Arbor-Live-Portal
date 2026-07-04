export function getImmichServerConfig() {
  const baseUrl = process.env.IMMICH_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.IMMICH_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    throw new Error("Immich is not configured. Set IMMICH_URL and IMMICH_API_KEY.");
  }
  return { baseUrl: `${baseUrl}/api`, apiKey };
}

export function inferImmichAssetType(fileName: string, mimeType: string): "IMAGE" | "VIDEO" {
  if (mimeType.startsWith("video/")) return "VIDEO";
  if (mimeType.startsWith("image/")) return "IMAGE";
  const lower = fileName.toLowerCase();
  if (/\.(mp4|mov|webm|mkv|avi|m4v)$/.test(lower)) return "VIDEO";
  return "IMAGE";
}
