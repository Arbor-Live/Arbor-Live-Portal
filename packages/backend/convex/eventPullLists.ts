import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireArborInternalContext, requireAuth } from "./lib/auth";

const pullListLineKindValue = v.union(v.literal("type"), v.literal("package"));

const pullListSourceValue = v.union(
  v.literal("manual"),
  v.literal("invoice_package"),
  v.literal("invoice_type"),
);

const pullListItemInput = v.object({
  id: v.optional(v.id("eventPullListItems")),
  lineKind: pullListLineKindValue,
  typeId: v.optional(v.id("inventoryTypes")),
  packageId: v.optional(v.id("inventoryPackages")),
  label: v.optional(v.string()),
  quantityRequired: v.number(),
  quantityPulled: v.number(),
  quantityCheckedOut: v.number(),
  source: v.optional(pullListSourceValue),
  sourcePackageId: v.optional(v.id("inventoryPackages")),
  sourceInvoiceLineKey: v.optional(v.string()),
  sortOrder: v.number(),
  notes: v.optional(v.string()),
});

const RENTAL_EVENT_TYPES = new Set(["Dry Hire", "Dry Rental", "Rental with Crew"]);

function resolveLineKind(item: {
  lineKind?: "type" | "package";
  packageId?: Id<"inventoryPackages">;
  typeId?: Id<"inventoryTypes">;
}): "type" | "package" {
  if (item.lineKind) return item.lineKind;
  if (item.packageId) return "package";
  return "type";
}

function clampQuantity(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Math.floor(value)));
}

function summarizePullList(items: Doc<"eventPullListItems">[]) {
  const totalLines = items.length;
  const totalPieces = items.reduce((sum, item) => sum + item.quantityRequired, 0);
  return { totalLines, totalPieces };
}

async function loadPackageContents(ctx: QueryCtx | MutationCtx, packageId: Id<"inventoryPackages">) {
  const rows = await ctx.db
    .query("inventoryPackageItems")
    .withIndex("by_packageId", (q) => q.eq("packageId", packageId))
    .take(500);
  const contents = await Promise.all(
    rows.map(async (row) => {
      const type = await ctx.db.get(row.typeId);
      return {
        typeId: row.typeId,
        typeName: type?.name ?? "Unknown type",
        quantity: row.quantity,
      };
    }),
  );
  return contents.sort((a, b) => a.typeName.localeCompare(b.typeName));
}

export async function enrichPullListItems(ctx: QueryCtx | MutationCtx, items: Doc<"eventPullListItems">[]) {
  return Promise.all(
    items.map(async (item) => {
      const lineKind = resolveLineKind(item);
      if (lineKind === "package" && item.packageId) {
        const pkg = await ctx.db.get(item.packageId);
        const packageContents = await loadPackageContents(ctx, item.packageId);
        return {
          ...item,
          lineKind: "package" as const,
          packageName: pkg?.name ?? item.label,
          packageContents,
          typeCategory: "Packages",
        };
      }
      const type = item.typeId ? await ctx.db.get(item.typeId) : null;
      return {
        ...item,
        lineKind: "type" as const,
        typeName: type?.name ?? item.label,
        typeCategory: type?.category ?? "Other",
      };
    }),
  );
}

type ScaffoldRow =
  | {
      lineKind: "package";
      packageId: Id<"inventoryPackages">;
      label: string;
      quantityRequired: number;
      source: "invoice_package";
      sourcePackageId: Id<"inventoryPackages">;
      sourceInvoiceLineKey: string;
    }
  | {
      lineKind: "type";
      typeId: Id<"inventoryTypes">;
      label: string;
      quantityRequired: number;
      source: "invoice_type";
      sourceInvoiceLineKey: string;
    };

