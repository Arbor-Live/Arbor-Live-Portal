import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  findAuthUsersByIds,
  getUserId,
  requireArborInternalContext,
  requireAuth,
} from "./lib/auth";
import {
  eventDashboardUrl,
  EVENT_TIMEZONE,
  formatEventDateRange,
  subjectForTemplate,
} from "./email/constants";
import { enqueueEmail } from "./email/enqueue";

const MAX_COMMENT_LENGTH = 4000;
const MAX_MENTIONS_PER_COMMENT = 20;
const MENTION_SNIPPET_LENGTH = 240;

async function listActiveArborInternalUserIds(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
): Promise<Set<string>> {
  const memberships = await ctx.db
    .query("userOrganizationMemberships")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .take(1000);
  return new Set(memberships.filter((row) => row.active).map((row) => row.userId));
}

function snippet(body: string, maxLen = MENTION_SNIPPET_LENGTH) {
  const trimmed = body.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen).trimEnd()}…`;
}

export const listMentionCandidates = query({
  args: {},
  returns: v.array(
    v.object({
      userId: v.string(),
      name: v.string(),
      email: v.string(),
      pronouns: v.optional(v.string()),
      gradYear: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    const context = await requireArborInternalContext(ctx);
    const memberIds = await listActiveArborInternalUserIds(ctx, context.organizationId);
    if (!memberIds.size) return [];

    const userById = await findAuthUsersByIds(ctx, [...memberIds]);
    const profiles = await ctx.db.query("userAdminProfiles").withIndex("by_active").take(2000);
    const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));

    return [...memberIds]
      .map((userId) => {
        const user = userById.get(userId);
        const profile = profileByUserId.get(userId);
        return {
          userId,
          name: user?.name ?? user?.email ?? "Arbor Live user",
          email: user?.email ?? "",
          pronouns: profile?.pronouns,
          gradYear: profile?.gradYear,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

const commentRowValidator = v.object({
  _id: v.id("eventComments"),
  eventId: v.id("events"),
  authorUserId: v.string(),
  authorName: v.string(),
  authorEmail: v.string(),
  body: v.string(),
  mentionedUserIds: v.array(v.string()),
  mentionedUsers: v.array(v.object({ userId: v.string(), name: v.string() })),
  canDelete: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const listByEvent = query({
  args: { eventId: v.id("events") },
  returns: v.array(commentRowValidator),
  handler: async (ctx, args) => {
    const viewer = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const viewerUserId = getUserId(viewer);

    const rows = await ctx.db
      .query("eventComments")
      .withIndex("by_eventId_and_createdAt", (q) => q.eq("eventId", args.eventId))
      .order("asc")
      .take(500);

    const userIds = new Set<string>();
    for (const row of rows) {
      userIds.add(row.authorUserId);
      for (const mentionedUserId of row.mentionedUserIds) userIds.add(mentionedUserId);
    }
    const userById = await findAuthUsersByIds(ctx, [...userIds]);
    const nameFor = (userId: string) =>
      userById.get(userId)?.name ?? userById.get(userId)?.email ?? "Arbor Live user";

    return rows.map((row) => ({
      _id: row._id,
      eventId: row.eventId,
      authorUserId: row.authorUserId,
      authorName: nameFor(row.authorUserId),
      authorEmail: userById.get(row.authorUserId)?.email ?? "",
      body: row.body,
      mentionedUserIds: row.mentionedUserIds,
      mentionedUsers: row.mentionedUserIds.map((userId) => ({
        userId,
        name: nameFor(userId),
      })),
      canDelete: row.authorUserId === viewerUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  },
});

export const createComment = mutation({
  args: {
    eventId: v.id("events"),
    body: v.string(),
    mentionedUserIds: v.optional(v.array(v.string())),
  },
  returns: v.id("eventComments"),
  handler: async (ctx, args) => {
    const author = await requireAuth(ctx);
    const context = await requireArborInternalContext(ctx);
    const authorUserId = getUserId(author);

    const body = args.body.trim();
    if (!body) throw new Error("Comment cannot be empty.");
    if (body.length > MAX_COMMENT_LENGTH) {
      throw new Error(`Comment must be ${MAX_COMMENT_LENGTH} characters or fewer.`);
    }

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");

    // Self-mentions are kept so the comment still renders them as mentions; they
    // are skipped when sending notification emails below.
    const mentionedUserIds = [...new Set(args.mentionedUserIds ?? [])];
    if (mentionedUserIds.length > MAX_MENTIONS_PER_COMMENT) {
      throw new Error(`You can mention at most ${MAX_MENTIONS_PER_COMMENT} people per comment.`);
    }

    if (mentionedUserIds.length > 0) {
      const activeMemberIds = await listActiveArborInternalUserIds(ctx, context.organizationId);
      const invalid = mentionedUserIds.filter(
        (userId) => userId !== authorUserId && !activeMemberIds.has(userId),
      );
      if (invalid.length > 0) {
        throw new Error("Mentions are limited to active Arbor Live team members.");
      }
    }

    const now = Date.now();
    const commentId = await ctx.db.insert("eventComments", {
      eventId: args.eventId,
      authorUserId,
      body,
      mentionedUserIds,
      createdAt: now,
      updatedAt: now,
    });

    const notifyUserIds = mentionedUserIds.filter((userId) => userId !== authorUserId);
    if (notifyUserIds.length > 0) {
      const authorName = author.name ?? author.email ?? "A teammate";
      const mentionedUsers = await findAuthUsersByIds(ctx, notifyUserIds);
      const eventUrl = eventDashboardUrl(args.eventId);
      const dateRangeLabel = formatEventDateRange(event.startAt, event.endAt, EVENT_TIMEZONE);
      const commentSnippet = snippet(body);

      for (const mentionedUserId of notifyUserIds) {
        const mentionedUser = mentionedUsers.get(mentionedUserId);
        const to = mentionedUser?.email?.trim().toLowerCase();
        if (!to) continue;
        await enqueueEmail(ctx, {
          template: "event_comment_mention",
          to,
          subject: subjectForTemplate("event_comment_mention", event.title),
          eventId: args.eventId,
          idempotencyKey: `event_comment_mention:${commentId}:${mentionedUserId}`,
          payload: {
            recipientName: mentionedUser?.name ?? undefined,
            authorName,
            eventTitle: event.title,
            venueName: event.venueName,
            dateRangeLabel,
            commentSnippet,
            eventUrl,
          },
        });
      }
    }

    return commentId;
  },
});

export const deleteComment = mutation({
  args: { commentId: v.id("eventComments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await requireAuth(ctx);
    await requireArborInternalContext(ctx);

    const comment = await ctx.db.get(args.commentId);
    // Already gone: treat as success so a double submit does not surface an error.
    if (!comment) return null;
    if (comment.authorUserId !== getUserId(viewer)) {
      throw new Error("You can only delete your own comments.");
    }

    await ctx.db.delete(args.commentId);
    return null;
  },
});
