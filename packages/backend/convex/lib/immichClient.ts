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

export function isImmichConfigured() {
  return Boolean(process.env.IMMICH_URL?.trim() && process.env.IMMICH_API_KEY?.trim());
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
  const created = await parseImmichJson<ImmichSharedLink>(response);
  if (!created.key || !created.id) {
    throw new Error("Immich shared link response is missing id or key.");
  }
  return created;
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

export type ImmichLibraryAsset = {
  id: string;
  originalFileName: string;
  createdAt: number;
};

export type ImmichAlbumSummary = {
  id: string;
  albumName: string;
  assetCount: number;
  thumbnailAssetId?: string;
  updatedAt: number;
};

type ImmichSearchAssetResponse = {
  assets: {
    items: Array<{
      id: string;
      type?: ImmichAssetType;
      originalFileName?: string;
      fileCreatedAt?: string;
      localDateTime?: string;
    }>;
    nextPage?: string | null;
  };
};

function parseImmichAssetTimestamp(asset: {
  fileCreatedAt?: string;
  localDateTime?: string;
}) {
  const raw = asset.fileCreatedAt ?? asset.localDateTime;
  if (!raw) return Date.now();
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

export function toImmichDayStart(date: string) {
  return `${date.trim()}T00:00:00.000Z`;
}

export function toImmichDayEnd(date: string) {
  return `${date.trim()}T23:59:59.999Z`;
}

type ImmichAlbumListItem = ImmichAlbum & {
  albumThumbnailAssetId?: string | null;
  assetCount?: number;
  updatedAt?: string;
};

export async function listImmichAlbumSummaries() {
  const { baseUrl, apiKey } = getImmichConfig();
  const response = await fetch(`${baseUrl}/albums`, {
    headers: immichHeaders(apiKey),
  });
  const albums = await parseImmichJson<ImmichAlbumListItem[]>(response);
  const summaries: ImmichAlbumSummary[] = [];
  for (const album of albums) {
    const id = album.id ?? (album as { albumId?: string }).albumId;
    if (!id) continue;
    const updatedAt = album.updatedAt ? Date.parse(album.updatedAt) : 0;
    summaries.push({
      id,
      albumName: album.albumName?.trim() || "Untitled album",
      assetCount: album.assetCount ?? 0,
      thumbnailAssetId: album.albumThumbnailAssetId ?? undefined,
      updatedAt: Number.isNaN(updatedAt) ? 0 : updatedAt,
    });
  }
  return summaries.sort(
    (a, b) => b.updatedAt - a.updatedAt || a.albumName.localeCompare(b.albumName),
  );
}

export async function searchImmichLibraryImages(args: {
  page?: number;
  size?: number;
  albumId?: string;
  takenAfter?: string;
  takenBefore?: string;
}) {
  const { baseUrl, apiKey } = getImmichConfig();
  const page = args.page ?? 1;
  const size = Math.min(Math.max(args.size ?? 24, 1), 100);
  const body: Record<string, unknown> = {
    page,
    size,
    type: "IMAGE",
    order: "desc",
    // v3 changed the default visibility from "timeline" to "any"; pin it so the
    // library picker keeps showing only timeline assets (not archived/hidden).
    visibility: "timeline",
  };

  const albumId = args.albumId?.trim();
  if (albumId) {
    body.albumIds = [albumId];
  }
  if (args.takenAfter) {
    body.takenAfter = args.takenAfter;
  }
  if (args.takenBefore) {
    body.takenBefore = args.takenBefore;
  }

  const response = await fetch(`${baseUrl}/search/metadata`, {
    method: "POST",
    headers: immichHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const result = await parseImmichJson<ImmichSearchAssetResponse>(response);
  const items = (result.assets?.items ?? [])
    .filter((asset) => asset.id && (asset.type === undefined || asset.type === "IMAGE"))
    .map((asset) => ({
      id: asset.id,
      originalFileName: asset.originalFileName?.trim() || "image",
      createdAt: parseImmichAssetTimestamp(asset),
    }));

  const nextPageRaw = result.assets?.nextPage;
  const nextPage =
    nextPageRaw === null || nextPageRaw === undefined || nextPageRaw === ""
      ? null
      : String(nextPageRaw);

  return { items, nextPage };
}

export type ImmichAlbumAsset = {
  id: string;
  type: ImmichAssetType;
  originalFileName: string;
};

/**
 * Lists every asset in an album via POST /search/metadata. v3 removed the
 * `assets` array from the GET /albums/:id response, so album membership must be
 * resolved through search. Pages through all results and keeps images + videos.
 */
export async function listImmichAlbumAssets(albumId: string) {
  const { baseUrl, apiKey } = getImmichConfig();
  const assets: ImmichAlbumAsset[] = [];
  let page = 1;

  // Bounded loop so a misbehaving `nextPage` can never spin forever.
  for (let guard = 0; guard < 1000; guard += 1) {
    const response = await fetch(`${baseUrl}/search/metadata`, {
      method: "POST",
      headers: immichHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify({ albumIds: [albumId], page, size: 100, order: "desc" }),
    });
    const result = await parseImmichJson<ImmichSearchAssetResponse>(response);

    for (const item of result.assets?.items ?? []) {
      if (!item.id) continue;
      assets.push({
        id: item.id,
        type: item.type === "VIDEO" ? "VIDEO" : "IMAGE",
        originalFileName: item.originalFileName?.trim() || "asset",
      });
    }

    const nextPageRaw = result.assets?.nextPage;
    if (nextPageRaw === null || nextPageRaw === undefined || nextPageRaw === "") {
      break;
    }
    const nextPage = Number(nextPageRaw);
    page = Number.isNaN(nextPage) ? page + 1 : nextPage;
  }

  return assets;
}

export async function fetchImmichAssetBytes(
  assetId: string,
  kind: "thumbnail" | "original",
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const { baseUrl, apiKey } = getImmichConfig();
  const path = kind === "thumbnail" ? "thumbnail" : "original";
  const url = new URL(`${baseUrl}/assets/${assetId}/${path}`);
  if (kind === "thumbnail") {
    url.searchParams.set("size", "preview");
  }

  const response = await fetch(url.toString(), {
    headers: {
      "x-api-key": apiKey,
      Accept: "*/*",
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Immich asset fetch failed (${response.status}): ${body || response.statusText}`,
    );
  }

  const contentType = response.headers.get("content-type")?.trim() || "application/octet-stream";
  const buffer = await response.arrayBuffer();
  return { bytes: new Uint8Array(buffer), contentType };
}
