import { v } from "convex/values";

export const albumLinkResultValidator = v.object({
  albumLinkId: v.id("immichAlbumLinks"),
  immichAlbumId: v.string(),
  albumName: v.string(),
});

export const mediaUploadResultValidator = v.object({
  immichAssetId: v.string(),
  originalFileName: v.string(),
  type: v.union(v.literal("IMAGE"), v.literal("VIDEO")),
});
