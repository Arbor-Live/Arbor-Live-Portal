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

export function getImmichPublicBaseUrl() {
  return process.env.IMMICH_URL?.trim().replace(/\/$/, "") ?? "";
}

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

function normalizeImmichAlbumId(album: ImmichAlbum & { albumId?: string }) {
  const id = album.id ?? album.albumId;
  if (!id) {
    throw new Error("Immich album response is missing an id.");
  }
  return id;
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
  const created = await parseImmichJson<ImmichAlbum & { albumId?: string }>(response);
  return { ...created, id: normalizeImmichAlbumId(created) };
}

export async function getImmichAlbum(albumId: string) {
  const { baseUrl, apiKey } = getImmichConfig();
  const response = await fetch(`${baseUrl}/albums/${albumId}`, {
    headers: immichHeaders(apiKey),
  });
  return await parseImmichJson<ImmichAlbum>(response);
}

export async function immichAlbumExists(albumId: string) {
  const { baseUrl, apiKey } = getImmichConfig();
  const response = await fetch(`${baseUrl}/albums/${albumId}`, {
    headers: immichHeaders(apiKey),
  });
  return response.ok;
}

export function buildImmichAlbumUrl(immichAlbumId: string) {
  const baseUrl = getImmichPublicBaseUrl();
  if (!baseUrl || !immichAlbumId) return undefined;
  return `${baseUrl}/albums/${immichAlbumId}`;
}

export function buildImmichShareUrl(sharedLinkKey: string) {
  const baseUrl = getImmichPublicBaseUrl();
  if (!baseUrl || !sharedLinkKey) return undefined;
  return `${baseUrl}/share/${sharedLinkKey}`;
}

export type ImmichSharedLink = {
  id: string;
  key: string;
  token?: string;
  allowUpload?: boolean;
  allowDownload?: boolean;
};

export async function createImmichAlbumSharedLink(args: {
  albumId: string;
  description?: string;
}) {
  const { baseUrl, apiKey } = getImmichConfig();
  const response = await fetch(`${baseUrl}/shared-links`, {
    method: "POST",
    headers: immichHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      type: "ALBUM",
      albumId: args.albumId,
      allowUpload: true,
      allowDownload: true,
      description: args.description ?? "Arbor Live Portal",
    }),
  });
  const created = await parseImmichJson<ImmichSharedLink & { token?: string }>(response);
  const key = created.key ?? created.token;
  if (!key || !created.id) {
    throw new Error("Immich shared link response is missing id or key.");
  }
  return { ...created, key };
}

export function buildSharedAssetUrl(
  assetId: string,
  kind: "thumbnail" | "original" | "playback",
  shareKey: string,
) {
  const baseUrl = getImmichPublicBaseUrl();
  if (!baseUrl) {
    throw new Error("Immich public URL is not configured.");
  }
  const path =
    kind === "thumbnail" ? "thumbnail" : kind === "playback" ? "video/playback" : "original";
  const url = new URL(`${baseUrl}/api/assets/${assetId}/${path}`);
  url.searchParams.set("key", shareKey);
  if (kind === "thumbnail") {
    url.searchParams.set("size", "preview");
  }
  return url.toString();
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
  const uploaded = await parseImmichJson<ImmichAsset & { assetId?: string }>(response);
  const id = uploaded.id ?? uploaded.assetId;
  if (!id) {
    throw new Error("Immich upload response is missing an asset id.");
  }
  return { ...uploaded, id };
}

export function inferImmichAssetType(fileName: string, mimeType: string): ImmichAssetType {
  if (mimeType.startsWith("video/")) return "VIDEO";
  if (mimeType.startsWith("image/")) return "IMAGE";
  const lower = fileName.toLowerCase();
  if (/\.(mp4|mov|webm|mkv|avi|m4v)$/.test(lower)) return "VIDEO";
  return "IMAGE";
}
