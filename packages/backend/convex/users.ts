import { v } from "convex/values";
import { query, mutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import { components } from "./_generated/api";

type BetterAuthUser = {
  _id?: string;
  id?: string;
  name?: string;
  email?: string;
  role?: string | null;
};

function getUserId(user: BetterAuthUser) {
  return user.id ?? user._id ?? "";
}

async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.email) {
    throw new Error("You must be signed in.");
  }
  const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: identity.email }],
  })) as BetterAuthUser | null;
  if (!user) {
    throw new Error("Current user record not found.");
  }
  return user;
}

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (user.role !== "admin") {
    throw new Error("Only admins can manage user compensation rates.");
  }
  return user;
}

export const listWithRates = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      paginationOpts: { cursor: null, numItems: 500 },
    });
    const users = ((result?.page ?? []) as BetterAuthUser[])
      .map((user) => ({
        id: getUserId(user),
        name: user.name ?? user.email ?? "Unknown user",
        email: user.email ?? "",
        role: user.role ?? "",
      }))
      .filter((user) => Boolean(user.id));
    const rates = await ctx.db.query("userCompensationRates").withIndex("by_updatedAt").take(1000);
    const rateByUserId = new Map(rates.map((rate) => [rate.userId, rate.hourlyRateUsd]));
    return users
      .map((user) => ({
        ...user,
        hourlyRateUsd: rateByUserId.get(user.id) ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const setHourlyRate = mutation({
  args: {
    userId: v.string(),
    hourlyRateUsd: v.number(),
  },
  handler: async (ctx, args) => {
    const adminUser = await requireAdmin(ctx);
    if (args.hourlyRateUsd < 0) {
      throw new Error("Hourly rate must be a positive number.");
    }
    const existing = await ctx.db
      .query("userCompensationRates")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        hourlyRateUsd: args.hourlyRateUsd,
        updatedByUserId: getUserId(adminUser) || undefined,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("userCompensationRates", {
      userId: args.userId,
      hourlyRateUsd: args.hourlyRateUsd,
      updatedByUserId: getUserId(adminUser) || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});
