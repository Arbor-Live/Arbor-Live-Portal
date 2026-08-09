import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Fold legacy flat lines + every single-option content unit into one included
 * unit (qty 1). Leaves exclusive units (2+ options) alone.
 */
export async function consolidatePackageIntoOneIncludedUnit(
  ctx: MutationCtx,
  packageId: Id<"inventoryPackages">,
  now: number,
) {
  const packageItems = await ctx.db
    .query("inventoryPackageItems")
    .withIndex("by_packageId", (q) => q.eq("packageId", packageId))
    .take(500);

  const groups = await ctx.db
    .query("inventoryPackageOptionGroups")
    .withIndex("by_packageId", (q) => q.eq("packageId", packageId))
    .take(100);

  type Collected = { typeId: Id<"inventoryTypes">; quantity: number };
  const collected: Collected[] = [];
  let deletedEmptyGroups = 0;
  let removedSimpleGroups = 0;

  for (const group of groups) {
    const options = await ctx.db
      .query("inventoryPackageOptions")
      .withIndex("by_optionGroupId", (q) => q.eq("optionGroupId", group._id))
      .take(40);

    const optionRows = [];
    for (const option of options) {
      const lines = packageItems.filter((row) => row.optionId === option._id);
      optionRows.push({ option, lines });
    }

    const nonEmptyOptions = optionRows.filter((row) => row.lines.length > 0);
    if (!nonEmptyOptions.length) {
      for (const row of optionRows) {
        await ctx.db.delete(row.option._id);
      }
      await ctx.db.delete(group._id);
      deletedEmptyGroups += 1;
      continue;
    }

    // Exclusive choice — leave intact.
    if (nonEmptyOptions.length > 1) {
      for (const row of optionRows) {
        if (row.lines.length === 0) {
          await ctx.db.delete(row.option._id);
        }
      }
      continue;
    }

    // Single-option included unit — fold into the shared included kit.
    const only = nonEmptyOptions[0]!;
    for (const line of only.lines) {
      collected.push({
        typeId: line.typeId,
        quantity: line.quantity * group.quantity,
      });
      await ctx.db.delete(line._id);
    }
    for (const row of optionRows) {
      await ctx.db.delete(row.option._id);
    }
    await ctx.db.delete(group._id);
    removedSimpleGroups += 1;
  }

  // Any remaining flat legacy rows.
  const remainingItems = await ctx.db
    .query("inventoryPackageItems")
    .withIndex("by_packageId", (q) => q.eq("packageId", packageId))
    .take(500);
  for (const row of remainingItems) {
    if (row.optionId) continue;
    collected.push({ typeId: row.typeId, quantity: row.quantity });
    await ctx.db.delete(row._id);
  }

  if (!collected.length) {
    return { changed: false, deletedEmptyGroups, removedSimpleGroups, lineCount: 0 };
  }

  // Merge duplicate types.
  const merged = new Map<Id<"inventoryTypes">, number>();
  for (const row of collected) {
    merged.set(row.typeId, (merged.get(row.typeId) ?? 0) + row.quantity);
  }
  const lines = Array.from(merged.entries()).map(([typeId, quantity]) => ({
    typeId,
    quantity,
  }));

  const remainingGroups = await ctx.db
    .query("inventoryPackageOptionGroups")
    .withIndex("by_packageId", (q) => q.eq("packageId", packageId))
    .take(100);
  const sortOrder = remainingGroups.reduce(
    (max, group) => Math.max(max, group.sortOrder + 1),
    0,
  );

  const optionGroupId = await ctx.db.insert("inventoryPackageOptionGroups", {
    packageId,
    quantity: 1,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  });
  const optionId = await ctx.db.insert("inventoryPackageOptions", {
    optionGroupId,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  });

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    await ctx.db.insert("inventoryPackageItems", {
      packageId,
      typeId: line.typeId,
      quantity: line.quantity,
      optionId,
      role: index === 0 ? "primary" : "accessory",
      sortOrder: index,
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    changed: true,
    deletedEmptyGroups,
    removedSimpleGroups,
    lineCount: lines.length,
  };
}
