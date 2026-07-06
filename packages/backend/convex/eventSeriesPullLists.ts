import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import {
  perOccurrencePullQuantity,
  resolveBillableOccurrenceCount,
} from "./lib/invoiceSeries";
import { shouldApplySeriesUpdate, type SeriesEditScope } from "./lib/eventSeriesGeneration";

const pullListLineKindValue = v.union(v.literal("type"), v.literal("package"));

const pullListSourceValue = v.union(
  v.literal("manual"),
  v.literal("invoice_package"),
  v.literal("invoice_type"),
);

const templateItemInput = v.object({
  id: v.optional(v.id("eventSeriesPullListItems")),
  lineKind: pullListLineKindValue,
  typeId: v.optional(v.id("inventoryTypes")),
  packageId: v.optional(v.id("inventoryPackages")),
  label: v.optional(v.string()),
  quantityRequired: v.number(),
  source: v.optional(pullListSourceValue),
  sourcePackageId: v.optional(v.id("inventoryPackages")),
  sourceInvoiceLineKey: v.optional(v.string()),
  sortOrder: v.number(),
  notes: v.optional(v.string()),
});

async function listTemplateItems(ctx: QueryCtx | MutationCtx, seriesId: Id<"eventSeries">) {
  const rows = await ctx.db
    .query("eventSeriesPullListItems")
    .withIndex("by_seriesId", (q) => q.eq("seriesId", seriesId))
    .take(500);
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}

async function listOccurrencesForSeries(ctx: MutationCtx, seriesId: Id<"eventSeries">) {
  const rows = await ctx.db
    .query("events")
    .withIndex("by_seriesId_and_occurrenceIndex", (q) => q.eq("seriesId", seriesId))
    .take(200);
  return rows.sort((a, b) => (a.occurrenceIndex ?? 0) - (b.occurrenceIndex ?? 0));
}

export const listBySeries = query({
  args: { seriesId: v.id("eventSeries") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await listTemplateItems(ctx, args.seriesId);
  },
});

