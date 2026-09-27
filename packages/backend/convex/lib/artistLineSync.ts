import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { resolveBandName } from "./bandIdentity";

/**
 * Mirror a position's fill state onto the invoice line that opened it. The
 * invoice stays the source of truth for billing; this only keeps its line in
 * step, so filling a position fills the line rather than adding another.
 */
export async function syncInvoiceLineForSlot(
  ctx: MutationCtx,
  needId: Id<"eventArtistNeeds">,
  now: number,
) {
  const line = await ctx.db
    .query("invoiceLineItems")
    .withIndex("by_needId", (q) => q.eq("needId", needId))
    .first();
  if (!line) return;

  const slot = await ctx.db.get(needId);
  if (!slot) return;

  const participation = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_needId", (q) => q.eq("needId", needId))
    .first();

  const externalName = slot.externalArtistName?.trim();
  const organizationId = participation?.organizationId;
  const label = participation
    ? await resolveBandName(ctx, participation.organizationId)
    : externalName || slot.label?.trim() || line.label;

  if (line.organizationId === organizationId && line.label === label) return;

  // `patch` ignores `undefined`, so clearing the org needs `replace`.
  const next: Doc<"invoiceLineItems"> = { ...line, label, updatedAt: now };
  if (organizationId) next.organizationId = organizationId;
  else delete next.organizationId;
  await ctx.db.replace(line._id, next);
}

/** Drop a removed position's claim on its line, and its inquiries with it. */
export async function releaseSlotFromInvoice(ctx: MutationCtx, needId: Id<"eventArtistNeeds">) {
  const line = await ctx.db
    .query("invoiceLineItems")
    .withIndex("by_needId", (q) => q.eq("needId", needId))
    .first();
  if (!line) return;
  const next: Doc<"invoiceLineItems"> = { ...line, updatedAt: Date.now() };
  delete next.needId;
  await ctx.db.replace(line._id, next);
}
