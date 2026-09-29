import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import { eventGroupKind } from "./lib/eventGroups";
import { listGroupDays } from "./lib/eventSeriesGeneration";

/** Event groups: a set of dated events sharing setup and billing. */

export const get = query({
  args: { id: v.id("eventSeries") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const group = await ctx.db.get(args.id);
    if (!group) return null;
    const days = await listGroupDays(ctx, args.id);
    return { group, days, kind: eventGroupKind(group), dayCount: days.length };
  },
});
