/**
 * Test-only bulk seeders for the list/picker cap regressions.
 *
 * The bug these guard against is a `.take(N)` that selects rows instead of
 * bounding them: past N rows, the newest ones stop appearing. Proving that
 * requires pushing a table past its take ceiling, which no single-row seeder in
 * `e2eHelpers.ts` can do.
 *
 * Every row is labelled `E2E Bulk <stamp> #<n>` so `purgeBulk` can remove the
 * whole batch afterwards — the Convex deployment is shared across worktrees, so
 * leaving hundreds of rows behind would slow every other spec.
 */
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertE2eHelpersEnabled } from "./lib/e2eGuard";
import { EMPTY_LEXICAL_STATE } from "./lib/marketingContent";

/** Scan bound for purges — comfortably above any batch a spec seeds. */
const PURGE_SCAN = 4000;
const DAY_MS = 24 * 60 * 60 * 1000;

const bulkArgs = {
  stamp: v.string(),
  /** Index of the first row in this chunk; specs seed in chunks. */
  offset: v.number(),
  count: v.number(),
};

const bulkResult = v.object({ inserted: v.number(), lastLabel: v.string() });

export function bulkLabel(stamp: string, index: number) {
  return `E2E Bulk ${stamp} #${index}`;
}

/**
 * Deterministic, strictly increasing timestamps derived from the stamp, so rows
 * stay correctly ordered no matter how the spec chunks its seeding.
 */
function bulkTimestamp(stamp: string, index: number) {
  const base = Number(stamp);
  return (Number.isFinite(base) ? base : Date.now()) + index;
}

function bulkRange(stamp: string, offset: number, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const index = offset + i;
    return { index, label: bulkLabel(stamp, index), at: bulkTimestamp(stamp, index) };
  });
}

export const seedEvents = mutation({
  args: bulkArgs,
  returns: v.object({
    inserted: v.number(),
    lastLabel: v.string(),
    lastEventId: v.union(v.id("events"), v.null()),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const rows = bulkRange(args.stamp, args.offset, args.count);
    let lastEventId: Id<"events"> | null = null;
    for (const row of rows) {
      const startAt = Date.now() + 30 * DAY_MS + row.index * 60 * 60 * 1000;
      lastEventId = await ctx.db.insert("events", {
        title: row.label,
        status: "tentative",
        visibility: "internal",
        startAt,
        endAt: startAt + 2 * 60 * 60 * 1000,
        timezone: "America/Los_Angeles",
        spansMultipleDays: false,
        setupOnly: false,
        strikeOnly: false,
        requiresShowWindow: true,
        eventType: "Crewed Event",
        createdAt: row.at,
        updatedAt: row.at,
      });
    }
    return {
      inserted: rows.length,
      lastLabel: rows[rows.length - 1]?.label ?? "",
      lastEventId,
    };
  },
});

export const seedInvoices = mutation({
  args: bulkArgs,
  returns: bulkResult,
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const rows = bulkRange(args.stamp, args.offset, args.count);
    for (const row of rows) {
      await ctx.db.insert("invoices", {
        invoiceNumber: `ALINV-BULK-${args.stamp}-${row.index}`,
        status: "draft",
        issueDate: "2026-01-01",
        managerUserId: "e2e-bulk-manager",
        managerName: row.label,
        equipmentPricingMode: "subsidized",
        crewRateMode: "normal",
        discountType: "amount",
        discountValue: 0,
        discountAmountUsd: 0,
        equipmentSubtotalUsd: 0,
        externalRentalsSubtotalUsd: 0,
        artistsSubtotalUsd: 0,
        crewSubtotalUsd: 0,
        feesSubtotalUsd: 0,
        subtotalUsd: 0,
        totalUsd: 0,
        createdAt: row.at,
        updatedAt: row.at,
      });
    }
    return { inserted: rows.length, lastLabel: rows[rows.length - 1]?.label ?? "" };
  },
});

export const seedShortLinks = mutation({
  args: { ...bulkArgs, eventId: v.optional(v.id("events")) },
  returns: bulkResult,
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const rows = bulkRange(args.stamp, args.offset, args.count);
    for (const row of rows) {
      await ctx.db.insert("shortLinks", {
        slug: `e2e-bulk-${args.stamp}-${row.index}`,
        destinationUrl: "https://example.com/e2e-bulk",
        label: row.label,
        enabled: true,
        eventId: args.eventId,
        expiryMode: "none",
        clickCount: 0,
        createdAt: row.at,
        updatedAt: row.at,
      });
    }
    return { inserted: rows.length, lastLabel: rows[rows.length - 1]?.label ?? "" };
  },
});

export const seedMarketingPosts = mutation({
  args: bulkArgs,
  returns: bulkResult,
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const rows = bulkRange(args.stamp, args.offset, args.count);
    for (const row of rows) {
      await ctx.db.insert("marketingPosts", {
        title: row.label,
        slug: `e2e-bulk-${args.stamp}-${row.index}`,
        excerpt: "E2E bulk seeded post.",
        kind: "blog",
        // Must be real Lexical state — the editor silently falls back to an
        // empty document otherwise, which breaks the save round-trip.
        contentJson: EMPTY_LEXICAL_STATE,
        published: false,
        featured: false,
        createdAt: row.at,
        updatedAt: row.at,
      });
    }
    return { inserted: rows.length, lastLabel: rows[rows.length - 1]?.label ?? "" };
  },
});

