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

/**
 * Drop a removed position's claim on its line. The line remembers the removal
 * (`positionRemoved`), so the next invoice save doesn't open the position again.
 */
export async function releaseSlotFromInvoice(ctx: MutationCtx, needId: Id<"eventArtistNeeds">) {
  const line = await ctx.db
    .query("invoiceLineItems")
    .withIndex("by_needId", (q) => q.eq("needId", needId))
    .first();
  if (!line) return;
  const next: Doc<"invoiceLineItems"> = { ...line, positionRemoved: true, updatedAt: Date.now() };
  delete next.needId;
  await ctx.db.replace(line._id, next);
}

/** A position on the line's day that no other line stands for yet. */
export type AdoptablePosition = {
  needId: Id<"eventArtistNeeds">;
  label?: string;
  /** The platform act seated on it, if any. */
  seatedOrganizationId?: string;
  /** An outside act named on it. */
  externalArtistName?: string;
  sortOrder: number;
};

function normalizeLabel(label: string | undefined) {
  return label?.trim().toLowerCase() ?? "";
}

/**
 * The existing position an unlinked artist line should stand for, so a line
 * fills the bill the event already has rather than adding to it.
 *
 * `exact` matches only the same act, or the same name on a position no other
 * act holds. Otherwise the first empty position on the bill is taken.
 */
export function pickPositionForLine(
  line: { label: string; organizationId?: string },
  candidates: readonly AdoptablePosition[],
  exact: boolean,
): AdoptablePosition | undefined {
  const organizationId = line.organizationId?.trim() || undefined;
  const ordered = [...candidates].sort((a, b) => a.sortOrder - b.sortOrder);
  const empty = (slot: AdoptablePosition) =>
    !slot.seatedOrganizationId && !slot.externalArtistName?.trim();
  if (exact) {
    if (organizationId) {
      const seated = ordered.find((slot) => slot.seatedOrganizationId === organizationId);
      if (seated) return seated;
    }
    const label = normalizeLabel(line.label);
    if (!label) return undefined;
    return ordered.find(
      (slot) =>
        (empty(slot) && normalizeLabel(slot.label) === label) ||
        (!organizationId && normalizeLabel(slot.externalArtistName) === label),
    );
  }
  return ordered.find(empty);
}
