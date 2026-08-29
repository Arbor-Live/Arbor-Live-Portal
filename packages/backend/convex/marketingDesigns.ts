import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getUserId, requireAnyVerticalOrAdmin, requireArborInternalContext, requireVerticalOrAdmin, findAuthUsersByIds } from "./lib/auth";
import { SITE_URL } from "./email/constants";
import { normalizeEventStatus } from "./lib/eventStatus";
import { normalizeEventVisibility } from "./lib/eventVisibility";
import { normalizeOptionalAssetReference } from "./lib/inventoryUpload";
import {
  releaseReplacedR2Reference,
} from "./lib/r2Lifecycle";
import {
  buildPublicEventUrl,
  formatLinksForCaption,
  isPublicListableEventStatus,
  isWithinDays,
} from "./lib/publicEvents";
import {
  canPublishMarketingDesignVisibility,
  eventHasMarketingTeamInterest,
  isMarketingPosterWorkVisibility,
} from "./lib/eventVisibility";
import { schedulePublicEventsSiteRevalidation } from "./lib/scheduleSiteRevalidation";
import { resolveStoredR2AssetUrl } from "./inventoryR2";

const MARKETING_POSTER_WINDOW_DAYS = 28;

const designLinkInputValue = v.object({
  label: v.string(),
  url: v.string(),
});

const posterWorkViewValue = v.union(
  v.literal("unassigned"),
  v.literal("mine"),
  v.literal("all"),
);

type DesignDoc = Doc<"eventMarketingDesigns">;

type AuthUserRecord = {
  _id?: string;
  id?: string;
  name?: string;
  email?: string;
  image?: string | null;
};

function normalizeLinks(links: Array<{ label: string; url: string }> | undefined) {
  return (links ?? [])
    .map((link) => ({
      label: link.label.trim(),
      url: link.url.trim(),
    }))
    .filter((link) => link.label && link.url);
}

function isMarketingPosterEligible(event: Doc<"events">, now: number): boolean {
  if (!eventHasMarketingTeamInterest(event.teamsInterested)) return false;
  if (!isMarketingPosterWorkVisibility(event.visibility)) return false;
  if (normalizeEventStatus(event.status) === "cancelled") return false;
  return isWithinDays(event.startAt, now, MARKETING_POSTER_WINDOW_DAYS);
}

function userDisplayName(userByKey: Map<string, AuthUserRecord>, userId: string | undefined) {
  if (!userId) return null;
  const user = userByKey.get(userId);
  return user?.name ?? user?.email ?? userId;
}

async function resolveDesignImageUrl(imageUrl: string | undefined) {
  if (!imageUrl?.trim()) return null;
  return (await resolveStoredR2AssetUrl(imageUrl)) ?? imageUrl;
}

