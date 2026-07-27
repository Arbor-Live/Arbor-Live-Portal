import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAdmin, requireArborInternalContext, requireAuth } from "./lib/auth";
import {
  contactRichnessScore,
  ensureAlias,
  findGroupByNameOrAlias,
  listAliasesForGroup,
  normalizeHostOrgName,
  searchHostOrganizations,
} from "./lib/hostOrgIdentity";

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

const aliasRowValue = v.object({
  _id: v.id("invoiceGroupAliases"),
  alias: v.string(),
  source: v.union(v.literal("manual"), v.literal("merge"), v.literal("rename")),
  createdAt: v.number(),
});

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
      aliasCount: v.number(),
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
    const aliases = await ctx.db.query("invoiceGroupAliases").take(2000);
    const contactCountByGroup = new Map<string, number>();
    for (const contact of contacts) {
      if (!contact.groupId) continue;
      contactCountByGroup.set(
        contact.groupId,
        (contactCountByGroup.get(contact.groupId) ?? 0) + 1,
      );
    }
    const aliasCountByGroup = new Map<string, number>();
    for (const alias of aliases) {
      aliasCountByGroup.set(alias.groupId, (aliasCountByGroup.get(alias.groupId) ?? 0) + 1);
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
        aliasCount: aliasCountByGroup.get(group._id) ?? 0,
        lastUsedAt: group.lastUsedAt,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listAliases = query({
  args: { groupId: v.id("invoiceGroups") },
  returns: v.array(aliasRowValue),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireArborInternalContext(ctx);
    const rows = await listAliasesForGroup(ctx, args.groupId);
    return rows
      .map((row) => ({
        _id: row._id,
        alias: row.alias,
        source: row.source,
        createdAt: row.createdAt,
      }))
      .sort((a, b) => a.alias.localeCompare(b.alias));
  },
});

