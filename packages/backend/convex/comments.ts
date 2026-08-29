import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  findAuthUsersByIds,
  getUserId,
  requireArborInternalContext,
  requireAuth,
} from "./lib/auth";
import {
  bookingRequestsAdminUrl,
  damageReportUrl,
  eventDashboardUrl,
  EVENT_TIMEZONE,
  formatEventDateRange,
  subjectForTemplate,
} from "./email/constants";
import { enqueueEmail } from "./email/enqueue";

const MAX_COMMENT_LENGTH = 4000;
const MAX_MENTIONS_PER_COMMENT = 20;
const MENTION_SNIPPET_LENGTH = 240;

/** Cap for `countBySubjects`, which fans out one index read per subject. */
const MAX_COUNT_SUBJECTS = 200;

const subjectTypeValue = v.union(
  v.literal("event"),
  v.literal("damage_batch"),
  v.literal("event_request"),
);

type SubjectType = "event" | "damage_batch" | "event_request";

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

/**
 * `in_progress` → `In progress`. The UI leans on a `capitalize` class for the
 * same enums, which email HTML has no equivalent for.
 */
function humanizeEnum(value: string) {
  const spaced = value.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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
      username: v.optional(v.string()),
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
          username: profile?.username,
          pronouns: profile?.pronouns,
          gradYear: profile?.gradYear,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Everything a mention email needs about a thread's subject, plus proof the
 * subject exists. Events keep the richer `event_comment_mention` template, so
 * they resolve to their own shape rather than the generic context rows.
 */
type SubjectContext =
  | { kind: "event"; event: Doc<"events"> }
  | {
      kind: "generic";
      kindLabel: string;
      title: string;
      contextRows: { label: string; value: string }[];
      url: string;
      ctaLabel: string;
      eventId?: Id<"events">;
    };

/** Damage threads key on `batchId`, falling back to the id of a pre-batch row. */
async function findDamageBatchReports(ctx: QueryCtx | MutationCtx, subjectId: string) {
  const byBatch = await ctx.db
    .query("damageReports")
    .withIndex("by_batchId", (q) => q.eq("batchId", subjectId))
    .take(500);
  if (byBatch.length > 0) return byBatch;

  const reportId = ctx.db.normalizeId("damageReports", subjectId);
  if (!reportId) return [];
  const report = await ctx.db.get(reportId);
  return report ? [report] : [];
}

/**
 * The one place a new comment surface plugs in: validate the subject exists and
 * describe it for the mention email.
 */
async function resolveSubject(
  ctx: QueryCtx | MutationCtx,
  subjectType: SubjectType,
  subjectId: string,
): Promise<SubjectContext> {
  switch (subjectType) {
    case "event": {
      const eventId = ctx.db.normalizeId("events", subjectId);
      const event = eventId ? await ctx.db.get(eventId) : null;
      if (!event) throw new Error("Event not found.");
      return { kind: "event", event };
    }

    case "damage_batch": {
      const reports = await findDamageBatchReports(ctx, subjectId);
      const primary = reports[0];
      if (!primary) throw new Error("Damage report not found.");

      const type = primary.typeId ? await ctx.db.get(primary.typeId) : null;
      const event = primary.eventId ? await ctx.db.get(primary.eventId) : null;
      const extraAssets = reports.length - 1;

      return {
        kind: "generic",
        kindLabel: "Damage report",
        title: [
          primary.assetId,
          type?.name,
          extraAssets > 0 ? `(+${extraAssets} more asset${extraAssets === 1 ? "" : "s"})` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        contextRows: [
          {
            label: "Status",
            value: `${humanizeEnum(primary.status)} · severity ${primary.severity}/5 · ${primary.operability.replaceAll("_", " ")}`,
          },
          { label: "Event", value: event?.title ?? "Not linked" },
        ],
        url: damageReportUrl(primary._id),
        ctaLabel: "View damage report",
        eventId: primary.eventId,
      };
    }

    case "event_request": {
      const requestId = ctx.db.normalizeId("eventRequests", subjectId);
      const request = requestId ? await ctx.db.get(requestId) : null;
      if (!request) throw new Error("Booking request not found.");

      return {
        kind: "generic",
        kindLabel: "Booking request",
        title: [request.requestNumber, request.eventName ?? request.eventCategory]
          .filter(Boolean)
          .join(" · "),
        contextRows: [
          { label: "Requester", value: `${request.firstName} ${request.lastName}`.trim() },
          { label: "Status", value: humanizeEnum(request.status) },
          { label: "Event date", value: request.eventDateText },
        ],
        url: bookingRequestsAdminUrl(request._id),
        ctaLabel: "View booking request",
        eventId: request.convertedEventId,
      };
    }
  }
}

const commentRowValidator = v.object({
  _id: v.id("comments"),
  subjectType: subjectTypeValue,
  subjectId: v.string(),
  authorUserId: v.string(),
  authorName: v.string(),
  authorEmail: v.string(),
  body: v.string(),
  mentionedUserIds: v.array(v.string()),
  mentionedUsers: v.array(
    v.object({
      userId: v.string(),
      name: v.string(),
      username: v.optional(v.string()),
    }),
  ),
  canDelete: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const listBySubject = query({
  args: { subjectType: subjectTypeValue, subjectId: v.string() },
  returns: v.array(commentRowValidator),
  handler: async (ctx, args) => {
    const viewer = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const viewerUserId = getUserId(viewer);

    const rows = await ctx.db
      .query("comments")
      .withIndex("by_subject_and_createdAt", (q) =>
        q.eq("subjectType", args.subjectType).eq("subjectId", args.subjectId),
      )
      .order("asc")
      .take(500);

    const userIds = new Set<string>();
    for (const row of rows) {
      userIds.add(row.authorUserId);
      for (const mentionedUserId of row.mentionedUserIds) userIds.add(mentionedUserId);
    }
    const userById = await findAuthUsersByIds(ctx, [...userIds]);
    // One bounded scan — same pattern as listMentionCandidates — avoids N
    // serial by_userId lookups on large threads.
    const profiles = await ctx.db.query("userAdminProfiles").withIndex("by_active").take(2000);
    const usernameByUserId = new Map<string, string>();
    for (const profile of profiles) {
      if (!userIds.has(profile.userId) || !profile.username) continue;
      usernameByUserId.set(profile.userId, profile.username);
    }
    const nameFor = (userId: string) =>
      userById.get(userId)?.name ?? userById.get(userId)?.email ?? "Arbor Live user";

    return rows.map((row) => ({
      _id: row._id,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      authorUserId: row.authorUserId,
      authorName: nameFor(row.authorUserId),
      authorEmail: userById.get(row.authorUserId)?.email ?? "",
      body: row.body,
      mentionedUserIds: row.mentionedUserIds,
      mentionedUsers: row.mentionedUserIds.map((userId) => ({
        userId,
        name: nameFor(userId),
        username: usernameByUserId.get(userId),
      })),
      canDelete: row.authorUserId === viewerUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  },
});

/** Thread sizes for list badges, so a queue does not have to load every thread. */
export const countBySubjects = query({
  args: { subjectType: subjectTypeValue, subjectIds: v.array(v.string()) },
  returns: v.array(v.object({ subjectId: v.string(), count: v.number() })),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);

    const subjectIds = [...new Set(args.subjectIds)].slice(0, MAX_COUNT_SUBJECTS);
    return await Promise.all(
      subjectIds.map(async (subjectId) => {
        const rows = await ctx.db
          .query("comments")
          .withIndex("by_subject_and_createdAt", (q) =>
            q.eq("subjectType", args.subjectType).eq("subjectId", subjectId),
          )
          .take(100);
        return { subjectId, count: rows.length };
      }),
    );
  },
});

export const createComment = mutation({
  args: {
    subjectType: subjectTypeValue,
    subjectId: v.string(),
    body: v.string(),
    mentionedUserIds: v.optional(v.array(v.string())),
  },
  returns: v.id("comments"),
  handler: async (ctx, args) => {
    const author = await requireAuth(ctx);
    const context = await requireArborInternalContext(ctx);
    const authorUserId = getUserId(author);

    const body = args.body.trim();
    if (!body) throw new Error("Comment cannot be empty.");
    if (body.length > MAX_COMMENT_LENGTH) {
      throw new Error(`Comment must be ${MAX_COMMENT_LENGTH} characters or fewer.`);
    }

    const subject = await resolveSubject(ctx, args.subjectType, args.subjectId);

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
    const commentId = await ctx.db.insert("comments", {
      subjectType: args.subjectType,
      subjectId: args.subjectId,
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
      const commentSnippet = snippet(body);

      for (const mentionedUserId of notifyUserIds) {
        const mentionedUser = mentionedUsers.get(mentionedUserId);
        const to = mentionedUser?.email?.trim().toLowerCase();
        if (!to) continue;
        const recipientName = mentionedUser?.name ?? undefined;
        const idempotencyKey = `comment_mention:${commentId}:${mentionedUserId}`;

        if (subject.kind === "event") {
          const event = subject.event;
          await enqueueEmail(ctx, {
            template: "event_comment_mention",
            to,
            subject: subjectForTemplate("event_comment_mention", event.title),
            eventId: event._id,
            idempotencyKey,
            payload: {
              recipientName,
              authorName,
              eventTitle: event.title,
              venueName: event.venueName,
              dateRangeLabel: formatEventDateRange(
                event.startAt,
                event.endAt,
                EVENT_TIMEZONE,
              ),
              commentSnippet,
              eventUrl: eventDashboardUrl(event._id),
            },
          });
          continue;
        }

        await enqueueEmail(ctx, {
          template: "comment_mention",
          to,
          subject: subjectForTemplate("comment_mention", subject.title),
          eventId: subject.eventId,
          idempotencyKey,
          payload: {
            recipientName,
            authorName,
            subjectKindLabel: subject.kindLabel,
            subjectTitle: subject.title,
            contextRows: subject.contextRows,
            commentSnippet,
            url: subject.url,
            ctaLabel: subject.ctaLabel,
          },
        });
      }
    }

    return commentId;
  },
});

export const deleteComment = mutation({
  args: { commentId: v.id("comments") },
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
