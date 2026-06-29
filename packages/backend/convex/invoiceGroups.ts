import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireArborInternalContext, requireAuth } from "./lib/auth";

const groupTypeValue = v.union(
  v.literal("vso"),
  v.literal("house"),
  v.literal("department"),
  v.literal("individual"),
);

const equipmentPricingModeValue = v.union(
  v.literal("subsidized"),
  v.literal("nonSubsidized"),
);

const staleCutoffMs = 365 * 24 * 60 * 60 * 1000;

export const listForAdmin = query({
  args: {
    includeInactive: v.optional(v.boolean()),
  },
  returns: v.array(
    v.object({
      _id: v.id("invoiceGroups"),
      name: v.string(),
      type: groupTypeValue,
      active: v.boolean(),
      equipmentPricingMode: equipmentPricingModeValue,
      contactCount: v.number(),
      lastUsedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireArborInternalContext(ctx);
    const groups = await ctx.db.query("invoiceGroups").take(500);
    const contacts = await ctx.db.query("invoiceContacts").take(2000);
    const contactCountByGroup = new Map<string, number>();
    for (const contact of contacts) {
      if (!contact.groupId) continue;
      contactCountByGroup.set(
        contact.groupId,
        (contactCountByGroup.get(contact.groupId) ?? 0) + 1,
      );
    }
    return groups
      .filter((group) => args.includeInactive || group.active)
      .map((group) => ({
        _id: group._id,
        name: group.name,
        type: group.type,
        active: group.active,
        equipmentPricingMode: group.equipmentPricingMode ?? "subsidized",
        contactCount: contactCountByGroup.get(group._id) ?? 0,
        lastUsedAt: group.lastUsedAt,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const list = query({
  args: {
    activeOnly: v.optional(v.boolean()),
    includeStale: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const rows = args.activeOnly
      ? await ctx.db.query("invoiceGroups").withIndex("by_active", (q) => q.eq("active", true)).take(500)
      : await ctx.db.query("invoiceGroups").take(500);
    const cutoff = Date.now() - staleCutoffMs;
    const filtered = rows.filter((row) => {
      if (args.includeStale) return true;
      return !row.lastUsedAt || row.lastUsedAt >= cutoff;
    });
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    type: groupTypeValue,
    equipmentPricingMode: v.optional(equipmentPricingModeValue),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const now = Date.now();
    const name = args.name.trim();
    if (!name) throw new Error("Group name is required.");
    return await ctx.db.insert("invoiceGroups", {
      name,
      type: args.type,
      equipmentPricingMode: args.equipmentPricingMode ?? "subsidized",
      active: args.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("invoiceGroups"),
    name: v.optional(v.string()),
    type: v.optional(groupTypeValue),
    equipmentPricingMode: v.optional(equipmentPricingModeValue),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Group not found.");
    const nextName = args.name?.trim();
    await ctx.db.patch(args.id, {
      name: nextName ? nextName : existing.name,
      type: args.type ?? existing.type,
      equipmentPricingMode: args.equipmentPricingMode ?? existing.equipmentPricingMode,
      active: args.active ?? existing.active,
      updatedAt: Date.now(),
    });
  },
});

export const archive = mutation({
  args: { id: v.id("invoiceGroups") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Group not found.");
    await ctx.db.patch(args.id, { active: false, updatedAt: Date.now() });
  },
});