export const getMergePreview = query({
  args: {
    survivorId: v.id("invoiceGroups"),
    victimIds: v.array(v.id("invoiceGroups")),
  },
  returns: v.object({
    survivorName: v.string(),
    victims: v.array(
      v.object({
        _id: v.id("invoiceGroups"),
        name: v.string(),
        contactCount: v.number(),
        eventCount: v.number(),
        seriesCount: v.number(),
        invoiceCount: v.number(),
        requestCount: v.number(),
        aliasCount: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireArborInternalContext(ctx);
    const survivor = await ctx.db.get(args.survivorId);
    if (!survivor) throw new Error("Survivor host not found.");
    const victimIds = [...new Set(args.victimIds.filter((id) => id !== args.survivorId))];
    const victims = [];
    for (const victimId of victimIds) {
      const victim = await ctx.db.get(victimId);
      if (!victim) continue;
      const contacts = await ctx.db
        .query("invoiceContacts")
        .withIndex("by_groupId", (q) => q.eq("groupId", victimId))
        .take(500);
      const events = await ctx.db
        .query("events")
        .withIndex("by_hostGroupId", (q) => q.eq("hostGroupId", victimId))
        .take(500);
      const series = await ctx.db
        .query("eventSeries")
        .withIndex("by_hostGroupId", (q) => q.eq("hostGroupId", victimId))
        .take(500);
      const invoices = await ctx.db
        .query("invoices")
        .withIndex("by_groupId", (q) => q.eq("groupId", victimId))
        .take(500);
      const requests = await ctx.db
        .query("eventRequests")
        .withIndex("by_invoiceGroupId", (q) => q.eq("invoiceGroupId", victimId))
        .take(500);
      const aliases = await listAliasesForGroup(ctx, victimId);
      victims.push({
        _id: victim._id,
        name: victim.name,
        contactCount: contacts.length,
        eventCount: events.length,
        seriesCount: series.length,
        invoiceCount: invoices.length,
        requestCount: requests.length,
        aliasCount: aliases.length,
      });
    }
    return { survivorName: survivor.name, victims };
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

export const suggestByName = query({
  args: { name: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("invoiceGroups"),
      name: v.string(),
      type: groupTypeValue,
      matchKind: v.union(v.literal("exact"), v.literal("alias"), v.literal("similar")),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const name = args.name.trim();
    if (!name) return null;
    const exact = await findGroupByNameOrAlias(ctx, name);
    if (exact) {
      const normalized = normalizeHostOrgName(name);
      const matchKind =
        (exact.normalizedName ?? normalizeHostOrgName(exact.name)) === normalized
          ? ("exact" as const)
          : ("alias" as const);
      return { _id: exact._id, name: exact.name, type: exact.type, matchKind };
    }
    const similar = await searchHostOrganizations(ctx, name, 1);
    const top = similar[0];
    if (!top) return null;
    return { _id: top._id, name: top.name, type: top.type, matchKind: "similar" as const };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    type: groupTypeValue,
    equipmentPricingMode: v.optional(equipmentPricingModeValue),
    active: v.optional(v.boolean()),
  },
  returns: v.id("invoiceGroups"),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const now = Date.now();
    const name = args.name.trim();
    if (!name) throw new Error("Group name is required.");
    const existing = await findGroupByNameOrAlias(ctx, name);
    if (existing) {
      throw new Error(
        `A host organization already exists as "${existing.name}". Use the existing host instead of creating a duplicate.`,
      );
    }
    return await ctx.db.insert("invoiceGroups", {
      name,
      normalizedName: normalizeHostOrgName(name),
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
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Group not found.");
    const nextName = args.name?.trim() ? args.name.trim() : existing.name;
    const normalizedName = normalizeHostOrgName(nextName);
    if (nextName !== existing.name) {
      const conflict = await findGroupByNameOrAlias(ctx, nextName);
      if (conflict && conflict._id !== args.id) {
        throw new Error(
          `Another host organization already uses "${conflict.name}". Merge or pick a different name.`,
        );
      }
      await ensureAlias(ctx, args.id, existing.name, "rename");
    }
    await ctx.db.patch(args.id, {
      name: nextName,
      normalizedName,
      type: args.type ?? existing.type,
      equipmentPricingMode: args.equipmentPricingMode ?? existing.equipmentPricingMode,
      active: args.active ?? existing.active,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const addAlias = mutation({
  args: {
    groupId: v.id("invoiceGroups"),
    alias: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireArborInternalContext(ctx);
    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Host organization not found.");
    await ensureAlias(ctx, args.groupId, args.alias, "manual");
    return null;
  },
});

export const removeAlias = mutation({
  args: { aliasId: v.id("invoiceGroupAliases") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireArborInternalContext(ctx);
    const alias = await ctx.db.get(args.aliasId);
    if (!alias) throw new Error("Alias not found.");
    await ctx.db.delete(args.aliasId);
    return null;
  },
});

export const merge = mutation({
  args: {
    survivorId: v.id("invoiceGroups"),
    victimIds: v.array(v.id("invoiceGroups")),
    canonicalName: v.optional(v.string()),
  },
  returns: v.object({
    survivorId: v.id("invoiceGroups"),
    archivedVictimIds: v.array(v.id("invoiceGroups")),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireArborInternalContext(ctx);
    const now = Date.now();
    const survivor = await ctx.db.get(args.survivorId);
    if (!survivor || !survivor.active) throw new Error("Survivor host must be an active organization.");

    const victimIds = [...new Set(args.victimIds.filter((id) => id !== args.survivorId))];
    if (victimIds.length === 0) throw new Error("Select at least one host to merge.");

    const victims = [];
    for (const victimId of victimIds) {
      const victim = await ctx.db.get(victimId);
      if (!victim) throw new Error("Host organization not found.");
      if (!victim.active) throw new Error(`"${victim.name}" is already archived.`);
      victims.push(victim);
    }

    const canonicalName = args.canonicalName?.trim() || survivor.name;
    const survivorContacts = await ctx.db
      .query("invoiceContacts")
      .withIndex("by_groupId", (q) => q.eq("groupId", args.survivorId))
      .take(500);
    const survivorByEmail = new Map<string, (typeof survivorContacts)[number]>();
    for (const contact of survivorContacts) {
      const email = contact.email?.trim().toLowerCase();
      if (email && contact.active) survivorByEmail.set(email, contact);
    }

    for (const victim of victims) {
      const victimContacts = await ctx.db
        .query("invoiceContacts")
        .withIndex("by_groupId", (q) => q.eq("groupId", victim._id))
        .take(500);
      for (const contact of victimContacts) {
        const email = contact.email?.trim().toLowerCase();
        const survivorContact = email ? survivorByEmail.get(email) : undefined;
        if (survivorContact && contact.active) {
          const keepSurvivor = contactRichnessScore(survivorContact) >= contactRichnessScore(contact);
          if (keepSurvivor) {
            await ctx.db.patch(contact._id, { active: false, updatedAt: now });
            await ctx.db.patch(survivorContact._id, {
              firstName: survivorContact.firstName || contact.firstName,
              lastName: survivorContact.lastName || contact.lastName,
              phone: survivorContact.phone || contact.phone,
              updatedAt: now,
            });
          } else {
            await ctx.db.patch(survivorContact._id, { active: false, updatedAt: now });
            await ctx.db.patch(contact._id, {
              groupId: args.survivorId,
              firstName: contact.firstName || survivorContact.firstName,
              lastName: contact.lastName || survivorContact.lastName,
              phone: contact.phone || survivorContact.phone,
              updatedAt: now,
            });
            if (email) survivorByEmail.set(email, { ...contact, groupId: args.survivorId });
          }
        } else {
          await ctx.db.patch(contact._id, { groupId: args.survivorId, updatedAt: now });
          if (email && contact.active) {
            survivorByEmail.set(email, { ...contact, groupId: args.survivorId });
          }
        }
      }

      const events = await ctx.db
        .query("events")
        .withIndex("by_hostGroupId", (q) => q.eq("hostGroupId", victim._id))
        .take(500);
      for (const event of events) {
        await ctx.db.patch(event._id, {
          hostGroupId: args.survivorId,
          host: canonicalName,
          updatedAt: now,
        });
      }

      const seriesRows = await ctx.db
        .query("eventSeries")
        .withIndex("by_hostGroupId", (q) => q.eq("hostGroupId", victim._id))
        .take(500);
      for (const series of seriesRows) {
        await ctx.db.patch(series._id, {
          hostGroupId: args.survivorId,
          host: canonicalName,
          updatedAt: now,
        });
      }

      const invoices = await ctx.db
        .query("invoices")
        .withIndex("by_groupId", (q) => q.eq("groupId", victim._id))
        .take(500);
      for (const invoice of invoices) {
        await ctx.db.patch(invoice._id, {
          groupId: args.survivorId,
          clientGroupName: canonicalName,
          clientGroupType: survivor.type,
          updatedAt: now,
        });
      }

      const requests = await ctx.db
        .query("eventRequests")
        .withIndex("by_invoiceGroupId", (q) => q.eq("invoiceGroupId", victim._id))
        .take(500);
      for (const request of requests) {
        await ctx.db.patch(request._id, {
          invoiceGroupId: args.survivorId,
          updatedAt: now,
        });
      }

      // Archive first so ensureAlias does not treat the victim's own name as a
      // colliding active host when recording it as a merge alias on the survivor.
      await ctx.db.patch(victim._id, { active: false, updatedAt: now });

      await ensureAlias(ctx, args.survivorId, victim.name, "merge");
      const victimAliases = await listAliasesForGroup(ctx, victim._id);
      for (const alias of victimAliases) {
        await ensureAlias(ctx, args.survivorId, alias.alias, "merge");
        await ctx.db.delete(alias._id);
      }
    }

    await ctx.db.patch(args.survivorId, {
      name: canonicalName,
      normalizedName: normalizeHostOrgName(canonicalName),
      updatedAt: now,
    });

    const survivorEvents = await ctx.db
      .query("events")
      .withIndex("by_hostGroupId", (q) => q.eq("hostGroupId", args.survivorId))
      .take(500);
    for (const event of survivorEvents) {
      if (event.host !== canonicalName) {
        await ctx.db.patch(event._id, { host: canonicalName, updatedAt: now });
      }
    }
    const survivorInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_groupId", (q) => q.eq("groupId", args.survivorId))
      .take(500);
    for (const invoice of survivorInvoices) {
      if (invoice.clientGroupName !== canonicalName) {
        await ctx.db.patch(invoice._id, {
          clientGroupName: canonicalName,
          clientGroupType: survivor.type,
          updatedAt: now,
        });
      }
    }

    return {
      survivorId: args.survivorId,
      archivedVictimIds: victimIds as Id<"invoiceGroups">[],
    };
  },
});

export const archive = mutation({
  args: { id: v.id("invoiceGroups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Group not found.");
    await ctx.db.patch(args.id, { active: false, updatedAt: Date.now() });
    return null;
  },
});
