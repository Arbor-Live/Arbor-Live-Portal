import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  assetIdLookupCandidates,
  normalizeAssetScanInput,
  parseAssetScanInput,
} from "./assetScan";
import { isShortLinkExpired } from "./shortLinks";
import { normalizeShortLinkSlug } from "./shortLinkSlug";

export type OutboundStatus = Doc<"eventRentalUnits">["outboundStatus"];
export type ReturnStatus = NonNullable<Doc<"eventRentalUnits">["returnStatus"]>;

export async function requireEvent(ctx: QueryCtx | MutationCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  if (!event) throw new Error("Event not found.");
  return event;
}

async function findItemByAssetIdCandidates(
  ctx: QueryCtx | MutationCtx,
  assetId: string,
): Promise<Doc<"inventoryItems"> | null> {
  for (const candidate of assetIdLookupCandidates(assetId)) {
    const item = await ctx.db
      .query("inventoryItems")
      .withIndex("by_assetId", (q) => q.eq("assetId", candidate))
      .unique();
    if (item) return item;
  }
  return null;
}

async function resolveViaShortLinkSlug(
  ctx: QueryCtx | MutationCtx,
  slug: string,
): Promise<Doc<"inventoryItems"> | null> {
  let normalizedSlug: string;
  try {
    normalizedSlug = normalizeShortLinkSlug(slug);
  } catch {
    return null;
  }
  const link = await ctx.db
    .query("shortLinks")
    .withIndex("by_slug", (q) => q.eq("slug", normalizedSlug))
    .unique();
  if (!link || isShortLinkExpired(link)) return null;
  const destinationAssetId = normalizeAssetScanInput(link.destinationUrl);
  if (!destinationAssetId) return null;
  return await findItemByAssetIdCandidates(ctx, destinationAssetId);
}

export async function resolveInventoryItemByScan(
  ctx: QueryCtx | MutationCtx,
  raw: string,
): Promise<Doc<"inventoryItems"> | null> {
  const parsed = parseAssetScanInput(raw);

  if (parsed.assetId) {
    const direct = await findItemByAssetIdCandidates(ctx, parsed.assetId);
    if (direct) return direct;

    // Some QRs encode arbor.st/e/{slug} where {slug} is a short-link override.
    const viaEmbeddedSlug = await resolveViaShortLinkSlug(ctx, parsed.assetId);
    if (viaEmbeddedSlug) return viaEmbeddedSlug;
  }

  if (parsed.shortLinkSlug) {
    const viaShort = await resolveViaShortLinkSlug(ctx, parsed.shortLinkSlug);
    if (viaShort) return viaShort;
  }

  return null;
}

/** Root asset plus every nested contained asset (BFS). Always includes the root. */
export async function listItemWithDescendants(
  ctx: QueryCtx | MutationCtx,
  rootId: Id<"inventoryItems">,
  limit = 500,
): Promise<Doc<"inventoryItems">[]> {
  const root = await ctx.db.get(rootId);
  if (!root) return [];

  const results: Doc<"inventoryItems">[] = [root];
  const queue: Id<"inventoryItems">[] = [rootId];
  const seen = new Set<string>([rootId]);

  while (queue.length > 0 && results.length < limit) {
    const currentId = queue.shift()!;
    const children = await ctx.db
      .query("inventoryItems")
      .withIndex("by_containedInAssetId", (q) => q.eq("containedInAssetId", currentId))
      .take(Math.min(200, limit - results.length));
    for (const child of children) {
      if (seen.has(child._id)) continue;
      seen.add(child._id);
      results.push(child);
      queue.push(child._id);
      if (results.length >= limit) break;
    }
  }

  return results;
}

export async function getActiveFulfillment(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  direction: "outbound" | "return",
) {
  const rows = await ctx.db
    .query("eventRentalFulfillments")
    .withIndex("by_eventId_and_direction", (q) =>
      q.eq("eventId", eventId).eq("direction", direction),
    )
    .take(20);
  return rows.find((row) => row.status === "in_progress") ?? null;
}

export async function getLatestCompletedOutbound(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
) {
  const rows = await ctx.db
    .query("eventRentalFulfillments")
    .withIndex("by_eventId_and_direction", (q) =>
      q.eq("eventId", eventId).eq("direction", "outbound"),
    )
    .take(50);
  const completed = rows
    .filter((row) => row.status === "completed")
    .sort((a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt));
  return completed[0] ?? null;
}

