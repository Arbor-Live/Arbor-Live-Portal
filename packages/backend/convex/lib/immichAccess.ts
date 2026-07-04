import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  getCanonicalAlbumLink,
  listAlbumLinksForEntity,
} from "./immichAlbumLinks";
import {
  getActiveOrganizationContextOrNull,
  requireArborInternalContext,
  requireAuth,
  type ActiveOrganizationContext,
} from "./auth";

export async function hasBandEventParticipation(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  organizationId: string,
) {
  const row = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_eventId_and_organizationId", (q) =>
      q.eq("eventId", eventId).eq("organizationId", organizationId),
    )
    .first();
  return Boolean(row);
}

export async function requireBandEventAccess(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  organizationId: string,
) {
  const allowed = await hasBandEventParticipation(ctx, eventId, organizationId);
  if (!allowed) {
    throw new Error("Your band is not linked to this event.");
  }
}

export async function requireEventMediaAccess(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
): Promise<ActiveOrganizationContext> {
  await requireAuth(ctx);
  const context = await getActiveOrganizationContextOrNull(ctx);
  if (!context) throw new Error("No active organization context.");
  if (context.organizationType === "arbor_internal") return context;
  if (context.organizationType === "band") {
    await requireBandEventAccess(ctx, eventId, context.organizationId);
    return context;
  }
  throw new Error("You do not have access to this event media.");
}

export async function requireBandAlbumAccess(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
): Promise<ActiveOrganizationContext> {
  await requireAuth(ctx);
  const context = await getActiveOrganizationContextOrNull(ctx);
  if (!context) throw new Error("No active organization context.");
  if (context.organizationType === "arbor_internal") return context;
  if (context.organizationType === "band" && context.organizationId === organizationId) {
    return context;
  }
  throw new Error("You do not have access to this band album.");
}

export async function getAlbumLinkForBand(ctx: QueryCtx | MutationCtx, organizationId: string) {
  return await getCanonicalAlbumLink(ctx, "band", organizationId);
}

export async function getAlbumLinkForEvent(ctx: QueryCtx | MutationCtx, eventId: Id<"events">) {
  return await getCanonicalAlbumLink(ctx, "event", eventId);
}

export async function getAlbumLinkIdsForEntity(
  ctx: QueryCtx | MutationCtx,
  entityType: "band" | "event",
  entityId: string,
) {
  const rows = await listAlbumLinksForEntity(ctx, entityType, entityId);
  return rows.map((row) => row._id);
}

export async function requireAssetAccess(
  ctx: QueryCtx | MutationCtx,
  immichAssetId: string,
): Promise<void> {
  await requireAuth(ctx);
  const context = await getActiveOrganizationContextOrNull(ctx);
  if (!context) throw new Error("No active organization context.");

  const assetRecord = await ctx.db
    .query("immichAssetRecords")
    .withIndex("by_immichAssetId", (q) => q.eq("immichAssetId", immichAssetId))
    .first();
  if (!assetRecord) throw new Error("Asset not found.");

  const albumLink = await ctx.db.get(assetRecord.albumLinkId);
  if (!albumLink) throw new Error("Album not found.");

  if (context.organizationType === "arbor_internal") return;

  if (albumLink.entityType === "band") {
    if (context.organizationType === "band" && context.organizationId === albumLink.entityId) {
      return;
    }
    throw new Error("You do not have access to this asset.");
  }

  if (albumLink.entityType === "event") {
    if (context.organizationType === "band") {
      await requireBandEventAccess(
        ctx,
        albumLink.entityId as Id<"events">,
        context.organizationId,
      );
      return;
    }
  }

  throw new Error("You do not have access to this asset.");
}

export async function canUploadToAlbum(
  ctx: QueryCtx | MutationCtx,
  albumLink: Doc<"immichAlbumLinks">,
): Promise<void> {
  if (albumLink.entityType === "band") {
    await requireBandAlbumAccess(ctx, albumLink.entityId);
    return;
  }
  await requireEventMediaAccess(ctx, albumLink.entityId as Id<"events">);
}

export async function requireArborOrBandMediaAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await requireAuth(ctx);
  const context = await getActiveOrganizationContextOrNull(ctx);
  if (!context) throw new Error("No active organization context.");
  if (context.organizationType === "arbor_internal") {
    await requireArborInternalContext(ctx);
  }
  return { user, context };
}
