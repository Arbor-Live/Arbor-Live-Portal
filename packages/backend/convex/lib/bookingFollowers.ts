import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { EmailRecipient } from "../email/recipients";
import { findAuthUsersByIds, hasOperationsAccess } from "./auth";
import {
  resolveBookingChain,
  type BookingChain,
  type BookingTarget,
} from "./bookingChain";

type Ctx = QueryCtx | MutationCtx;

/** Far above the admins and ops people one booking has; keeps the fan-out read bounded. */
const MAX_FOLLOWS_PER_RECORD = 50;

/**
 * Follows on any record of the chain, for one user or (without `userId`) for
 * everyone.
 */
export async function listChainFollows(
  ctx: Ctx,
  chain: BookingChain,
  userId?: string,
): Promise<Doc<"bookingFollows">[]> {
  const follows: Doc<"bookingFollows">[] = [];
  for (const requestId of chain.requestIds) {
    follows.push(
      ...(await ctx.db
        .query("bookingFollows")
        .withIndex("by_requestId_and_userId", (q) =>
          userId ? q.eq("requestId", requestId).eq("userId", userId) : q.eq("requestId", requestId),
        )
        .take(MAX_FOLLOWS_PER_RECORD)),
    );
  }
  for (const invoiceId of chain.invoiceIds) {
    follows.push(
      ...(await ctx.db
        .query("bookingFollows")
        .withIndex("by_invoiceId_and_userId", (q) =>
          userId ? q.eq("invoiceId", invoiceId).eq("userId", userId) : q.eq("invoiceId", invoiceId),
        )
        .take(MAX_FOLLOWS_PER_RECORD)),
    );
  }
  for (const eventId of chain.eventIds) {
    follows.push(
      ...(await ctx.db
        .query("bookingFollows")
        .withIndex("by_eventId_and_userId", (q) =>
          userId ? q.eq("eventId", eventId).eq("userId", userId) : q.eq("eventId", eventId),
        )
        .take(MAX_FOLLOWS_PER_RECORD)),
    );
  }
  return follows;
}

/**
 * Staff who follow any record of `target`'s booking, once each. Someone who has
 * since lost admin or Operations access is dropped. `already` lists the
 * recipients the caller is notifying anyway, matched by user id or email.
 */
export async function listBookingFollowers(
  ctx: Ctx,
  target: BookingTarget,
  already: { userIds?: Iterable<string>; emails?: Iterable<string> } = {},
): Promise<EmailRecipient[]> {
  const chain = await resolveBookingChain(ctx, target);
  const skipUserIds = new Set(already.userIds);
  const skipEmails = new Set([...(already.emails ?? [])].map((email) => email.trim().toLowerCase()));

  const userIds = new Set<string>();
  for (const follow of await listChainFollows(ctx, chain)) {
    if (!skipUserIds.has(follow.userId)) userIds.add(follow.userId);
  }
  if (userIds.size === 0) return [];

  const users = await findAuthUsersByIds(ctx, [...userIds]);
  const followers: EmailRecipient[] = [];
  const seenEmails = new Set<string>();
  for (const userId of userIds) {
    const user = users.get(userId);
    const email = user?.email?.trim().toLowerCase();
    if (!user || user.banned || !email) continue;
    if (skipEmails.has(email) || seenEmails.has(email)) continue;
    if (!(await hasOperationsAccess(ctx, user))) continue;
    seenEmails.add(email);
    followers.push({ email, name: user.name ?? undefined, userId });
  }
  return followers;
}
