"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, type ActionCtx } from "./_generated/server";
import { inventoryR2 } from "./inventoryR2";
import {
  buildMarketingPostContentObjectKey,
  buildMarketingPostHeroObjectKey,
  formatStoredR2Asset,
  validateMarketingHeroUploadRequest,
} from "./lib/inventoryUpload";
import {
  fetchImmichAssetBytes,
  isImmichConfigured,
  listImmichAlbumSummaries,
  searchImmichLibraryImages,
  toImmichDayEnd,
  toImmichDayStart,
  type ImmichLibraryAsset,
} from "./lib/immichClient";

const marketingImageKindValue = v.union(v.literal("hero"), v.literal("content"));
const ALBUM_PAGE_SIZE = 30;

const libraryAssetValidator = v.object({
  id: v.string(),
  originalFileName: v.string(),
  createdAt: v.number(),
  thumbnailDataUrl: v.string(),
});

const albumSummaryValidator = v.object({
  id: v.string(),
  albumName: v.string(),
  assetCount: v.number(),
  thumbnailDataUrl: v.optional(v.string()),
});

function createUploadId() {
  return crypto.randomUUID();
}

function bytesToDataUrl(bytes: Uint8Array, contentType: string) {
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

function inferContentTypeFromFileName(fileName: string, fallback: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return fallback;
}

async function enrichAssetsWithThumbnails(items: ImmichLibraryAsset[]) {
  return await Promise.all(
    items.map(async (asset) => {
      const thumbnail = await fetchImmichAssetBytes(asset.id, "thumbnail");
      return {
        ...asset,
        thumbnailDataUrl: bytesToDataUrl(thumbnail.bytes, thumbnail.contentType),
      };
    }),
  );
}

async function assertMarketingImmichAdmin(ctx: ActionCtx) {
  await ctx.runQuery(internal.marketingPosts.assertAdminInternal, {});
  if (!isImmichConfigured()) {
    throw new Error("Immich is not configured.");
  }
}

export const listAlbums = action({
  args: {
    page: v.optional(v.number()),
    query: v.optional(v.string()),
  },
  returns: v.object({
    items: v.array(albumSummaryValidator),
    nextPage: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    await assertMarketingImmichAdmin(ctx);

    const page = Math.max(args.page ?? 1, 1);
    const query = args.query?.trim().toLowerCase() ?? "";
    const albums = (await listImmichAlbumSummaries()).filter((album) =>
      query ? album.albumName.toLowerCase().includes(query) : true,
    );

    const start = (page - 1) * ALBUM_PAGE_SIZE;
    const pageItems = albums.slice(start, start + ALBUM_PAGE_SIZE);
    const nextPage = start + ALBUM_PAGE_SIZE < albums.length ? String(page + 1) : null;

    const items = await Promise.all(
      pageItems.map(async (album) => {
        if (!album.thumbnailAssetId) {
          return {
            id: album.id,
            albumName: album.albumName,
            assetCount: album.assetCount,
          };
        }
        try {
          const thumbnail = await fetchImmichAssetBytes(album.thumbnailAssetId, "thumbnail");
          return {
            id: album.id,
            albumName: album.albumName,
            assetCount: album.assetCount,
            thumbnailDataUrl: bytesToDataUrl(thumbnail.bytes, thumbnail.contentType),
          };
        } catch {
          return {
            id: album.id,
            albumName: album.albumName,
            assetCount: album.assetCount,
          };
        }
      }),
    );

    return { items, nextPage };
  },
});

export const browseLibrary = action({
  args: {
    page: v.optional(v.number()),
    albumId: v.optional(v.string()),
    takenFrom: v.optional(v.string()),
    takenTo: v.optional(v.string()),
  },
  returns: v.object({
    items: v.array(libraryAssetValidator),
    nextPage: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    await assertMarketingImmichAdmin(ctx);

    const page = Math.max(args.page ?? 1, 1);
    const takenFrom = args.takenFrom?.trim();
    const takenTo = args.takenTo?.trim() || takenFrom;

    const { items, nextPage } = await searchImmichLibraryImages({
      page,
      size: 24,
      albumId: args.albumId,
      takenAfter: takenFrom ? toImmichDayStart(takenFrom) : undefined,
      takenBefore: takenTo ? toImmichDayEnd(takenTo) : undefined,
    });

    return {
      items: await enrichAssetsWithThumbnails(items),
      nextPage,
    };
  },
});

export const importImage = action({
  args: {
    immichAssetId: v.string(),
    postId: v.optional(v.string()),
    imageKind: marketingImageKindValue,
    originalFileName: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await assertMarketingImmichAdmin(ctx);

    const assetId = args.immichAssetId.trim();
    if (!assetId) throw new Error("Immich asset id is required.");

    const downloaded = await fetchImmichAssetBytes(assetId, "original");
    const fileName = args.originalFileName?.trim() || "immich-image.jpg";
    const contentType = inferContentTypeFromFileName(fileName, downloaded.contentType);
    validateMarketingHeroUploadRequest({
      fileName,
      contentType,
      contentLength: downloaded.bytes.byteLength,
    });

    const uploadId = createUploadId();
    const key =
      args.imageKind === "content"
        ? buildMarketingPostContentObjectKey({
            postId: args.postId,
            fileName,
            uploadId,
          })
        : buildMarketingPostHeroObjectKey({
            postId: args.postId,
            fileName,
            uploadId,
          });

    await inventoryR2.store(ctx, downloaded.bytes, {
      key,
      type: contentType,
    });
    await inventoryR2.syncMetadata(ctx, key);
    return formatStoredR2Asset(key);
  },
});
