import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Every act on the bill fills a lineup position (`eventArtistNeeds`), so the
 * bill has one kind of row. Acts added without one get a position here.
 */

const ROLE_LABELS: Record<Doc<"eventBandParticipations">["role"], string | undefined> = {
  headliner: "Headliner",
  support: "Support",
  other: undefined,
};

/** Create a position at the bottom of the bill for an act that has none, and link it. */
export async function ensureActPosition(
  ctx: MutationCtx,
  participationId: Id<"eventBandParticipations">,
) {
  const row = await ctx.db.get(participationId);
  if (!row || row.needId) return row?.needId ?? null;
  const [slots, profile] = await Promise.all([
    ctx.db
      .query("eventArtistNeeds")
      .withIndex("by_eventId", (q) => q.eq("eventId", row.eventId))
      .take(100),
    ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", row.organizationId))
      .unique(),
  ]);
  const now = Date.now();
  const lastOrder = slots.reduce(
    (max, slot) => Math.max(max, slot.sortOrder ?? slot.createdAt),
    Number.NEGATIVE_INFINITY,
  );
  const needId = await ctx.db.insert("eventArtistNeeds", {
    eventId: row.eventId,
    sortOrder: Number.isFinite(lastOrder) ? lastOrder + 1 : now,
    label: ROLE_LABELS[row.role],
    artistType:
      profile?.organizationType === "dj"
        ? "dj"
        : profile?.organizationType === "band"
          ? "band"
          : profile?.organizationType === "singer_songwriter"
            ? "singer_songwriter"
            : "no_preference",
    status: "open",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(participationId, { needId, updatedAt: now });
  return needId;
}

/**
 * An act leaving the bill hands its run-of-show times back to its position
 * (when the position has none), so the Run of Show keeps a placeholder.
 */
export async function returnActTimesToPosition(
  ctx: MutationCtx,
  row: Doc<"eventBandParticipations">,
) {
  if (!row.needId) return;
  const slot = await ctx.db.get(row.needId);
  if (!slot || slot.setStartsAt != null || slot.soundcheckStartsAt != null) return;
  const next: Doc<"eventArtistNeeds"> = { ...slot, updatedAt: Date.now() };
  if (row.setStartsAt != null && row.setEndsAt != null) {
    next.setStartsAt = row.setStartsAt;
    next.setEndsAt = row.setEndsAt;
  }
  if (row.soundcheckStartsAt != null && row.soundcheckEndsAt != null) {
    next.soundcheckStartsAt = row.soundcheckStartsAt;
    next.soundcheckEndsAt = row.soundcheckEndsAt;
  }
  await ctx.db.replace(slot._id, next);
}
