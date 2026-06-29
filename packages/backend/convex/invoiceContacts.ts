import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireAdmin, requireArborInternalContext, requireAuth } from "./lib/auth";
import {
  contactSortKey,
  formatContactFullName,
  resolveContactNameParts,
  splitContactName,
} from "./lib/contactName";

const staleCutoffMs = 365 * 24 * 60 * 60 * 1000;

type ContactDoc = {
  _id: import("./_generated/dataModel").Id<"invoiceContacts">;
  groupId?: import("./_generated/dataModel").Id<"invoiceGroups">;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  active: boolean;
  lastUsedAt?: number;
  createdAt: number;
  updatedAt: number;
};

const contactFields = v.object({
  _id: v.id("invoiceContacts"),
  groupId: v.optional(v.id("invoiceGroups")),
  firstName: v.string(),
  lastName: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  active: v.boolean(),
  lastUsedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

function mapContactRow(row: ContactDoc) {
  const { firstName, lastName } = resolveContactNameParts(row);
  return {
    _id: row._id,
    groupId: row.groupId,
    firstName,
    lastName,
    email: row.email,
    phone: row.phone,
    active: row.active,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeContactInput(args: { firstName: string; lastName: string }) {
  const firstName = args.firstName.trim();
  const lastName = args.lastName.trim();
  if (!firstName || !lastName) {
    throw new Error("First and last name are required.");
  }
  return { firstName, lastName };
}

export const listForAdmin = query({
  args: {
    groupId: v.optional(v.id("invoiceGroups")),
    includeInactive: v.optional(v.boolean()),
  },
  returns: v.array(contactFields),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireArborInternalContext(ctx);
    const base = args.groupId
      ? await ctx.db
          .query("invoiceContacts")
          .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
          .take(500)
      : await ctx.db.query("invoiceContacts").take(500);
    return base
      .filter((row) => args.includeInactive || row.active)
      .map(mapContactRow)
      .sort((a, b) => contactSortKey(a).localeCompare(contactSortKey(b)));
  },
});

export const list = query({
  args: {
    groupId: v.optional(v.id("invoiceGroups")),
    activeOnly: v.optional(v.boolean()),
    includeStale: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const base = args.groupId
      ? await ctx.db
          .query("invoiceContacts")
          .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
          .take(500)
      : args.activeOnly
        ? await ctx.db.query("invoiceContacts").withIndex("by_active", (q) => q.eq("active", true)).take(500)
        : await ctx.db.query("invoiceContacts").take(500);
    const cutoff = Date.now() - staleCutoffMs;
    return base
      .filter((row) => {
        if (args.activeOnly && !row.active) return false;
        if (args.includeStale) return true;
        return !row.lastUsedAt || row.lastUsedAt >= cutoff;
      })
      .map(mapContactRow)
      .sort((a, b) => contactSortKey(a).localeCompare(contactSortKey(b)));
  },
});

export const create = mutation({
  args: {
    groupId: v.optional(v.id("invoiceGroups")),
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const now = Date.now();
    const { firstName, lastName } = normalizeContactInput(args);
    return await ctx.db.insert("invoiceContacts", {
      groupId: args.groupId,
      firstName,
      lastName,
      email: args.email?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      active: args.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("invoiceContacts"),
    groupId: v.optional(v.id("invoiceGroups")),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Contact not found.");
    const firstName = args.firstName?.trim() ?? existing.firstName;
    const lastName = args.lastName?.trim() ?? existing.lastName;
    if (!firstName || !lastName) {
      throw new Error("First and last name are required.");
    }
    await ctx.db.patch(args.id, {
      groupId: args.groupId ?? existing.groupId,
      firstName,
      lastName,
      email: args.email?.trim() ?? existing.email,
      phone: args.phone?.trim() ?? existing.phone,
      active: args.active ?? existing.active,
      updatedAt: Date.now(),
    });
  },
});

export const archive = mutation({
  args: { id: v.id("invoiceContacts") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Contact not found.");
    await ctx.db.patch(args.id, { active: false, updatedAt: Date.now() });
  },
});

/** One-time migration: split legacy `name` into firstName/lastName. Run from Convex dashboard if needed. */
export const backfillNameFieldsFromLegacyName = internalMutation({
  args: {},
  returns: v.object({ updated: v.number() }),
  handler: async (ctx) => {
    const contacts = await ctx.db.query("invoiceContacts").take(500);
    let updated = 0;
    for (const contact of contacts) {
      if (contact.firstName?.trim() && contact.lastName !== undefined) continue;
      if (!contact.name?.trim()) continue;
      const { firstName, lastName } = splitContactName(contact.name);
      await ctx.db.patch(contact._id, {
        firstName: firstName || contact.name.trim(),
        lastName,
        updatedAt: Date.now(),
      });
      updated += 1;
    }
    return { updated };
  },
});

export { formatContactFullName };
