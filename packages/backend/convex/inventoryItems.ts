import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuth } from "./lib/auth";
import { assetIdLookupCandidates } from "./lib/assetScan";
import { resolveInventoryItemByScan } from "./lib/rentalFulfillment";

const MAX_LIST_LIMIT = 2000;
const MAX_ASSET_ID_LIMIT = 5000;
const MAX_BATCH_ITEMS = 200;

async function cascadeLocationToDescendants(
  ctx: MutationCtx,
  rootItemId: Id<"inventoryItems">,
  storageLocationId: Id<"storageLocations"> | undefined,
) {
  const queue: Id<"inventoryItems">[] = [rootItemId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = await ctx.db
      .query("inventoryItems")
      .withIndex("by_containedInAssetId", (q) => q.eq("containedInAssetId", currentId))
      .collect();

    for (const child of children) {
      await ctx.db.patch(child._id, {
        storageLocationId,
        updatedAt: Date.now(),
      });
      queue.push(child._id);
    }
  }
}

/**
 * List hydration: type + location + parent container only.
 * Do not fan out a per-row `by_containedInAssetId` query — that was O(page)
 * Database I/O on every inventory list subscription. Children are derived on
 * the client from `listSummaries` (which includes `containedInAssetId`).
 */
async function hydrateInventoryItems(ctx: QueryCtx, items: Doc<"inventoryItems">[]) {
  const typeIds = Array.from(new Set(items.map((item) => item.typeId)));
  const locationIds = Array.from(
    new Set(
      items
        .map((item) => item.storageLocationId)
        .filter((id): id is Id<"storageLocations"> => Boolean(id)),
    ),
  );
  const containerIds = Array.from(
    new Set(
      items
        .map((item) => item.containedInAssetId)
        .filter((id): id is Id<"inventoryItems"> => Boolean(id)),
    ),
  );

  const [types, locations, containers] = await Promise.all([
    Promise.all(typeIds.map((id) => ctx.db.get(id))),
    Promise.all(locationIds.map((id) => ctx.db.get(id))),
    Promise.all(containerIds.map((id) => ctx.db.get(id))),
  ]);

  const typeById = new Map(typeIds.map((id, index) => [id, types[index] ?? null]));
  const locationById = new Map(locationIds.map((id, index) => [id, locations[index] ?? null]));
  const containerById = new Map(containerIds.map((id, index) => [id, containers[index] ?? null]));

  return items.map((item) => ({
    ...item,
    type: typeById.get(item.typeId) ?? null,
    location: item.storageLocationId ? (locationById.get(item.storageLocationId) ?? null) : null,
    containedInAsset: item.containedInAssetId
      ? (containerById.get(item.containedInAssetId) ?? null)
      : null,
    containedAssets: [] as Doc<"inventoryItems">[],
  }));
}

function matchesInventoryFilters(
  item: {
    assetId: string;
    serialNumber?: string;
    type: { category: string; model: string; name: string } | null;
  },
  args: { category?: string; search?: string },
) {
  if (!item.type) return false;
  if (args.category && item.type.category !== args.category) return false;
  const loweredSearch = args.search?.trim().toLowerCase();
  if (!loweredSearch) return true;
  return (
    item.assetId.toLowerCase().includes(loweredSearch) ||
    (item.serialNumber ?? "").toLowerCase().includes(loweredSearch) ||
    item.type.model.toLowerCase().includes(loweredSearch) ||
    item.type.name.toLowerCase().includes(loweredSearch)
  );
}

