"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { albumLinkResultValidator } from "./lib/immichValidators";

type AlbumLinkResult = {
  albumLinkId: Id<"immichAlbumLinks">;
  immichAlbumId: string;
  albumName: string;
};

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
