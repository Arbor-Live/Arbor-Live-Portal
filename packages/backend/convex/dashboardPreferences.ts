import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserId, requireAuth } from "./lib/auth";

const dashboardKeyValue = v.union(v.literal("crewHome"), v.literal("adminHome"));

function uniqueWidgetIds(ids: string[]) {
  return Array.from(
    new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)),
  );
}

export const getMyDashboardPreference = query({
  args: {
    dashboardKey: dashboardKeyValue,
  },
  returns: v.union(
    v.object({
      dashboardKey: dashboardKeyValue,
      widgetOrder: v.array(v.string()),
      hiddenWidgetIds: v.array(v.string()),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const preference = await ctx.db
      .query("dashboardPreferences")
      .withIndex("by_userId_and_dashboardKey", (q) =>
        q.eq("userId", userId).eq("dashboardKey", args.dashboardKey),
      )
      .unique();
    if (!preference) return null;
    return {
      dashboardKey: preference.dashboardKey,
      widgetOrder: preference.widgetOrder,
      hiddenWidgetIds: preference.hiddenWidgetIds,
      updatedAt: preference.updatedAt,
    };
  },
});

export const saveMyDashboardPreference = mutation({
  args: {
    dashboardKey: dashboardKeyValue,
    widgetOrder: v.array(v.string()),
    hiddenWidgetIds: v.array(v.string()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const now = Date.now();
    const widgetOrder = uniqueWidgetIds(args.widgetOrder);
    const hiddenWidgetIds = uniqueWidgetIds(args.hiddenWidgetIds);
    const existing = await ctx.db
      .query("dashboardPreferences")
      .withIndex("by_userId_and_dashboardKey", (q) =>
        q.eq("userId", userId).eq("dashboardKey", args.dashboardKey),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        widgetOrder,
        hiddenWidgetIds,
        updatedAt: now,
      });
      return { ok: true };
    }
    await ctx.db.insert("dashboardPreferences", {
      userId,
      dashboardKey: args.dashboardKey,
      widgetOrder,
      hiddenWidgetIds,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const resetMyDashboardPreference = mutation({
  args: {
    dashboardKey: dashboardKeyValue,
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const existing = await ctx.db
      .query("dashboardPreferences")
      .withIndex("by_userId_and_dashboardKey", (q) =>
        q.eq("userId", userId).eq("dashboardKey", args.dashboardKey),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return { ok: true };
  },
});
