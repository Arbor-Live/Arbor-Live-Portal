import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AlbumEntityType = "band" | "event";

export async function listAlbumLinksForEntity(
  ctx: QueryCtx | MutationCtx,
  entityType: AlbumEntityType,
  entityId: string,
) {
  return await ctx.db
    .query("immichAlbumLinks")
    .withIndex("by_entityType_and_entityId", (q) =>
      q.eq("entityType", entityType).eq("entityId", entityId),
    )
    .take(20);
}

export async function getCanonicalAlbumLink(
  ctx: QueryCtx | MutationCtx,
  entityType: AlbumEntityType,
  entityId: string,
): Promise<Doc<"immichAlbumLinks"> | null> {
  const rows = await listAlbumLinksForEntity(ctx, entityType, entityId);
  if (!rows.length) return null;
  return rows.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

export async function dedupeAlbumLinksForEntity(
  ctx: MutationCtx,
  entityType: AlbumEntityType,
  entityId: string,
): Promise<Id<"immichAlbumLinks"> | null> {
  const rows = await listAlbumLinksForEntity(ctx, entityType, entityId);
  if (!rows.length) return null;
  const [canonical, ...duplicates] = rows.sort((a, b) => b.updatedAt - a.updatedAt);
  if (!canonical) return null;

  for (const duplicate of duplicates) {
    const assets = await ctx.db
      .query("immichAssetRecords")
      .withIndex("by_albumLinkId", (q) => q.eq("albumLinkId", duplicate._id))
      .take(500);
    for (const asset of assets) {
      const existing = await ctx.db
        .query("immichAssetRecords")
        .withIndex("by_immichAssetId", (q) => q.eq("immichAssetId", asset.immichAssetId))
        .first();
      if (existing && existing._id !== asset._id) {
        await ctx.db.delete(asset._id);
        continue;
      }
      await ctx.db.patch(asset._id, { albumLinkId: canonical._id });
    }
    await ctx.db.delete(duplicate._id);
  }

  return canonical._id;
}
