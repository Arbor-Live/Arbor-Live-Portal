import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getUserId, requireAnyVerticalOrAdmin, requireVerticalOrAdmin } from "./lib/auth";
import { SITE_URL } from "./email/constants";
import { normalizeOptionalAssetReference } from "./lib/inventoryUpload";
import {
  buildPublicEventUrl,
  formatLinksForCaption,
  isPublicListableEventStatus,
} from "./lib/publicEvents";
import { schedulePublicEventsSiteRevalidation } from "./lib/scheduleSiteRevalidation";
import { resolveStoredR2AssetUrl } from "./inventoryR2";

const designLinkInputValue = v.object({
  label: v.string(),
  url: v.string(),
});

const designStatusValue = v.union(
  v.literal("draft"),
  v.literal("ready"),
  v.literal("published"),
);

function normalizeLinks(links: Array<{ label: string; url: string }> | undefined) {
  return (links ?? [])
    .map((link) => ({
      label: link.label.trim(),
      url: link.url.trim(),
    }))
    .filter((link) => link.label && link.url);
}

async function serializeDesign(ctx: QueryCtx, design: {
  _id: Id<"eventMarketingDesigns">;
  eventId: Id<"events">;
  assigneeUserId?: string;
  imageUrl: string;
  caption?: string;
  additionalLinks?: Array<{ label: string; url: string }>;
  status: "draft" | "ready" | "published";
  instagramPostId?: string;
  publishedAt?: number;
  lastError?: string;
  createdByUserId: string;
  createdAt: number;
  updatedAt: number;
}) {
  const event = await ctx.db.get(design.eventId);
  return {
    _id: design._id,
    eventId: design.eventId,
    eventTitle: event?.title ?? "Event",
    eventStartAt: event?.startAt ?? 0,
    venueName: event?.venueName,
    assigneeUserId: design.assigneeUserId ?? null,
    imageUrl: (await resolveStoredR2AssetUrl(design.imageUrl)) ?? design.imageUrl,
    caption: design.caption ?? "",
    additionalLinks: design.additionalLinks ?? [],
    status: design.status,
    instagramPostId: design.instagramPostId ?? null,
    publishedAt: design.publishedAt ?? null,
    lastError: design.lastError ?? null,
    publicEventUrl: buildPublicEventUrl(String(design.eventId), SITE_URL),
    createdByUserId: design.createdByUserId,
    createdAt: design.createdAt,
    updatedAt: design.updatedAt,
  };
}

async function enqueuePublishJobs(ctx: MutationCtx, designId: Id<"eventMarketingDesigns">) {
  const now = Date.now();
  for (const target of ["instagram", "website"] as const) {
    const jobId = await ctx.db.insert("marketingPublishJobs", {
      designId,
      status: "queued",
      target,
      createdAt: now,
      updatedAt: now,
    });
    if (target === "instagram") {
      await ctx.scheduler.runAfter(0, internal.marketingInstagramActions.processJob, { jobId });
    } else {
      await ctx.scheduler.runAfter(0, internal.marketingDesigns.completeWebsiteJob, { jobId });
    }
  }
  await schedulePublicEventsSiteRevalidation(ctx, String((await ctx.db.get(designId))?.eventId));
}

export const listForBoard = query({
  args: {},
  handler: async (ctx) => {
    await requireAnyVerticalOrAdmin(ctx, ["Marketing", "Operations"]);
    const designs = await ctx.db.query("eventMarketingDesigns").take(500);
    const sorted = designs.sort((a, b) => b.updatedAt - a.updatedAt);
    return Promise.all(sorted.map((design) => serializeDesign(ctx, design)));
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAnyVerticalOrAdmin(ctx, ["Marketing", "Operations"]);
    const userId = getUserId(user);
    const designs = await ctx.db
      .query("eventMarketingDesigns")
      .withIndex("by_assigneeUserId_and_status", (q) => q.eq("assigneeUserId", userId))
      .take(200);
    const sorted = designs.sort((a, b) => b.updatedAt - a.updatedAt);
    return Promise.all(sorted.map((design) => serializeDesign(ctx, design)));
  },
});

