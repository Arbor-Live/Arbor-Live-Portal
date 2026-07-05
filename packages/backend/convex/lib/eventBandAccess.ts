import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function hasBandEventParticipation(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  organizationId: string,
) {
  const participation = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_eventId_and_organizationId", (q) =>
      q.eq("eventId", eventId).eq("organizationId", organizationId),
    )
    .first();
  if (participation) return true;

  const payment = await ctx.db
    .query("eventBandPayments")
    .withIndex("by_eventId_and_organizationId", (q) =>
      q.eq("eventId", eventId).eq("organizationId", organizationId),
    )
    .unique();
  return Boolean(payment && payment.status !== "cancelled");
}

export async function listBandLinkedEvents(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
) {
  const linkedEvents = new Map<
    Id<"events">,
    { eventId: Id<"events">; role: "headliner" | "support" | "other" }
  >();

  const participations = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .take(100);
  for (const row of participations) {
    linkedEvents.set(row.eventId, { eventId: row.eventId, role: row.role });
  }

  const payments = await ctx.db
    .query("eventBandPayments")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .take(100);
  for (const payment of payments) {
    if (payment.status === "cancelled") continue;
    if (!linkedEvents.has(payment.eventId)) {
      linkedEvents.set(payment.eventId, {
        eventId: payment.eventId,
        role: "headliner",
      });
    }
  }

  return linkedEvents;
}
