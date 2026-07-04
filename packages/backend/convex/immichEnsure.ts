"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, type ActionCtx } from "./_generated/server";
import { albumLinkResultValidator } from "./lib/immichValidators";

const entityTypeValue = v.union(v.literal("band"), v.literal("event"));

type AlbumLinkResult = {
  albumLinkId: Id<"immichAlbumLinks">;
  immichAlbumId: string;
  albumName: string;
};

async function resolveUploadAlbum(
  ctx: ActionCtx,
  args: { targetType: "band" | "event"; targetId: string },
): Promise<AlbumLinkResult> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("You must be signed in.");

  if (args.targetType === "band") {
    const context: { organizationId: string; organizationName: string } | null =
      await ctx.runQuery(internal.immichDb.getActiveBandContextInternal, {});
    if (!context || context.organizationId !== args.targetId) {
      throw new Error("Band upload target does not match your active organization.");
    }

    const displayName: string = await ctx.runQuery(internal.immichDb.getBandDisplayNameInternal, {
      organizationId: context.organizationId,
    });

    return await ctx.runAction(internal.immichActions.ensureAlbum, {
      entityType: "band",
      entityId: context.organizationId,
      albumName: `Band: ${displayName}`,
      description: `Arbor Live Portal band album for ${displayName}`,
    });
  }

  const eventMeta: { title: string; venueName?: string } | null = await ctx.runQuery(
    internal.immichDb.getEventMetaInternal,
    { eventId: args.targetId as Id<"events"> },
  );
  if (!eventMeta) throw new Error("Event not found.");

  return await ctx.runAction(internal.immichActions.ensureAlbum, {
    entityType: "event",
    entityId: args.targetId,
    albumName: `Event: ${eventMeta.title}`,
    description: eventMeta.venueName
      ? `${eventMeta.title} at ${eventMeta.venueName}`
      : eventMeta.title,
  });
}

export const ensureBandAlbum = action({
  args: {},
  returns: albumLinkResultValidator,
  handler: async (ctx): Promise<AlbumLinkResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("You must be signed in.");

    const context: { organizationId: string; organizationName: string } | null =
      await ctx.runQuery(internal.immichDb.getActiveBandContextInternal, {});
    if (!context) throw new Error("Band organization context required.");

    const displayName: string = await ctx.runQuery(internal.immichDb.getBandDisplayNameInternal, {
      organizationId: context.organizationId,
    });

    return await ctx.runAction(internal.immichActions.ensureAlbum, {
      entityType: "band",
      entityId: context.organizationId,
      albumName: `Band: ${displayName}`,
      description: `Arbor Live Portal band album for ${displayName}`,
    });
  },
});

export const ensureEventAlbum = action({
  args: { eventId: v.id("events") },
  returns: albumLinkResultValidator,
  handler: async (ctx, args): Promise<AlbumLinkResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("You must be signed in.");

    const eventMeta: { title: string; venueName?: string } | null = await ctx.runQuery(
      internal.immichDb.getEventMetaInternal,
      { eventId: args.eventId },
    );
    if (!eventMeta) throw new Error("Event not found.");

    return await ctx.runAction(internal.immichActions.ensureAlbum, {
      entityType: "event",
      entityId: args.eventId,
      albumName: `Event: ${eventMeta.title}`,
      description: eventMeta.venueName
        ? `${eventMeta.title} at ${eventMeta.venueName}`
        : eventMeta.title,
    });
  },
});

export const ensureUploadAlbum = action({
  args: {
    targetType: entityTypeValue,
    targetId: v.string(),
  },
  returns: albumLinkResultValidator,
  handler: async (ctx, args): Promise<AlbumLinkResult> => {
    return await resolveUploadAlbum(ctx, args);
  },
});
