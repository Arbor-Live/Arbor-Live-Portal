import { v } from "convex/values";

export const albumLinkResultValidator = v.object({
  albumLinkId: v.id("immichAlbumLinks"),
  immichAlbumId: v.string(),
  albumName: v.string(),
});