async function buildScaffoldRowsFromInvoice(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
): Promise<ScaffoldRow[]> {
  const lineItems = await ctx.db
    .query("invoiceLineItems")
    .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
    .take(500);

  const equipmentLines = lineItems.filter(
    (line) => line.section === "equipment_package" || line.section === "equipment_type",
  );
  if (equipmentLines.length === 0) return [];

  const merged = new Map<string, ScaffoldRow>();

  for (const line of equipmentLines) {
    if (line.section === "equipment_package" && line.packageId) {
      const pkg = await ctx.db.get(line.packageId);
      if (!pkg) continue;
      const quantityRequired = Math.max(0, line.quantity);
      if (quantityRequired <= 0) continue;
      const key = `package:${line.packageId}`;
      const existing = merged.get(key);
      if (existing && existing.lineKind === "package") {
        existing.quantityRequired += quantityRequired;
      } else {
        merged.set(key, {
          lineKind: "package",
          packageId: line.packageId,
          label: pkg.name,
          quantityRequired,
          source: "invoice_package",
          sourcePackageId: line.packageId,
          sourceInvoiceLineKey: `pkg:${line._id}`,
        });
      }
    } else if (line.section === "equipment_type" && line.typeId) {
      const type = await ctx.db.get(line.typeId);
      if (!type) continue;
      const quantityRequired = Math.max(0, line.quantity);
      if (quantityRequired <= 0) continue;
      const key = `type:${line.typeId}`;
      const existing = merged.get(key);
      if (existing && existing.lineKind === "type") {
        existing.quantityRequired += quantityRequired;
      } else {
        merged.set(key, {
          lineKind: "type",
          typeId: line.typeId,
          label: type.name,
          quantityRequired,
          source: "invoice_type",
          sourceInvoiceLineKey: `type:${line._id}`,
        });
      }
    }
  }

  return Array.from(merged.values());
}

async function validatePullListItemInput(
  ctx: MutationCtx,
  item: {
    lineKind: "type" | "package";
    typeId?: Id<"inventoryTypes">;
    packageId?: Id<"inventoryPackages">;
    label?: string;
    quantityRequired: number;
  },
) {
  const quantityRequired = Math.max(0, Math.floor(item.quantityRequired));
  if (item.lineKind === "package") {
    if (!item.packageId) throw new Error("Package lines require a package.");
    const pkg = await ctx.db.get(item.packageId);
    if (!pkg) throw new Error("Inventory package not found.");
    return {
      lineKind: "package" as const,
      packageId: item.packageId,
      typeId: undefined,
      label: item.label?.trim() || pkg.name,
      quantityRequired,
    };
  }
  if (!item.typeId) throw new Error("Type lines require an inventory type.");
  const type = await ctx.db.get(item.typeId);
  if (!type) throw new Error("Inventory type not found.");
  return {
    lineKind: "type" as const,
    typeId: item.typeId,
    packageId: undefined,
    label: item.label?.trim() || type.name,
    quantityRequired,
  };
}

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const items = await ctx.db
      .query("eventPullListItems")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const sorted = items.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
    return enrichPullListItems(ctx, sorted);
  },
});

export const upsertItems = mutation({
  args: {
    eventId: v.id("events"),
    items: v.array(pullListItemInput),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");

    const existing = await ctx.db
      .query("eventPullListItems")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const existingById = new Map(existing.map((row) => [row._id, row]));
    const keptIds = new Set<Id<"eventPullListItems">>();
    const now = Date.now();

    for (const item of args.items) {
      if (item.quantityRequired < 0) throw new Error("Quantity required cannot be negative.");
      const validated = await validatePullListItemInput(ctx, {
        lineKind: item.lineKind,
        typeId: item.typeId,
        packageId: item.packageId,
        label: item.label,
        quantityRequired: item.quantityRequired,
      });
      const source = item.source ?? "manual";

      const patch = {
        lineKind: validated.lineKind,
        typeId: validated.typeId,
        packageId: validated.packageId,
        label: validated.label,
        quantityRequired: validated.quantityRequired,
        quantityPulled: 0,
        quantityCheckedOut: 0,
        source,
        sourcePackageId: item.sourcePackageId,
        sourceInvoiceLineKey: item.sourceInvoiceLineKey,
        sortOrder: item.sortOrder,
        notes: item.notes?.trim() || undefined,
        updatedAt: now,
      };

      if (item.id && existingById.has(item.id)) {
        keptIds.add(item.id);
        await ctx.db.patch(item.id, patch);
        continue;
      }

      const id = await ctx.db.insert("eventPullListItems", {
        eventId: args.eventId,
        ...patch,
        createdAt: now,
      });
      keptIds.add(id);
    }

    for (const row of existing) {
      if (!keptIds.has(row._id)) {
        await ctx.db.delete(row._id);
      }
    }

    return summarizePullList(
      (
        await ctx.db
          .query("eventPullListItems")
          .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
          .take(500)
      ),
    );
  },
});