export const listEventsNeedingDesigns = query({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    await requireAnyVerticalOrAdmin(ctx, ["Marketing", "Operations"]);
    const events = await ctx.db.query("events").withIndex("by_startAt").order("asc").take(300);
    const upcomingPublic = events.filter(
      (event) =>
        event.visibility === "public" &&
        isPublicListableEventStatus(event.status) &&
        event.startAt >= args.now,
    );
    const designs = await ctx.db.query("eventMarketingDesigns").take(500);
    const designByEventId = new Map(designs.map((design) => [design.eventId, design]));
    return upcomingPublic.map((event) => ({
      eventId: event._id,
      title: event.title,
      startAt: event.startAt,
      venueName: event.venueName,
      design: designByEventId.get(event._id) ?? null,
    }));
  },
});

export const create = mutation({
  args: {
    eventId: v.id("events"),
    assigneeUserId: v.optional(v.string()),
    imageUrl: v.string(),
    caption: v.optional(v.string()),
    additionalLinks: v.optional(v.array(designLinkInputValue)),
  },
  handler: async (ctx, args) => {
    const user = await requireVerticalOrAdmin(ctx, "Marketing");
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    const now = Date.now();
    const imageUrl = normalizeOptionalAssetReference(args.imageUrl);
    if (!imageUrl) throw new Error("Image is required.");

    const existing = await ctx.db
      .query("eventMarketingDesigns")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(1);
    if (existing[0]) {
      await ctx.db.patch(existing[0]._id, {
        assigneeUserId: args.assigneeUserId,
        imageUrl,
        caption: args.caption?.trim() || undefined,
        additionalLinks: normalizeLinks(args.additionalLinks),
        updatedAt: now,
      });
      return existing[0]._id;
    }

    return await ctx.db.insert("eventMarketingDesigns", {
      eventId: args.eventId,
      assigneeUserId: args.assigneeUserId,
      imageUrl,
      caption: args.caption?.trim() || undefined,
      additionalLinks: normalizeLinks(args.additionalLinks),
      status: "draft",
      createdByUserId: getUserId(user),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("eventMarketingDesigns"),
    assigneeUserId: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    caption: v.optional(v.string()),
    additionalLinks: v.optional(v.array(designLinkInputValue)),
  },
  handler: async (ctx, args) => {
    await requireVerticalOrAdmin(ctx, "Marketing");
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Design not found.");
    if (existing.status === "published") {
      throw new Error("Published designs cannot be edited.");
    }
    await ctx.db.patch(args.id, {
      assigneeUserId: args.assigneeUserId ?? existing.assigneeUserId,
      imageUrl:
        args.imageUrl === undefined
          ? existing.imageUrl
          : normalizeOptionalAssetReference(args.imageUrl) ?? existing.imageUrl,
      caption: args.caption?.trim() ?? existing.caption,
      additionalLinks:
        args.additionalLinks === undefined
          ? existing.additionalLinks
          : normalizeLinks(args.additionalLinks),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const markReady = mutation({
  args: { id: v.id("eventMarketingDesigns") },
  handler: async (ctx, args) => {
    await requireVerticalOrAdmin(ctx, "Marketing");
    const design = await ctx.db.get(args.id);
    if (!design) throw new Error("Design not found.");
    if (!design.imageUrl?.trim()) throw new Error("Upload a poster image before publishing.");
    const event = await ctx.db.get(design.eventId);
    if (!event) throw new Error("Event not found.");
    if (event.visibility !== "public") {
      throw new Error("Event must be public before publishing marketing designs.");
    }
    if (!isPublicListableEventStatus(event.status)) {
      throw new Error("Only non-tentative, non-cancelled events can be published.");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "published",
      publishedAt: now,
      lastError: undefined,
      updatedAt: now,
    });
    await enqueuePublishJobs(ctx, args.id);
    return { ok: true };
  },
});

export const completeWebsiteJob = internalMutation({
  args: { jobId: v.id("marketingPublishJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.target !== "website") return null;
    await ctx.db.patch(args.jobId, {
      status: "completed",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const buildInstagramCaption = internalMutation({
  args: { designId: v.id("eventMarketingDesigns") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const design = await ctx.db.get(args.designId);
    if (!design) return null;
    const event = await ctx.db.get(design.eventId);
    if (!event) return null;
    const publicEventUrl = buildPublicEventUrl(String(event._id), SITE_URL);
    const captionParts = [design.caption?.trim(), formatLinksForCaption(publicEventUrl, design.additionalLinks)]
      .filter(Boolean);
    return captionParts.join("\n\n");
  },
});