/**
 * Paginated inventory list for the items manager.
 *
 * Category/search cannot use an items-table index (category lives on the type;
 * search spans assetId, serial, and type fields). Filtering the paginated page
 * hid newer rows — same failure inventoryTypes.list had. Filtered reads scan a
 * bounded window, filter with light type lookups, then hydrate only the matches
 * (type/location/parent — not per-row children). Unfiltered reads still paginate.
 */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    category: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const hasInMemoryFilter =
      Boolean(args.search?.trim()) || Boolean(args.category);

    if (hasInMemoryFilter) {
      const candidates = await ctx.db.query("inventoryItems").take(MAX_LIST_LIMIT);
      const typeIds = Array.from(new Set(candidates.map((item) => item.typeId)));
      const types = await Promise.all(typeIds.map((id) => ctx.db.get(id)));
      const typeById = new Map(typeIds.map((id, index) => [id, types[index] ?? null]));

      const matched = candidates
        .filter((item) =>
          matchesInventoryFilters(
            { ...item, type: typeById.get(item.typeId) ?? null },
            args,
          ),
        )
        .sort((a, b) => a.assetId.localeCompare(b.assetId));

      const page = await hydrateInventoryItems(ctx, matched);
      return { page, isDone: true, continueCursor: "" };
    }

    const result = await ctx.db.query("inventoryItems").paginate(args.paginationOpts);
    const hydrated = await hydrateInventoryItems(ctx, result.page);
    const page = hydrated
      .filter((item) => matchesInventoryFilters(item, args))
      .sort((a, b) => a.assetId.localeCompare(b.assetId));
    return { ...result, page };
  },
});

/**
 * Light rows for pickers/filters (packages manager). Bounded — not a full catalog dump.
 */
export const listSummaries = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const limit = Math.min(Math.max(args.limit ?? 1000, 1), MAX_LIST_LIMIT);
    const items = await ctx.db.query("inventoryItems").take(limit);
    const typeIds = Array.from(new Set(items.map((item) => item.typeId)));
    const types = await Promise.all(typeIds.map((id) => ctx.db.get(id)));
    const typeById = new Map(typeIds.map((id, index) => [id, types[index] ?? null]));

    return items
      .map((item) => ({
        _id: item._id,
        assetId: item.assetId,
        typeId: item.typeId,
        containedInAssetId: item.containedInAssetId,
        type: typeById.get(item.typeId) ?? null,
      }))
      .sort((a, b) => a.assetId.localeCompare(b.assetId));
  },
});

/** Cheap assetId → id map for CSV import / duplicate checks. */
export const listAssetIds = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const limit = Math.min(Math.max(args.limit ?? MAX_ASSET_ID_LIMIT, 1), MAX_ASSET_ID_LIMIT);
    const items = await ctx.db.query("inventoryItems").take(limit);
    return items.map((item) => ({
      _id: item._id,
      assetId: item.assetId,
    }));
  },
});