export const updateItemProgress = mutation({
  args: {
    id: v.id("eventPullListItems"),
    quantityPulled: v.optional(v.number()),
    quantityCheckedOut: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Pull list item not found.");
    await ctx.db.patch(args.id, {
      quantityPulled:
        args.quantityPulled !== undefined
          ? clampQuantity(args.quantityPulled, existing.quantityRequired)
          : existing.quantityPulled,
      quantityCheckedOut:
        args.quantityCheckedOut !== undefined
          ? clampQuantity(args.quantityCheckedOut, existing.quantityRequired)
          : existing.quantityCheckedOut,
      updatedAt: Date.now(),
    });
  },
});

export const addManualItem = mutation({
  args: {
    eventId: v.id("events"),
    typeId: v.id("inventoryTypes"),
    quantityRequired: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    const validated = await validatePullListItemInput(ctx, {
      lineKind: "type",
      typeId: args.typeId,
      quantityRequired: args.quantityRequired,
    });
    const existing = await ctx.db
      .query("eventPullListItems")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const maxSort = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1);
    const now = Date.now();
    return await ctx.db.insert("eventPullListItems", {
      eventId: args.eventId,
      lineKind: validated.lineKind,
      typeId: validated.typeId,
      packageId: validated.packageId,
      label: validated.label,
      quantityRequired: validated.quantityRequired,
      quantityPulled: 0,
      quantityCheckedOut: 0,
      source: "manual",
      sortOrder: maxSort + 1,
      notes: args.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const addManualPackage = mutation({
  args: {
    eventId: v.id("events"),
    packageId: v.id("inventoryPackages"),
    quantityRequired: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    const validated = await validatePullListItemInput(ctx, {
      lineKind: "package",
      packageId: args.packageId,
      quantityRequired: args.quantityRequired,
    });
    const existing = await ctx.db
      .query("eventPullListItems")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const maxSort = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1);
    const now = Date.now();
    return await ctx.db.insert("eventPullListItems", {
      eventId: args.eventId,
      lineKind: validated.lineKind,
      typeId: validated.typeId,
      packageId: validated.packageId,
      label: validated.label,
      quantityRequired: validated.quantityRequired,
      quantityPulled: 0,
      quantityCheckedOut: 0,
      source: "manual",
      sortOrder: maxSort + 1,
      notes: args.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const removeItem = mutation({
  args: { id: v.id("eventPullListItems") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Pull list item not found.");
    await ctx.db.delete(args.id);
  },
});

export const scaffoldFromInvoice = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    if (!event.invoiceId) throw new Error("Link an invoice to this event before scaffolding.");

    const scaffoldRows = await buildScaffoldRowsFromInvoice(ctx, event.invoiceId);
    if (scaffoldRows.length === 0) {
      throw new Error("Linked invoice has no equipment line items to scaffold.");
    }

    const existing = await ctx.db
      .query("eventPullListItems")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);

    for (const row of existing) {
      if (row.source !== "manual") {
        await ctx.db.delete(row._id);
      }
    }

    const manualRows = existing.filter((row) => row.source === "manual");
    const maxSort = manualRows.reduce((max, row) => Math.max(max, row.sortOrder), -1);
    const now = Date.now();

    let sortOrder = maxSort + 1;
    for (const row of scaffoldRows) {
      if (row.lineKind === "package") {
        await ctx.db.insert("eventPullListItems", {
          eventId: args.eventId,
          lineKind: "package",
          packageId: row.packageId,
          label: row.label,
          quantityRequired: row.quantityRequired,
          quantityPulled: 0,
          quantityCheckedOut: 0,
          source: row.source,
          sourcePackageId: row.sourcePackageId,
          sourceInvoiceLineKey: row.sourceInvoiceLineKey,
          sortOrder,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("eventPullListItems", {
          eventId: args.eventId,
          lineKind: "type",
          typeId: row.typeId,
          label: row.label,
          quantityRequired: row.quantityRequired,
          quantityPulled: 0,
          quantityCheckedOut: 0,
          source: row.source,
          sourceInvoiceLineKey: row.sourceInvoiceLineKey,
          sortOrder,
          createdAt: now,
          updatedAt: now,
        });
      }
      sortOrder += 1;
    }

    const items = await ctx.db
      .query("eventPullListItems")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    return {
      insertedCount: scaffoldRows.length,
      summary: summarizePullList(items),
    };
  },
});

export { summarizePullList, RENTAL_EVENT_TYPES };