export const scaffoldFromInvoice = mutation({
  args: {
    seriesId: v.id("eventSeries"),
    regenerateFuture: v.optional(v.boolean()),
    fromOccurrenceIndex: v.optional(v.number()),
    scope: v.optional(v.union(v.literal("future"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const series = await ctx.db.get(args.seriesId);
    if (!series) throw new Error("Event series not found.");
    if (!series.invoiceId) {
      throw new Error("Link an invoice to this series before scaffolding pull list templates.");
    }

    const lineItems = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", series.invoiceId!))
      .take(500);
    const equipmentLines = lineItems.filter(
      (line) => line.section === "equipment_package" || line.section === "equipment_type",
    );
    if (equipmentLines.length === 0) {
      throw new Error("Linked invoice has no equipment line items to scaffold.");
    }

    const billableOccurrenceCount = await resolveBillableOccurrenceCount(ctx, series.invoiceId);
    const now = Date.now();

    const existing = await listTemplateItems(ctx, args.seriesId);
    for (const row of existing) {
      if (row.source !== "manual") {
        await ctx.db.delete(row._id);
      }
    }
    const manualRows = existing.filter((row) => row.source === "manual");
    const maxSort = manualRows.reduce((max, row) => Math.max(max, row.sortOrder), -1);

    let sortOrder = maxSort + 1;
    const merged = new Map<string, {
      lineKind: "type" | "package";
      typeId?: Id<"inventoryTypes">;
      packageId?: Id<"inventoryPackages">;
      label: string;
      quantityRequired: number;
      source: "invoice_package" | "invoice_type";
      sourcePackageId?: Id<"inventoryPackages">;
      sourceInvoiceLineKey: string;
    }>();

    for (const line of equipmentLines) {
      const { qty, remainder } = perOccurrencePullQuantity(
        Math.max(0, line.quantity),
        line.equipmentQuantityBasis,
        billableOccurrenceCount,
      );
      if (qty <= 0) continue;
      if (remainder > 0 && line.equipmentQuantityBasis !== "per_occurrence") {
        // Uneven division — staff can adjust template qty; floor is applied.
      }

      if (line.section === "equipment_package" && line.packageId) {
        const pkg = await ctx.db.get(line.packageId);
        if (!pkg) continue;
        const key = `package:${line.packageId}`;
        const existingRow = merged.get(key);
        if (existingRow) {
          existingRow.quantityRequired += qty;
        } else {
          merged.set(key, {
            lineKind: "package",
            packageId: line.packageId,
            label: pkg.name,
            quantityRequired: qty,
            source: "invoice_package",
            sourcePackageId: line.packageId,
            sourceInvoiceLineKey: `pkg:${line._id}`,
          });
        }
      } else if (line.section === "equipment_type" && line.typeId) {
        const type = await ctx.db.get(line.typeId);
        if (!type) continue;
        const key = `type:${line.typeId}`;
        const existingRow = merged.get(key);
        if (existingRow) {
          existingRow.quantityRequired += qty;
        } else {
          merged.set(key, {
            lineKind: "type",
            typeId: line.typeId,
            label: type.name,
            quantityRequired: qty,
            source: "invoice_type",
            sourceInvoiceLineKey: `type:${line._id}`,
          });
        }
      }
    }

    for (const row of merged.values()) {
      if (row.lineKind === "package") {
        await ctx.db.insert("eventSeriesPullListItems", {
          seriesId: args.seriesId,
          lineKind: "package",
          packageId: row.packageId,
          label: row.label,
          quantityRequired: row.quantityRequired,
          source: row.source,
          sourcePackageId: row.sourcePackageId,
          sourceInvoiceLineKey: row.sourceInvoiceLineKey,
          sortOrder,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("eventSeriesPullListItems", {
          seriesId: args.seriesId,
          lineKind: "type",
          typeId: row.typeId,
          label: row.label,
          quantityRequired: row.quantityRequired,
          source: row.source,
          sourceInvoiceLineKey: row.sourceInvoiceLineKey,
          sortOrder,
          createdAt: now,
          updatedAt: now,
        });
      }
      sortOrder += 1;
    }

    if (args.regenerateFuture ?? true) {
      const scope = (args.scope ?? "all") as SeriesEditScope;
      const fromIndex = args.fromOccurrenceIndex ?? 0;
      await regenerateFuturePullLists(ctx, {
        seriesId: args.seriesId,
        scope,
        fromOccurrenceIndex: fromIndex,
        now,
      });
    }

    return { templateCount: merged.size };
  },
});

async function regenerateFuturePullLists(
  ctx: MutationCtx,
  args: {
    seriesId: Id<"eventSeries">;
    scope: SeriesEditScope;
    fromOccurrenceIndex: number;
    now: number;
  },
) {
  const templates = await listTemplateItems(ctx, args.seriesId);
  if (templates.length === 0) return { updatedCount: 0 };

  const occurrences = await listOccurrencesForSeries(ctx, args.seriesId);
  let updatedCount = 0;

  for (const occurrence of occurrences) {
    if (args.scope === "this") {
      if (occurrence.occurrenceIndex !== args.fromOccurrenceIndex) continue;
    } else if (
      !shouldApplySeriesUpdate(occurrence, args.scope, args.fromOccurrenceIndex, args.now)
    ) {
      continue;
    }
    if (occurrence.seriesDetached || occurrence.status === "cancelled") continue;

    const existing = await ctx.db
      .query("eventPullListItems")
      .withIndex("by_eventId", (q) => q.eq("eventId", occurrence._id))
      .take(500);
    for (const row of existing) {
      if (row.source !== "manual") {
        await ctx.db.delete(row._id);
      }
    }
    const manualRows = existing.filter((row) => row.source === "manual");
    let sortOrder = manualRows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;

    for (const template of templates) {
      if (template.lineKind === "package" && template.packageId) {
        await ctx.db.insert("eventPullListItems", {
          eventId: occurrence._id,
          lineKind: "package",
          packageId: template.packageId,
          label: template.label,
          quantityRequired: template.quantityRequired,
          quantityPulled: 0,
          quantityCheckedOut: 0,
          source: template.source,
          sourcePackageId: template.sourcePackageId,
          sourceInvoiceLineKey: template.sourceInvoiceLineKey,
          sortOrder,
          notes: template.notes,
          createdAt: args.now,
          updatedAt: args.now,
        });
      } else if (template.lineKind === "type" && template.typeId) {
        await ctx.db.insert("eventPullListItems", {
          eventId: occurrence._id,
          lineKind: "type",
          typeId: template.typeId,
          label: template.label,
          quantityRequired: template.quantityRequired,
          quantityPulled: 0,
          quantityCheckedOut: 0,
          source: template.source,
          sourceInvoiceLineKey: template.sourceInvoiceLineKey,
          sortOrder,
          notes: template.notes,
          createdAt: args.now,
          updatedAt: args.now,
        });
      }
      sortOrder += 1;
    }
    updatedCount += 1;
  }

  return { updatedCount };
}

export const regenerateFuturePullListsMutation = mutation({
  args: {
    seriesId: v.id("eventSeries"),
    scope: v.union(v.literal("future"), v.literal("all")),
    fromOccurrenceIndex: v.number(),
  },
  returns: v.object({ updatedCount: v.number() }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await regenerateFuturePullLists(ctx, {
      seriesId: args.seriesId,
      scope: args.scope,
      fromOccurrenceIndex: args.fromOccurrenceIndex,
      now: Date.now(),
    });
  },
});

export const pullListTemplatesFromOccurrence = mutation({
  args: {
    seriesId: v.id("eventSeries"),
    eventId: v.id("events"),
    includeInvoiceLines: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.seriesId !== args.seriesId) {
      throw new Error("Event is not part of this series.");
    }

    const items = await ctx.db
      .query("eventPullListItems")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const includeInvoice = args.includeInvoiceLines ?? false;
    const filtered = includeInvoice
      ? items
      : items.filter((row) => row.source === "manual");

    const now = Date.now();
    const existing = await listTemplateItems(ctx, args.seriesId);
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    let sortOrder = 0;
    for (const item of filtered.sort((a, b) => a.sortOrder - b.sortOrder)) {
      const lineKind = item.packageId ? ("package" as const) : ("type" as const);
      await ctx.db.insert("eventSeriesPullListItems", {
        seriesId: args.seriesId,
        lineKind,
        typeId: item.typeId,
        packageId: item.packageId,
        label: item.label,
        quantityRequired: item.quantityRequired,
        source: item.source,
        sourcePackageId: item.sourcePackageId,
        sourceInvoiceLineKey: item.sourceInvoiceLineKey,
        sortOrder,
        notes: item.notes,
        createdAt: now,
        updatedAt: now,
      });
      sortOrder += 1;
    }

    return { templateCount: filtered.length };
  },
});

export const upsertTemplateItems = mutation({
  args: {
    seriesId: v.id("eventSeries"),
    items: v.array(templateItemInput),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const series = await ctx.db.get(args.seriesId);
    if (!series) throw new Error("Event series not found.");

    const existing = await listTemplateItems(ctx, args.seriesId);
    const existingById = new Map(existing.map((row) => [row._id, row]));
    const keptIds = new Set<Id<"eventSeriesPullListItems">>();
    const now = Date.now();

    for (const item of args.items) {
      const quantityRequired = Math.max(0, Math.floor(item.quantityRequired));
      const source = item.source ?? "manual";
      const payload = {
        lineKind: item.lineKind,
        typeId: item.lineKind === "type" ? item.typeId : undefined,
        packageId: item.lineKind === "package" ? item.packageId : undefined,
        label: item.label?.trim() || "Item",
        quantityRequired,
        source,
        sourcePackageId: item.sourcePackageId,
        sourceInvoiceLineKey: item.sourceInvoiceLineKey,
        sortOrder: item.sortOrder,
        notes: item.notes?.trim() || undefined,
        updatedAt: now,
      };

      if (item.id && existingById.has(item.id)) {
        await ctx.db.patch(item.id, payload);
        keptIds.add(item.id);
      } else {
        const id = await ctx.db.insert("eventSeriesPullListItems", {
          seriesId: args.seriesId,
          ...payload,
          createdAt: now,
        });
        keptIds.add(id);
      }
    }

    for (const row of existing) {
      if (!keptIds.has(row._id)) {
        await ctx.db.delete(row._id);
      }
    }
  },
});