export const seedCrewApplications = mutation({
  args: bulkArgs,
  returns: bulkResult,
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const rows = bulkRange(args.stamp, args.offset, args.count);
    for (const row of rows) {
      await ctx.db.insert("crewApplications", {
        status: "submitted",
        name: row.label,
        email: `e2e.bulk.${args.stamp}.${row.index}@stanford.edu`,
        phone: "6505550199",
        heardAboutUs: "E2E bulk seed",
        vertical: "Crew",
        discipline: "Sound",
        crewAvailabilityDays: ["friday"],
        stanfordPosition: "undergrad",
        gradYear: 2028,
        submittedAt: row.at,
        createdAt: row.at,
        updatedAt: row.at,
      });
    }
    return { inserted: rows.length, lastLabel: rows[rows.length - 1]?.label ?? "" };
  },
});

export const seedBandApplications = mutation({
  args: bulkArgs,
  returns: bulkResult,
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const rows = bulkRange(args.stamp, args.offset, args.count);
    for (const row of rows) {
      await ctx.db.insert("bandApplications", {
        status: "submitted",
        contactName: `E2E Bulk Contact ${row.index}`,
        contactEmail: `e2e.bulk.band.${args.stamp}.${row.index}@example.com`,
        bandDisplayName: row.label,
        isSolo: true,
        members: [{ name: `E2E Bulk Contact ${row.index}` }],
        submittedAt: row.at,
        createdAt: row.at,
        updatedAt: row.at,
      });
    }
    return { inserted: rows.length, lastLabel: rows[rows.length - 1]?.label ?? "" };
  },
});

/**
 * Damage reports need a real inventory item. The first chunk creates one and
 * returns its ids; later chunks pass them back so the batch shares a single item.
 */
export const seedDamageReports = mutation({
  args: {
    ...bulkArgs,
    inventoryItemId: v.optional(v.id("inventoryItems")),
    typeId: v.optional(v.id("inventoryTypes")),
  },
  returns: v.object({
    inserted: v.number(),
    lastLabel: v.string(),
    inventoryItemId: v.id("inventoryItems"),
    typeId: v.id("inventoryTypes"),
    assetId: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const assetId = `E2E-BULK-${args.stamp}`;
    let typeId = args.typeId;
    let inventoryItemId = args.inventoryItemId;
    if (!typeId || !inventoryItemId) {
      typeId = await ctx.db.insert("inventoryTypes", {
        name: bulkLabel(args.stamp, 0),
        category: "misc",
        model: "E2E-BULK-1",
        manualUrls: [],
        capabilities: [],
        createdAt: now,
        updatedAt: now,
      });
      inventoryItemId = await ctx.db.insert("inventoryItems", {
        assetId,
        typeId,
        status: "needs_repair",
        createdAt: now,
        updatedAt: now,
      });
    }

    const rows = bulkRange(args.stamp, args.offset, args.count);
    for (const row of rows) {
      await ctx.db.insert("damageReports", {
        inventoryItemId,
        assetId,
        typeId,
        scope: "this_only",
        scopedItemIds: [inventoryItemId],
        operability: "needs_repair",
        severity: 3,
        notes: row.label,
        status: "open",
        reportedByUserId: "e2e-bulk-reporter",
        reportedAt: row.at,
        updatedAt: row.at,
      });
    }
    return {
      inserted: rows.length,
      lastLabel: rows[rows.length - 1]?.label ?? "",
      inventoryItemId,
      typeId,
      assetId,
    };
  },
});

const purgeTableValue = v.union(
  v.literal("events"),
  v.literal("invoices"),
  v.literal("shortLinks"),
  v.literal("marketingPosts"),
  v.literal("crewApplications"),
  v.literal("bandApplications"),
  v.literal("damageReports"),
  v.literal("inventoryItems"),
  v.literal("inventoryTypes"),
);

/** Field carrying the `E2E Bulk <stamp>` marker, per table. */
const purgeField = {
  events: "title",
  invoices: "managerName",
  shortLinks: "label",
  marketingPosts: "title",
  crewApplications: "name",
  bandApplications: "bandDisplayName",
  damageReports: "notes",
  inventoryItems: "assetId",
  inventoryTypes: "name",
} as const;

/**
 * Delete one bounded batch of a stamped bulk seed. Returns `remaining` so the
 * caller can loop; purging in one shot would risk the transaction size limit.
 */
export const purgeBulk = mutation({
  args: { stamp: v.string(), table: purgeTableValue, limit: v.optional(v.number()) },
  returns: v.object({ deleted: v.number(), remaining: v.number() }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const limit = Math.min(Math.max(args.limit ?? 200, 1), 500);
    // `inventoryItems` marks the batch with the raw stamp, not the bulk label.
    const marker =
      args.table === "inventoryItems" ? `E2E-BULK-${args.stamp}` : `E2E Bulk ${args.stamp} #`;
    const field = purgeField[args.table];
    const candidates = await ctx.db.query(args.table).take(PURGE_SCAN);
    const matches = candidates.filter((row) => {
      const value = (row as Record<string, unknown>)[field];
      return typeof value === "string" && value.includes(marker);
    });
    for (const row of matches.slice(0, limit)) {
      await ctx.db.delete(row._id as Id<"events">);
    }
    return {
      deleted: Math.min(matches.length, limit),
      remaining: Math.max(matches.length - limit, 0),
    };
  },
});
