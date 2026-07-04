export type ImmichAssetType = "IMAGE" | "VIDEO";

export type ImmichAsset = {
  id: string;
  type: ImmichAssetType;
  originalFileName: string;
  localDateTime?: string;
};

export type ImmichAlbum = {
  id: string;
  albumName: string;
  assetCount?: number;
  assets?: ImmichAsset[];
};

export function getImmichConfig() {
  const baseUrl = process.env.IMMICH_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.IMMICH_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    throw new Error("Immich is not configured. Set IMMICH_URL and IMMICH_API_KEY.");
  }
  return { baseUrl: `${baseUrl}/api`, apiKey };
}

function immichHeaders(apiKey: string, extra?: Record<string, string>) {
  return {
    "x-api-key": apiKey,
    Accept: "application/json",
    ...extra,
  };
}

async function parseImmichJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Immich API error (${response.status}): ${body || response.statusText}`);
  }
  return (await response.json()) as T;
}

export async function createImmichAlbum(args: { albumName: string; description?: string }) {
  const { baseUrl, apiKey } = getImmichConfig();
  const response = await fetch(`${baseUrl}/albums`, {
    method: "POST",
    headers: immichHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      albumName: args.albumName,
      description: args.description ?? "",
    }),
  });
  return await parseImmichJson<ImmichAlbum>(response);
}

export async function getImmichAlbum(albumId: string) {
  const { baseUrl, apiKey } = getImmichConfig();
  const response = await fetch(`${baseUrl}/albums/${albumId}`, {
    headers: immichHeaders(apiKey),
  });
  return await parseImmichJson<ImmichAlbum>(response);
}

export async function addAssetsToImmichAlbum(albumId: string, assetIds: string[]) {
  if (!assetIds.length) return;
  const { baseUrl, apiKey } = getImmichConfig();
  const response = await fetch(`${baseUrl}/albums/${albumId}/assets`, {
    method: "PUT",
    headers: immichHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify({ ids: assetIds }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Immich add-to-album failed (${response.status}): ${body || response.statusText}`);
  }
}

export async function uploadImmichAsset(file: Blob, fileName: string) {
  const { baseUrl, apiKey } = getImmichConfig();
  const formData = new FormData();
  formData.append("assetData", file, fileName);
  const response = await fetch(`${baseUrl}/assets`, {
    method: "POST",
    headers: { "x-api-key": apiKey, Accept: "application/json" },
    body: formData,
  });
  return await parseImmichJson<ImmichAsset>(response);
}

export function inferImmichAssetType(fileName: string, mimeType: string): ImmichAssetType {
  if (mimeType.startsWith("video/")) return "VIDEO";
  if (mimeType.startsWith("image/")) return "IMAGE";
  const lower = fileName.toLowerCase();
  if (/\.(mp4|mov|webm|mkv|avi|m4v)$/.test(lower)) return "VIDEO";
  return "IMAGE";
}

export function buildImmichProxyUrl(assetId: string, kind: "thumbnail" | "original" | "playback") {
  const suffix =
    kind === "thumbnail"
      ? "thumbnail?size=preview"
      : kind === "playback"
        ? "video/playback"
        : "original";
  return `/api/immich/assets/${assetId}/${suffix}`;
}
