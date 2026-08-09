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
