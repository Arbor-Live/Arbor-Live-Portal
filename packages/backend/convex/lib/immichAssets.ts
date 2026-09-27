import { v } from "convex/values";
import {
  paginationResultValidator,
  type PaginationOptions,
  type PaginationResult,
} from "convex/server";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { buildSharedAssetUrl } from "./immichClient";

export const immichAssetTypeValue = v.union(v.literal("IMAGE"), v.literal("VIDEO"));

const mediaAssetValidator = v.object({
  immichAssetId: v.string(),
  originalFileName: v.string(),
  type: immichAssetTypeValue,
  createdAt: v.number(),
  thumbnailUrl: v.string(),
  originalUrl: v.string(),
  playbackUrl: v.optional(v.string()),
});

/** Page shape for any album gallery (staff, artist, or public portal). */
export const mediaAssetPageValidator = paginationResultValidator(mediaAssetValidator);

export function toMediaAsset(row: Doc<"immichAssetRecords">, shareKey: string) {
  return {
    immichAssetId: row.immichAssetId,
    originalFileName: row.originalFileName,
    type: row.type,
    createdAt: row.createdAt,
    thumbnailUrl: buildSharedAssetUrl(row.immichAssetId, "thumbnail", shareKey),
    originalUrl: buildSharedAssetUrl(row.immichAssetId, "original", shareKey),
    playbackUrl:
      row.type === "VIDEO"
        ? buildSharedAssetUrl(row.immichAssetId, "playback", shareKey)
        : undefined,
  };
}

/**
 * Page through an entity's canonical album mirror, newest first. Assets are
 * always recorded under the canonical link, so there is no cross-link merge.
 */
export async function paginateAlbumAssets(
  ctx: QueryCtx,
  albumLink: Doc<"immichAlbumLinks"> | null,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<ReturnType<typeof toMediaAsset>>> {
  if (!albumLink?.sharedLinkKey) {
    return { page: [], isDone: true, continueCursor: "" };
  }
  const shareKey = albumLink.sharedLinkKey;
  const result = await ctx.db
    .query("immichAssetRecords")
    .withIndex("by_albumLinkId", (q) => q.eq("albumLinkId", albumLink._id))
    .order("desc")
    .paginate(paginationOpts);
  return {
    ...result,
    page: result.page.map((row) => toMediaAsset(row, shareKey)),
  };
}
