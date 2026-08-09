import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type PackageBomLine = {
  typeId: Id<"inventoryTypes">;
  quantity: number;
};

/**
 * Resolve package BOM lines used by quotes, pull lists, and fulfillment.
 *
 * - Legacy always-included rows (`optionId` unset): quantity as stored.
 * - Content units with exactly one option: include that option's lines × unit qty.
 * - Exclusive units (2+ options): omitted until booking-time selection (#116).
 */
export async function listFulfillmentPackageBom(
  ctx: QueryCtx | MutationCtx,
  packageId: Id<"inventoryPackages">,
): Promise<PackageBomLine[]> {
  const items = await ctx.db
    .query("inventoryPackageItems")
    .withIndex("by_packageId", (q) => q.eq("packageId", packageId))
    .take(500);

  const groups = await ctx.db
    .query("inventoryPackageOptionGroups")
    .withIndex("by_packageId", (q) => q.eq("packageId", packageId))
    .take(40);

  const singleOptionScale = new Map<Id<"inventoryPackageOptions">, number>();
  const exclusiveOptionIds = new Set<Id<"inventoryPackageOptions">>();

  for (const group of groups) {
    const options = await ctx.db
      .query("inventoryPackageOptions")
      .withIndex("by_optionGroupId", (q) => q.eq("optionGroupId", group._id))
      .take(40);
    if (options.length === 1) {
      singleOptionScale.set(options[0]!._id, group.quantity);
    } else {
      for (const option of options) {
        exclusiveOptionIds.add(option._id);
      }
    }
  }

  const merged = new Map<Id<"inventoryTypes">, number>();
  for (const item of items) {
    let quantity = 0;
    if (!item.optionId) {
      quantity = item.quantity;
    } else if (exclusiveOptionIds.has(item.optionId)) {
      continue;
    } else {
      const scale = singleOptionScale.get(item.optionId);
      if (scale === undefined) continue;
      quantity = item.quantity * scale;
    }
    if (quantity <= 0) continue;
    merged.set(item.typeId, (merged.get(item.typeId) ?? 0) + quantity);
  }

  return Array.from(merged.entries()).map(([typeId, quantity]) => ({ typeId, quantity }));
}

export function isLegacyFixedPackageBomLine(item: {
  optionId?: Id<"inventoryPackageOptions">;
}) {
  return item.optionId === undefined;
}

type EstimateRateType = {
  subsidizedRentalPriceUsd?: number | null;
  nonSubsidizedRentalPriceUsd?: number | null;
  rentalPriceUsd?: number | null;
} | null;

type EstimateContentUnit = {
  quantity: number;
  options: Array<{
    items: Array<{
      quantity: number;
      type: EstimateRateType;
    }>;
  }>;
};

function optionRentalTotals(
  items: Array<{ quantity: number; type: EstimateRateType }>,
  unitQuantity: number,
) {
  let subsidized = 0;
  let nonSubsidized = 0;
  for (const item of items) {
    const qty = item.quantity * unitQuantity;
    if (qty <= 0) continue;
    subsidized += (item.type?.subsidizedRentalPriceUsd ?? 0) * qty;
    nonSubsidized +=
      (item.type?.nonSubsidizedRentalPriceUsd ?? item.type?.rentalPriceUsd ?? 0) * qty;
  }
  return { subsidized, nonSubsidized };
}

/**
 * Package card / suggested-price estimate.
 *
 * Included units (1 option) contribute every BOM line × unit qty.
 * Exclusive units (2+ options) contribute the **highest-cost** alternative
 * (by non-subsidized total), so estimates stay useful before booking selection.
 * Quotes / pull lists still use `listFulfillmentPackageBom` and omit exclusives.
 */
export function estimatePackageRentalValueFromContents(contents: EstimateContentUnit[]) {
  let estimatedRentalValueUsd = 0;
  let estimatedSubsidizedRentalValueUsd = 0;

  for (const unit of contents) {
    const scale = unit.quantity > 0 ? unit.quantity : 1;
    if (unit.options.length === 0) continue;

    if (unit.options.length === 1) {
      const totals = optionRentalTotals(unit.options[0]!.items, scale);
      estimatedRentalValueUsd += totals.nonSubsidized;
      estimatedSubsidizedRentalValueUsd += totals.subsidized;
      continue;
    }

    let best = optionRentalTotals(unit.options[0]!.items, scale);
    for (let i = 1; i < unit.options.length; i += 1) {
      const totals = optionRentalTotals(unit.options[i]!.items, scale);
      if (totals.nonSubsidized > best.nonSubsidized) best = totals;
    }
    estimatedRentalValueUsd += best.nonSubsidized;
    estimatedSubsidizedRentalValueUsd += best.subsidized;
  }

  return { estimatedRentalValueUsd, estimatedSubsidizedRentalValueUsd };
}

export type HydratedContentUnit = {
  _id: Id<"inventoryPackageOptionGroups">;
  quantity: number;
  sortOrder: number;
  exclusive: boolean;
  options: Array<{
    _id: Id<"inventoryPackageOptions">;
    name: string;
    sortOrder: number;
    items: Array<{
      _id: Id<"inventoryPackageItems">;
      typeId: Id<"inventoryTypes">;
      quantity: number;
      role: "primary" | "accessory";
      sortOrder: number;
      type: Doc<"inventoryTypes"> | null;
    }>;
  }>;
};
