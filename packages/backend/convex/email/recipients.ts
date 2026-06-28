import { components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AuthUserRecord = {
  id?: string;
  _id?: string;
  name?: string;
  email?: string;
};

export type EmailRecipient = {
  email: string;
  name?: string;
  userId?: string;
};

function getUserKey(user: AuthUserRecord) {
  return user.id ?? user._id ?? "";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function fetchUsersByIds(ctx: QueryCtx | MutationCtx, userIds: string[]) {
  const userByKey = new Map<string, AuthUserRecord>();
  if (userIds.length === 0) return userByKey;

  const usersResult = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "user",
    where: [{ field: "_id", operator: "in", value: userIds }],
    paginationOpts: { cursor: null, numItems: userIds.length },
  });

  for (const user of (usersResult?.page ?? []) as AuthUserRecord[]) {
    const key = getUserKey(user);
    if (key) userByKey.set(key, user);
  }
  return userByKey;
}

function addRecipient(
  recipients: Map<string, EmailRecipient>,
  email: string | undefined,
  name?: string,
  userId?: string,
) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !isValidEmail(normalized)) return;
  if (recipients.has(normalized)) return;
  recipients.set(normalized, { email: normalized, name, userId });
}

export async function getEventStakeholderEmails(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
) {
  const event = await ctx.db.get(eventId);
  if (!event) return [] as EmailRecipient[];

  const userIds = [event.dayOfLeadUserId, event.eventManagerUserId].filter(
    (value): value is string => Boolean(value?.trim()),
  );

  const shifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(500);
  for (const shift of shifts) {
    if (shift.userId) userIds.push(shift.userId);
  }

  const assignments = await ctx.db
    .query("eventPeopleAssignments")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(200);

  const userByKey = await fetchUsersByIds(ctx, [...new Set(userIds)]);
  const recipients = new Map<string, EmailRecipient>();

  for (const userId of userIds) {
    const user = userByKey.get(userId);
    addRecipient(recipients, user?.email, user?.name ?? undefined, userId);
  }

  for (const assignment of assignments) {
    addRecipient(recipients, assignment.contactEmail, assignment.personName, assignment.userId);
  }

  return [...recipients.values()];
}

export async function getSchedulePublishedRecipients(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
) {
  const event = await ctx.db.get(eventId);
  if (!event) return [] as EmailRecipient[];

  const userIds = [event.dayOfLeadUserId, event.eventManagerUserId].filter(
    (value): value is string => Boolean(value?.trim()),
  );

  const shifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(500);
  for (const shift of shifts) {
    if (shift.userId) userIds.push(shift.userId);
  }

  const userByKey = await fetchUsersByIds(ctx, [...new Set(userIds)]);
  const recipients = new Map<string, EmailRecipient>();

  for (const userId of userIds) {
    const user = userByKey.get(userId);
    addRecipient(recipients, user?.email, user?.name ?? undefined, userId);
  }

  return [...recipients.values()];
}

export async function getEventLeadRecipients(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
) {
  const event = await ctx.db.get(eventId);
  if (!event) return [] as EmailRecipient[];

  const userIds = [event.dayOfLeadUserId, event.eventManagerUserId].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  const userByKey = await fetchUsersByIds(ctx, userIds);
  const recipients = new Map<string, EmailRecipient>();

  for (const userId of userIds) {
    const user = userByKey.get(userId);
    addRecipient(recipients, user?.email, user?.name ?? undefined, userId);
  }

  return [...recipients.values()];
}