async function serializeDesign(ctx: QueryCtx, design: DesignDoc) {
  const event = await ctx.db.get(design.eventId);
  return {
    _id: design._id,
    eventId: design.eventId,
    eventTitle: event?.title ?? "Event",
    eventStartAt: event?.startAt ?? 0,
    venueName: event?.venueName,
    assigneeUserId: design.assigneeUserId ?? null,
    imageUrl: await resolveDesignImageUrl(design.imageUrl),
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

async function loadDesignByEventId(ctx: QueryCtx) {
  const designs = await ctx.db.query("eventMarketingDesigns").take(500);
  return new Map(designs.map((design) => [design.eventId, design]));
}

async function upsertPosterAssignment(
  ctx: MutationCtx,
  eventId: Id<"events">,
  assigneeUserId: string | undefined,
  actorUserId: string,
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("eventMarketingDesigns")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(1);

  if (existing[0]) {
    await ctx.db.patch(existing[0]._id, {
      assigneeUserId,
      updatedAt: now,
    });
    return existing[0]._id;
  }

  return await ctx.db.insert("eventMarketingDesigns", {
    eventId,
    assigneeUserId,
    status: "draft",
    createdByUserId: actorUserId,
    createdAt: now,
    updatedAt: now,
  });
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

const DESIGN_LIST_LIMIT = 200;

export const listForBoard = query({
  args: {},
  handler: async (ctx) => {
    await requireAnyVerticalOrAdmin(ctx, ["Marketing", "Operations"]);
    const designs = await ctx.db
      .query("eventMarketingDesigns")
      .withIndex("by_updatedAt")
      .order("desc")
      .take(DESIGN_LIST_LIMIT);
    return Promise.all(designs.map((design) => serializeDesign(ctx, design)));
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAnyVerticalOrAdmin(ctx, ["Marketing", "Operations"]);
    const userId = getUserId(user);
    const designs = await ctx.db
      .query("eventMarketingDesigns")
      .withIndex("by_assigneeUserId_and_updatedAt", (q) => q.eq("assigneeUserId", userId))
      .order("desc")
      .take(DESIGN_LIST_LIMIT);
    return Promise.all(designs.map((design) => serializeDesign(ctx, design)));
  },
});

export const listUpcomingPosterWork = query({
  args: {
    now: v.number(),
    view: posterWorkViewValue,
  },
  handler: async (ctx, args) => {
    const user = await requireAnyVerticalOrAdmin(ctx, ["Marketing", "Operations"]);
    const currentUserId = getUserId(user);
    const windowEnd = args.now + MARKETING_POSTER_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const events = await ctx.db
      .query("events")
      .withIndex("by_startAt", (q) => q.gte("startAt", args.now))
      .order("asc")
      .take(300);
    const designByEventId = await loadDesignByEventId(ctx);

    const eligible = events.filter(
      (event) => event.startAt <= windowEnd && isMarketingPosterEligible(event, args.now),
    );

    const filtered = eligible.filter((event) => {
      const assigneeUserId = designByEventId.get(event._id)?.assigneeUserId;
      if (args.view === "mine") return assigneeUserId === currentUserId;
      if (args.view === "unassigned") return !assigneeUserId;
      return true;
    });

    const assigneeIds = filtered
      .map((event) => designByEventId.get(event._id)?.assigneeUserId)
      .filter((id): id is string => Boolean(id));
    const userByKey = await findAuthUsersByIds(ctx, assigneeIds);

    return Promise.all(
      filtered.map(async (event) => {
        const design = designByEventId.get(event._id);
        const assigneeUserId = design?.assigneeUserId ?? null;
        return {
          eventId: event._id,
          title: event.title,
          startAt: event.startAt,
          venueName: event.venueName,
          visibility: normalizeEventVisibility(event.visibility),
          status: normalizeEventStatus(event.status),
          assigneeUserId,
          assigneeName: userDisplayName(userByKey, assigneeUserId ?? undefined),
          design: design
            ? {
                _id: design._id,
                status: design.status,
                imageUrl: await resolveDesignImageUrl(design.imageUrl),
                caption: design.caption ?? "",
                additionalLinks: design.additionalLinks ?? [],
                publishedAt: design.publishedAt ?? null,
                lastError: design.lastError ?? null,
                instagramPostId: design.instagramPostId ?? null,
              }
            : null,
        };
      }),
    );
  },
});

export const getPosterAssignmentForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireAnyVerticalOrAdmin(ctx, ["Marketing", "Operations"]);
    const design = (
      await ctx.db
        .query("eventMarketingDesigns")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(1)
    )[0];
    if (!design) {
      return {
        designId: null,
        assigneeUserId: null,
        assigneeName: null,
        status: null,
        hasPosterImage: false,
      };
    }
    const userByKey = await findAuthUsersByIds(
      ctx,
      design.assigneeUserId ? [design.assigneeUserId] : [],
    );
    return {
      designId: design._id,
      assigneeUserId: design.assigneeUserId ?? null,
      assigneeName: userDisplayName(userByKey, design.assigneeUserId),
      status: design.status,
      hasPosterImage: Boolean(design.imageUrl?.trim()),
    };
  },
});

export const getForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    const design = (
      await ctx.db
        .query("eventMarketingDesigns")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(1)
    )[0];
    if (!design) {
      return {
        eventId: event._id,
        eventTitle: event.title,
        visibility: normalizeEventVisibility(event.visibility),
        designId: null,
        assigneeUserId: null,
        assigneeName: null,
        imageUrl: null as string | null,
        imagePreviewUrl: null as string | null,
        caption: "",
        additionalLinks: [] as Array<{ label: string; url: string }>,
        status: null as "draft" | "ready" | "published" | null,
        instagramPostId: null as string | null,
        publishedAt: null as number | null,
        lastError: null as string | null,
        publicEventUrl: buildPublicEventUrl(String(event._id), SITE_URL),
        canPublish: canPublishMarketingDesignVisibility(event.visibility),
      };
    }
    const userByKey = await findAuthUsersByIds(
      ctx,
      design.assigneeUserId ? [design.assigneeUserId] : [],
    );
    return {
      eventId: event._id,
      eventTitle: event.title,
      visibility: normalizeEventVisibility(event.visibility),
      designId: design._id,
      assigneeUserId: design.assigneeUserId ?? null,
      assigneeName: userDisplayName(userByKey, design.assigneeUserId),
      imageUrl: design.imageUrl ?? null,
      imagePreviewUrl: await resolveDesignImageUrl(design.imageUrl),
      caption: design.caption ?? "",
      additionalLinks: design.additionalLinks ?? [],
      status: design.status,
      instagramPostId: design.instagramPostId ?? null,
      publishedAt: design.publishedAt ?? null,
      lastError: design.lastError ?? null,
      publicEventUrl: buildPublicEventUrl(String(event._id), SITE_URL),
      canPublish: canPublishMarketingDesignVisibility(event.visibility),
    };
  },
});

