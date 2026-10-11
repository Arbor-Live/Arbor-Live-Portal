import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Where a unit is in its life. Absent on a row means `active`. `in_repair`
 * is still owned and on the books but can't go out; `retired` has left
 * service, with the reason on `retirement`.
 */
export const inventoryLifecycleValue = v.union(
  v.literal("active"),
  v.literal("in_repair"),
  v.literal("retired"),
);
export type InventoryLifecycle = Infer<typeof inventoryLifecycleValue>;

/**
 * Why a unit left service. The first three may come back (found, recovered,
 * back from the vendor); the rest are gone for good. Any of them can be
 * reinstated, since a wrong retirement must be undoable.
 */
export const retirementReasonValue = v.union(
  v.literal("lost"),
  v.literal("stolen"),
  v.literal("rma"),
  v.literal("decommissioned"),
  v.literal("beyond_repair"),
  v.literal("sold"),
  v.literal("donated"),
  v.literal("parted_out"),
  v.literal("disposed"),
  v.literal("duplicate"),
  v.literal("other"),
);
export type RetirementReason = Infer<typeof retirementReasonValue>;

export const retirementValue = v.object({
  reason: retirementReasonValue,
  retiredAt: v.number(),
  retiredByUserId: v.string(),
  notes: v.optional(v.string()),
  /** The damage report that ended it (beyond repair). */
  damageReportId: v.optional(v.id("damageReports")),
  /** The unit that took its place: an RMA swap, or the real record for a duplicate. */
  replacementItemId: v.optional(v.id("inventoryItems")),
  /** Buyer, recipient or vendor. */
  counterparty: v.optional(v.string()),
  /** Sale price. */
  amountUsd: v.optional(v.number()),
});

export const itemHistoryKindValue = v.union(
  v.literal("retired"),
  v.literal("reinstated"),
  v.literal("retagged"),
  v.literal("repair_started"),
  v.literal("repair_finished"),
);

export function lifecycleOf(item: Pick<Doc<"inventoryItems">, "lifecycle">): InventoryLifecycle {
  return item.lifecycle ?? "active";
}

export function isRetired(item: Pick<Doc<"inventoryItems">, "lifecycle">) {
  return lifecycleOf(item) === "retired";
}

/** Lowercase words the full-text index matches: tags (current and old), serial, type. */
export function buildItemSearchText(
  item: Pick<Doc<"inventoryItems">, "assetId" | "serialNumber">,
  type: Pick<Doc<"inventoryTypes">, "name" | "model" | "manufacturer" | "category"> | null,
  previousAssetIds: string[],
): string {
  const tags = [item.assetId, ...previousAssetIds].filter((tag): tag is string => Boolean(tag));
  // Numeric tags are stored bare ("41") but printed "ALE-0041". Index the
  // padded number, not "ale", which every numeric tag would share.
  const printed = tags
    .filter((tag) => /^\d{1,3}$/.test(tag))
    .map((tag) => tag.padStart(4, "0"));
  return [...tags, ...printed, item.serialNumber, type?.manufacturer, type?.name, type?.model, type?.category]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .toLowerCase();
}

export async function listPreviousAssetIds(
  ctx: QueryCtx | MutationCtx,
  inventoryItemId: Id<"inventoryItems">,
): Promise<string[]> {
  const aliases = await ctx.db
    .query("inventoryAssetIdAliases")
    .withIndex("by_inventoryItemId", (q) => q.eq("inventoryItemId", inventoryItemId))
    .take(50);
  return aliases.map((alias) => alias.assetId);
}

/** Recompute an item's search text after its tag, serial, type or aliases change. */
export async function refreshItemSearchText(ctx: MutationCtx, inventoryItemId: Id<"inventoryItems">) {
  const item = await ctx.db.get(inventoryItemId);
  if (!item) return;
  const [type, previous] = await Promise.all([
    ctx.db.get(item.typeId),
    listPreviousAssetIds(ctx, inventoryItemId),
  ]);
  const searchText = buildItemSearchText(item, type, previous);
  if (searchText !== item.searchText) await ctx.db.patch(item._id, { searchText });
}

/** Keep `openDamageCount` in step with the item's open and in-progress reports. */
export async function adjustOpenDamageCount(
  ctx: MutationCtx,
  inventoryItemId: Id<"inventoryItems">,
  delta: number,
) {
  const item = await ctx.db.get(inventoryItemId);
  if (!item) return;
  await ctx.db.patch(item._id, { openDamageCount: Math.max(0, (item.openDamageCount ?? 0) + delta) });
}

export async function recordItemHistory(
  ctx: MutationCtx,
  entry: Omit<Doc<"inventoryItemHistory">, "_id" | "_creationTime">,
) {
  await ctx.db.insert("inventoryItemHistory", entry);
}

export type RetireDetails = {
  reason: RetirementReason;
  notes?: string;
  damageReportId?: Id<"damageReports">;
  replacementItemId?: Id<"inventoryItems">;
  counterparty?: string;
  amountUsd?: number;
};

/**
 * Take one unit out of service. It leaves whatever case it was in, and its
 * open damage reports are resolved: nobody is going to repair a unit that's
 * gone. Contents are the caller's call (see `inventoryLifecycle.retire`);
 * `keepContainer` leaves a unit retired along with its case inside it.
 */
export async function retireItemRecord(
  ctx: MutationCtx,
  item: Doc<"inventoryItems">,
  details: RetireDetails,
  actorUserId: string,
  now: number,
  options: { keepContainer?: boolean } = {},
) {
  await ctx.db.patch(item._id, {
    lifecycle: "retired",
    retirement: {
      reason: details.reason,
      retiredAt: now,
      retiredByUserId: actorUserId,
      notes: details.notes,
      damageReportId: details.damageReportId,
      replacementItemId: details.replacementItemId,
      counterparty: details.counterparty,
      amountUsd: details.amountUsd,
    },
    containedInAssetId: options.keepContainer ? item.containedInAssetId : undefined,
    openDamageCount: 0,
    updatedAt: now,
  });
  const reports = await ctx.db
    .query("damageReports")
    .withIndex("by_inventoryItemId", (q) => q.eq("inventoryItemId", item._id))
    .take(200);
  for (const report of reports) {
    if (report.status === "resolved") continue;
    await ctx.db.patch(report._id, { status: "resolved", updatedAt: now, resolvedAt: now });
  }
  await recordItemHistory(ctx, {
    inventoryItemId: item._id,
    kind: "retired",
    reason: details.reason,
    notes: details.notes,
    damageReportId: details.damageReportId,
    actorUserId,
    at: now,
  });
}
