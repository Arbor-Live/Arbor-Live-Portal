import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Backfill convertedEventIds and events.sourceEventRequestId for legacy conversions.
 * Run repeatedly until `remaining` is 0:
 *   npx convex run migrations/convertedEventLinks:migrateConvertedEventLinks
 */
export const migrateConvertedEventLinks = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({
    requestsMigrated: v.number(),
    eventsMigrated: v.number(),
    remaining: v.number(),
  }),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 200));
    const rows = await ctx.db.query("eventRequests").take(500);
    const pending = rows.filter(
      (row) =>
        row.status === "converted" &&
        (!row.convertedEventIds?.length || row.convertedEventId) &&
        (Boolean(row.convertedEventId) || Boolean(row.linkedInvoiceId)),
    );

    let requestsMigrated = 0;
    let eventsMigrated = 0;

    for (const row of pending.slice(0, limit)) {
      const eventIds = row.convertedEventIds?.length
        ? row.convertedEventIds
        : row.convertedEventId
          ? [row.convertedEventId]
          : [];

      if (eventIds.length === 0 && row.linkedInvoiceId) {
        const invoiceEvents = await ctx.db
          .query("events")
          .withIndex("by_invoiceId", (q) => q.eq("invoiceId", row.linkedInvoiceId!))
          .take(50);
        for (const event of invoiceEvents) {
          eventIds.push(event._id);
        }
      }

      const uniqueEventIds = [...new Set(eventIds)];
      if (uniqueEventIds.length === 0) continue;

      const sortedEvents = (
        await Promise.all(uniqueEventIds.map((eventId) => ctx.db.get(eventId)))
      )
        .filter((event): event is NonNullable<typeof event> => Boolean(event))
        .sort((a, b) => a.startAt - b.startAt || a._creationTime - b._creationTime);

      if (sortedEvents.length === 0) continue;

      const now = Date.now();
      const convertedEventIds = sortedEvents.map((event) => event._id);

      await ctx.db.patch(row._id, {
        convertedEventIds,
        convertedEventId: convertedEventIds[0],
        updatedAt: now,
      });

      for (const event of sortedEvents) {
        if (event.sourceEventRequestId === row._id) continue;
        await ctx.db.patch(event._id, {
          sourceEventRequestId: row._id,
          updatedAt: now,
        });
        eventsMigrated += 1;
      }

      requestsMigrated += 1;
    }

    return {
      requestsMigrated,
      eventsMigrated,
      remaining: Math.max(0, pending.length - requestsMigrated),
    };
  },
});