export const create = mutation({
  args: {
    assetId: v.string(),
    serialNumber: v.optional(v.string()),
    typeId: v.id("inventoryTypes"),
    storageLocationId: v.optional(v.id("storageLocations")),
    containedInAssetId: v.optional(v.id("inventoryItems")),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existingAsset = await ctx.db
      .query("inventoryItems")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId.trim()))
      .unique();
    if (existingAsset) throw new Error("Asset ID already exists.");

    const type = await ctx.db.get(args.typeId);
    if (!type) throw new Error("Inventory type not found.");

    if (args.storageLocationId) {
      const location = await ctx.db.get(args.storageLocationId);
      if (!location) throw new Error("Storage location not found.");
    }
    let inheritedContainerLocationId: Id<"storageLocations"> | undefined;
    if (args.containedInAssetId) {
      const container = await ctx.db.get(args.containedInAssetId);
      if (!container) throw new Error("Container asset not found.");
      inheritedContainerLocationId = container.storageLocationId;
    }
    const effectiveStorageLocationId = inheritedContainerLocationId ?? args.storageLocationId;

    const now = Date.now();
    return await ctx.db.insert("inventoryItems", {
      assetId: args.assetId.trim(),
      serialNumber: args.serialNumber?.trim(),
      typeId: args.typeId,
      storageLocationId: effectiveStorageLocationId,
      containedInAssetId: args.containedInAssetId,
      status: args.status?.trim(),
      notes: args.notes?.trim(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Create multiple inventory items of one type in a single atomic mutation
 * (create-asset wizard). Containment is referenced by assetId so sibling tags
 * can nest inside each other before any of them exist in the DB.
 *
 * Each item may declare its container either directly (`containedInAssetId`) or
 * via `contains` on another item; both express the same relationship and must
 * agree. Containers/children may be items being created in this batch or
 * existing items (resolved through the same scan candidates as the scanner).
 * Cycles and "one container per child" conflicts are rejected up front.
 */
export const createMany = mutation({
  args: {
    typeId: v.id("inventoryTypes"),
    items: v.array(
      v.object({
        assetId: v.string(),
        serialNumber: v.optional(v.string()),
        storageLocationId: v.optional(v.id("storageLocations")),
        containedInAssetId: v.optional(v.string()),
        status: v.optional(v.string()),
        notes: v.optional(v.string()),
        contains: v.optional(v.array(v.string())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (args.items.length === 0) return { created: 0 };
    if (args.items.length > MAX_BATCH_ITEMS) {
      throw new Error(`Cannot create more than ${MAX_BATCH_ITEMS} items at once.`);
    }
    const type = await ctx.db.get(args.typeId);
    if (!type) throw new Error("Inventory type not found.");

    // 1. Validate fields, reject duplicate assetIds within the batch and in the DB.
    const normalizedItems = args.items.map((item) => ({
      ...item,
      assetId: item.assetId.trim(),
      serialNumber: item.serialNumber?.trim(),
      status: item.status?.trim(),
      notes: item.notes?.trim(),
    }));
    const seen = new Set<string>();
    for (const item of normalizedItems) {
      if (!item.assetId) throw new Error("Asset ID is required.");
      const key = item.assetId.toLowerCase();
      if (seen.has(key)) throw new Error(`Duplicate asset ID in batch: ${item.assetId}`);
      seen.add(key);
      if (item.storageLocationId) {
        const location = await ctx.db.get(item.storageLocationId);
        if (!location) throw new Error("Storage location not found.");
      }
      const existing = await ctx.db
        .query("inventoryItems")
        .withIndex("by_assetId", (q) => q.eq("assetId", item.assetId))
        .unique();
      if (existing) throw new Error(`Asset ID already exists: ${item.assetId}`);
    }

    // 2. Insert all items without containment, remembering in-batch ids.
    const now = Date.now();
    const idByAssetId = new Map<string, Id<"inventoryItems">>();
    const inBatchIds = new Set<Id<"inventoryItems">>();
    const ownLocationById = new Map<Id<"inventoryItems">, Id<"storageLocations"> | undefined>();
    for (const item of normalizedItems) {
      const id = await ctx.db.insert("inventoryItems", {
        assetId: item.assetId,
        serialNumber: item.serialNumber,
        typeId: args.typeId,
        storageLocationId: item.storageLocationId,
        containedInAssetId: undefined,
        status: item.status,
        notes: item.notes,
        createdAt: now,
        updatedAt: now,
      });
      idByAssetId.set(item.assetId.toLowerCase(), id);
      ownLocationById.set(id, item.storageLocationId);
      inBatchIds.add(id);
    }

    // 3. Collapse containment declarations into a single child → container map.
    const childKeyToContainerKey = new Map<string, string>();
    const setEdge = (childRaw: string, containerRaw: string) => {
      const child = childRaw.trim();
      const container = containerRaw.trim();
      if (!child || !container) return;
      if (child.toLowerCase() === container.toLowerCase()) {
        throw new Error("An asset cannot contain itself.");
      }
      const previous = childKeyToContainerKey.get(child.toLowerCase());
      if (previous && previous !== container.toLowerCase()) {
        throw new Error(`Asset "${child}" is assigned to two containers.`);
      }
      childKeyToContainerKey.set(child.toLowerCase(), container.toLowerCase());
    };
    for (const item of normalizedItems) {
      if (item.containedInAssetId) setEdge(item.assetId, item.containedInAssetId);
      for (const childRef of item.contains ?? []) setEdge(childRef, item.assetId);
    }

    // 4. Resolve every edge to an _id (in-batch first, then existing items).
    const existingByKey = new Map<string, Doc<"inventoryItems"> | null>();
    const findExisting = async (raw: string): Promise<Doc<"inventoryItems"> | null> => {
      for (const candidate of assetIdLookupCandidates(raw)) {
        const key = candidate.toLowerCase();
        const cached = existingByKey.get(key);
        if (cached !== undefined) {
          if (cached) return cached;
        } else {
          const found = await ctx.db
            .query("inventoryItems")
            .withIndex("by_assetId", (q) => q.eq("assetId", candidate))
            .unique();
          existingByKey.set(key, found ?? null);
          if (found) return found;
        }
      }
      return null;
    };
    const resolvedEdges: { childId: Id<"inventoryItems">; containerId: Id<"inventoryItems"> }[] =
      [];
    for (const [childKey, containerKey] of childKeyToContainerKey) {
      const childId = idByAssetId.get(childKey) ?? (await findExisting(childKey))?._id;
      const containerId =
        idByAssetId.get(containerKey) ?? (await findExisting(containerKey))?._id;
      if (!childId) throw new Error(`Referenced asset not found: ${childKey}`);
      if (!containerId) throw new Error(`Container asset not found: ${containerKey}`);
      resolvedEdges.push({ childId, containerId });
    }

    // 5. Cycle check — following parent pointers upward from a container must
    //    never reach the child being nested inside it.
    const containerIdByChildId = new Map<Id<"inventoryItems">, Id<"inventoryItems">>();
    for (const edge of resolvedEdges) containerIdByChildId.set(edge.childId, edge.containerId);
    for (const edge of resolvedEdges) {
      let pointer: Id<"inventoryItems"> | undefined = edge.containerId;
      let hops = 0;
      while (pointer) {
        if (pointer === edge.childId) throw new Error("Cannot create cyclical asset containment.");
        if (++hops > MAX_BATCH_ITEMS) throw new Error("Cannot create cyclical asset containment.");
        const next: Id<"inventoryItems"> | undefined =
          containerIdByChildId.get(pointer) ?? (await ctx.db.get(pointer))?.containedInAssetId;
        pointer = next;
      }
    }

    // 6. Effective storage location: a contained item inherits its container's
    //    location (same semantics as create/update), following chains in-batch
    //    and across existing items.
    const finalLocationMemo = new Map<Id<"inventoryItems">, Id<"storageLocations"> | undefined>();
    const finalLocation = async (
      id: Id<"inventoryItems">,
    ): Promise<Id<"storageLocations"> | undefined> => {
      const cached = finalLocationMemo.get(id);
      if (cached !== undefined) return cached;
      finalLocationMemo.set(id, undefined);
      const containerId = containerIdByChildId.get(id);
      let location: Id<"storageLocations"> | undefined;
      if (containerId) {
        location = await finalLocation(containerId);
      } else if (inBatchIds.has(id)) {
        location = ownLocationById.get(id);
      } else {
        const doc = await ctx.db.get(id);
        location = doc?.containedInAssetId
          ? await finalLocation(doc.containedInAssetId)
          : doc?.storageLocationId;
      }
      finalLocationMemo.set(id, location);
      return location;
    };

    // 7. Apply containment + effective locations to every item touched.
    for (const item of normalizedItems) {
      const id = idByAssetId.get(item.assetId.toLowerCase())!;
      await ctx.db.patch(id, {
        containedInAssetId: containerIdByChildId.get(id),
        storageLocationId: await finalLocation(id),
        updatedAt: Date.now(),
      });
    }
    for (const edge of resolvedEdges) {
      if (inBatchIds.has(edge.childId)) continue;
      await ctx.db.patch(edge.childId, {
        containedInAssetId: edge.containerId,
        storageLocationId: await finalLocation(edge.childId),
        updatedAt: Date.now(),
      });
    }

    // 8. Propagate locations to descendants of everything we re-parented.
    const cascadeTargets = new Set<Id<"inventoryItems">>();
    for (const edge of resolvedEdges) {
      cascadeTargets.add(edge.childId);
      cascadeTargets.add(edge.containerId);
    }
    for (const id of cascadeTargets) {
      await cascadeLocationToDescendants(ctx, id, await finalLocation(id));
    }

    return { created: normalizedItems.length };
  },
});

export const update = mutation({
  args: {
    id: v.id("inventoryItems"),
    assetId: v.string(),
    serialNumber: v.optional(v.string()),
    typeId: v.id("inventoryTypes"),
    storageLocationId: v.optional(v.id("storageLocations")),
    containedInAssetId: v.optional(v.id("inventoryItems")),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Inventory item not found.");

    const duplicateAsset = await ctx.db
      .query("inventoryItems")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId.trim()))
      .unique();
    if (duplicateAsset && duplicateAsset._id !== args.id) {
      throw new Error("Asset ID already exists.");
    }

    const type = await ctx.db.get(args.typeId);
    if (!type) throw new Error("Inventory type not found.");

    if (args.storageLocationId) {
      const location = await ctx.db.get(args.storageLocationId);
      if (!location) throw new Error("Storage location not found.");
    }
    if (args.containedInAssetId === args.id) {
      throw new Error("Asset cannot contain itself.");
    }
    let inheritedContainerLocationId: Id<"storageLocations"> | undefined;
    if (args.containedInAssetId) {
      const container = await ctx.db.get(args.containedInAssetId);
      if (!container) throw new Error("Container asset not found.");
      inheritedContainerLocationId = container.storageLocationId;
      let pointer: Id<"inventoryItems"> | undefined = args.containedInAssetId;
      while (pointer) {
        if (pointer === args.id) {
          throw new Error("Cannot create cyclical asset containment.");
        }
        const next: Doc<"inventoryItems"> | null = await ctx.db.get(pointer);
        pointer = next?.containedInAssetId;
      }
    }
    const effectiveStorageLocationId = inheritedContainerLocationId ?? args.storageLocationId;

    await ctx.db.patch(args.id, {
      assetId: args.assetId.trim(),
      serialNumber: args.serialNumber?.trim(),
      typeId: args.typeId,
      storageLocationId: effectiveStorageLocationId,
      containedInAssetId: args.containedInAssetId,
      status: args.status?.trim(),
      notes: args.notes?.trim(),
      updatedAt: Date.now(),
    });

    await cascadeLocationToDescendants(ctx, args.id, effectiveStorageLocationId);
  },
});

export const remove = mutation({
  args: { id: v.id("inventoryItems") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Inventory item not found.");
    const children = await ctx.db
      .query("inventoryItems")
      .withIndex("by_containedInAssetId", (q) => q.eq("containedInAssetId", args.id))
      .first();
    if (children) throw new Error("Cannot delete an asset that contains other assets.");
    await ctx.db.delete(args.id);
  },
});

export const setContainer = mutation({
  args: {
    id: v.id("inventoryItems"),
    containedInAssetId: v.optional(v.id("inventoryItems")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Inventory item not found.");
    if (args.containedInAssetId === args.id) {
      throw new Error("Asset cannot contain itself.");
    }
    let inheritedContainerLocationId: Id<"storageLocations"> | undefined;
    if (args.containedInAssetId) {
      const container = await ctx.db.get(args.containedInAssetId);
      if (!container) throw new Error("Container asset not found.");
      inheritedContainerLocationId = container.storageLocationId;
      let pointer: Id<"inventoryItems"> | undefined = args.containedInAssetId;
      while (pointer) {
        if (pointer === args.id) {
          throw new Error("Cannot create cyclical asset containment.");
        }
        const next: Doc<"inventoryItems"> | null = await ctx.db.get(pointer);
        pointer = next?.containedInAssetId;
      }
    }
    await ctx.db.patch(args.id, {
      containedInAssetId: args.containedInAssetId,
      storageLocationId: inheritedContainerLocationId ?? existing.storageLocationId,
      updatedAt: Date.now(),
    });

    await cascadeLocationToDescendants(
      ctx,
      args.id,
      inheritedContainerLocationId ?? existing.storageLocationId,
    );
  },
});

/**
 * Replace the full set of assets contained inside `containerId` (the "Contains"
 * editor). Removed children are un-nested but keep their location; added
 * children inherit the container's location. Cycle-safe like update/setContainer.
 */
export const replaceContainedAssets = mutation({
  args: {
    containerId: v.id("inventoryItems"),
    childIds: v.array(v.id("inventoryItems")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const container = await ctx.db.get(args.containerId);
    if (!container) throw new Error("Inventory item not found.");

    const childIds = Array.from(new Set(args.childIds));
    if (childIds.includes(args.containerId)) throw new Error("An asset cannot contain itself.");

    for (const childId of childIds) {
      const child = await ctx.db.get(childId);
      if (!child) throw new Error("Inventory item not found.");
    }

    const currentChildren = await ctx.db
      .query("inventoryItems")
      .withIndex("by_containedInAssetId", (q) => q.eq("containedInAssetId", args.containerId))
      .take(MAX_BATCH_ITEMS);
    const currentIds = new Set(currentChildren.map((child) => child._id));

    for (const child of currentChildren) {
      if (childIds.includes(child._id)) continue;
      await ctx.db.patch(child._id, {
        containedInAssetId: undefined,
        updatedAt: Date.now(),
      });
      await cascadeLocationToDescendants(ctx, child._id, child.storageLocationId);
    }

    for (const childId of childIds) {
      if (currentIds.has(childId)) continue;
      let pointer: Id<"inventoryItems"> | undefined = container.containedInAssetId;
      let hops = 0;
      while (pointer) {
        if (pointer === childId) throw new Error("Cannot create cyclical asset containment.");
        if (++hops > MAX_BATCH_ITEMS) throw new Error("Cannot create cyclical asset containment.");
        const next = await ctx.db.get(pointer);
        pointer = next?.containedInAssetId;
      }
      await ctx.db.patch(childId, {
        containedInAssetId: args.containerId,
        storageLocationId: container.storageLocationId,
        updatedAt: Date.now(),
      });
      await cascadeLocationToDescendants(ctx, childId, container.storageLocationId);
    }
  },
});

/**
 * Direct children of a container, hydrated with type/location (Contains editor).
 * Bounded like listSummaries.
 */
export const getChildren = query({
  args: { id: v.id("inventoryItems") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const children = await ctx.db
      .query("inventoryItems")
      .withIndex("by_containedInAssetId", (q) => q.eq("containedInAssetId", args.id))
      .take(MAX_LIST_LIMIT);
    return hydrateInventoryItems(ctx, children).then((rows) =>
      rows.sort((a, b) => a.assetId.localeCompare(b.assetId)),
    );
  },
});

/**
 * Resolve a scanned / typed asset tag to an existing inventory item so the
 * items table can scroll to and select it. Reuses the full scan resolution
 * (bare tags, arbor.st/e/…, short links).
 */
export const resolveByScan = query({
  args: { raw: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("inventoryItems"),
      assetId: v.string(),
      serialNumber: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const item = await resolveInventoryItemByScan(ctx, args.raw);
    if (!item) return null;
    return { _id: item._id, assetId: item.assetId, serialNumber: item.serialNumber };
  },
});