export async function listUnitsForFulfillment(
  ctx: QueryCtx | MutationCtx,
  fulfillmentId: Id<"eventRentalFulfillments">,
) {
  return await ctx.db
    .query("eventRentalUnits")
    .withIndex("by_fulfillmentId", (q) => q.eq("fulfillmentId", fulfillmentId))
    .take(2000);
}

export async function listUnitsForEvent(ctx: QueryCtx | MutationCtx, eventId: Id<"events">) {
  return await ctx.db
    .query("eventRentalUnits")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(2000);
}

export async function typeLabel(
  ctx: QueryCtx | MutationCtx,
  typeId: Id<"inventoryTypes"> | undefined,
  fallback: string,
) {
  if (!typeId) return fallback;
  const type = await ctx.db.get(typeId);
  return type?.name ?? fallback;
}

/** Human-readable scan target, e.g. "QuikPunch (127)". */
export async function formatScannedAssetLabel(
  ctx: QueryCtx | MutationCtx,
  item: Doc<"inventoryItems">,
) {
  const name = await typeLabel(ctx, item.typeId, item.assetId);
  if (name === item.assetId) return item.assetId;
  return `${name} (${item.assetId})`;
}

export function withContentsSuffix(label: string, includesContents: boolean) {
  return includesContents ? `${label} and its contents` : label;
}

export async function expandPullListNeeds(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
): Promise<
  Array<{
    pullListItemId: Id<"eventPullListItems">;
    typeId: Id<"inventoryTypes">;
    label: string;
    quantity: number;
  }>
> {
  const lines = await ctx.db
    .query("eventPullListItems")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(500);

  const needs: Array<{
    pullListItemId: Id<"eventPullListItems">;
    typeId: Id<"inventoryTypes">;
    label: string;
    quantity: number;
  }> = [];

  for (const line of lines) {
    const lineKind = line.lineKind ?? (line.packageId ? "package" : "type");
    if (lineKind === "type") {
      if (!line.typeId) continue;
      needs.push({
        pullListItemId: line._id,
        typeId: line.typeId,
        label: line.label,
        quantity: Math.max(0, Math.floor(line.quantityRequired)),
      });
      continue;
    }
    if (!line.packageId) continue;
    const packageItems = await ctx.db
      .query("inventoryPackageItems")
      .withIndex("by_packageId", (q) => q.eq("packageId", line.packageId!))
      .take(500);
    for (const pkgItem of packageItems) {
      const type = await ctx.db.get(pkgItem.typeId);
      needs.push({
        pullListItemId: line._id,
        typeId: pkgItem.typeId,
        label: type?.name ?? line.label,
        quantity: Math.max(0, Math.floor(line.quantityRequired) * Math.max(0, pkgItem.quantity)),
      });
    }
  }

  return needs;
}

export function isActiveRentedOutbound(status: OutboundStatus) {
  return status === "scanned" || status === "replace" || status === "no_tag";
}

export async function resolveInvoiceIdForEvent(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
): Promise<Id<"invoices"> | null> {
  if (event.invoiceId) return event.invoiceId;
  if (!event.seriesId) return null;
  const series = await ctx.db.get(event.seriesId);
  return series?.invoiceId ?? null;
}

/** Client notify target for rental outbound/return emails (invoice clientEmail only). */
export async function getClientEmailForEvent(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
): Promise<{ email: string; name?: string } | null> {
  const invoiceId = await resolveInvoiceIdForEvent(ctx, event);
  if (!invoiceId) return null;
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice?.clientEmail?.trim()) return null;
  return {
    email: invoice.clientEmail.trim(),
    name: invoice.clientContactName?.trim() || undefined,
  };
}

export function missingClientEmailWarning(kind: "outbound" | "return") {
  const label = kind === "outbound" ? "delivery" : "return";
  return `No invoice client email found for this ${label} notification. Link an invoice with a client email, then resend.`;
}

export async function syncPullListProgressFromUnits(
  ctx: MutationCtx,
  eventId: Id<"events">,
  units: Doc<"eventRentalUnits">[],
) {
  const lines = await ctx.db
    .query("eventPullListItems")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(500);

  const now = Date.now();
  for (const line of lines) {
    const lineUnits = units.filter((unit) => unit.pullListItemId === line._id);
    const quantityPulled = lineUnits.filter((unit) => unit.outboundStatus !== "pending").length;
    const quantityCheckedOut = lineUnits.filter((unit) =>
      isActiveRentedOutbound(unit.outboundStatus),
    ).length;
    await ctx.db.patch(line._id, {
      quantityPulled,
      quantityCheckedOut,
      updatedAt: now,
    });
  }
}