export const assignPosterDesigner = mutation({
  args: {
    eventId: v.id("events"),
    assigneeUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAnyVerticalOrAdmin(ctx, ["Marketing", "Operations"]);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    const assigneeUserId = args.assigneeUserId?.trim() || undefined;
    const designId = await upsertPosterAssignment(ctx, args.eventId, assigneeUserId, getUserId(user));
    return { designId };
  },
});

export const upsertForEvent = mutation({
  args: {
    eventId: v.id("events"),
    assigneeUserId: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    caption: v.optional(v.string()),
    additionalLinks: v.optional(v.array(designLinkInputValue)),
  },
  handler: async (ctx, args) => {
    const user = await requireAnyVerticalOrAdmin(ctx, ["Marketing", "Operations"]);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");

    const hasImage = args.imageUrl !== undefined;
    const hasCaption = args.caption !== undefined;
    const hasLinks = args.additionalLinks !== undefined;
    const hasAssignee = args.assigneeUserId !== undefined;
    if (!hasImage && !hasCaption && !hasLinks && !hasAssignee) {
      throw new Error("Nothing to save.");
    }

    let nextImageUrl: string | undefined;
    if (hasImage) {
      nextImageUrl = normalizeOptionalAssetReference(args.imageUrl) ?? undefined;
    }

    const nextCaption = hasCaption ? args.caption!.trim() || undefined : undefined;
    const nextLinks = hasLinks ? normalizeLinks(args.additionalLinks) : undefined;
    const nextAssignee = hasAssignee ? args.assigneeUserId?.trim() || undefined : undefined;

    const now = Date.now();
    const existing = (
      await ctx.db
        .query("eventMarketingDesigns")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(1)
    )[0];

    if (existing?.status === "published" && (hasImage || hasCaption || hasLinks)) {
      // Website content can still change after Instagram publish; keep published.
      await ctx.db.patch(existing._id, {
        ...(hasImage ? { imageUrl: nextImageUrl } : {}),
        ...(hasCaption ? { caption: nextCaption } : {}),
        ...(hasLinks ? { additionalLinks: nextLinks } : {}),
        ...(hasAssignee ? { assigneeUserId: nextAssignee } : {}),
        updatedAt: now,
      });
      if (hasImage) {
        await releaseReplacedR2Reference(ctx, existing.imageUrl, nextImageUrl);
      }
      await schedulePublicEventsSiteRevalidation(ctx, String(args.eventId));
      return { designId: existing._id };
    }

    if (existing) {
      const nextStatus = existing.status === "published" ? "published" : "ready";
      await ctx.db.patch(existing._id, {
        ...(hasImage ? { imageUrl: nextImageUrl } : {}),
        ...(hasCaption ? { caption: nextCaption } : {}),
        ...(hasLinks ? { additionalLinks: nextLinks } : {}),
        ...(hasAssignee ? { assigneeUserId: nextAssignee } : {}),
        status: nextStatus,
        updatedAt: now,
        ...(nextStatus === "ready" ? { lastError: undefined } : {}),
      });
      if (hasImage) {
        await releaseReplacedR2Reference(ctx, existing.imageUrl, nextImageUrl);
      }
      await schedulePublicEventsSiteRevalidation(ctx, String(args.eventId));
      return { designId: existing._id };
    }

    const designId = await ctx.db.insert("eventMarketingDesigns", {
      eventId: args.eventId,
      assigneeUserId: nextAssignee,
      imageUrl: nextImageUrl,
      caption: nextCaption,
      additionalLinks: nextLinks,
      status: "ready",
      createdByUserId: getUserId(user),
      createdAt: now,
      updatedAt: now,
    });
    await schedulePublicEventsSiteRevalidation(ctx, String(args.eventId));
    return { designId };
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
      const nextImageUrl = normalizeOptionalAssetReference(args.imageUrl);
      await ctx.db.patch(existing[0]._id, {
        assigneeUserId: args.assigneeUserId ?? existing[0].assigneeUserId,
        imageUrl: nextImageUrl,
        caption: args.caption?.trim() || undefined,
        additionalLinks: normalizeLinks(args.additionalLinks),
        updatedAt: now,
      });
      await releaseReplacedR2Reference(ctx, existing[0].imageUrl, nextImageUrl);
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
    const nextImageUrl =
      args.imageUrl === undefined
        ? existing.imageUrl
        : normalizeOptionalAssetReference(args.imageUrl) ?? existing.imageUrl;
    await ctx.db.patch(args.id, {
      assigneeUserId: args.assigneeUserId ?? existing.assigneeUserId,
      imageUrl: nextImageUrl,
      caption: args.caption?.trim() ?? existing.caption,
      additionalLinks:
        args.additionalLinks === undefined
          ? existing.additionalLinks
          : normalizeLinks(args.additionalLinks),
      updatedAt: Date.now(),
    });
    if (args.imageUrl !== undefined) {
      await releaseReplacedR2Reference(ctx, existing.imageUrl, nextImageUrl);
    }
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
    if (!canPublishMarketingDesignVisibility(event.visibility)) {
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
