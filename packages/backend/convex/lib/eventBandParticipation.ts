import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { scheduleBandAssignedEmails } from "../email/bandAssignmentEmails";
import { syncInvoiceLineForSlot } from "./artistLineSync";
import { inheritSlotTimes, syncNeedBlocks, syncParticipationBlocks } from "./runOfShow";
import { ensureActPosition } from "./actPositions";

/**
 * Drop an act's claim on a slot. Uses `replace` because Convex `patch` ignores
 * `undefined` and would leave `needId` in place.
 */
export async function unclaimSlot(
  ctx: MutationCtx,
  participationId: Id<"eventBandParticipations">,
) {
  const row = await ctx.db.get(participationId);
  if (!row || !row.needId) return;
  const next: Doc<"eventBandParticipations"> = { ...row, updatedAt: Date.now() };
  delete next.needId;
  await ctx.db.replace(participationId, next);
}

/**
 * Give `participationId` the slot, checking it belongs to the event and taking
 * it from anyone else. A slot holds exactly one act.
 */
export async function claimSlot(
  ctx: MutationCtx,
  args: {
    needId: Id<"eventArtistNeeds">;
    eventId: Id<"events">;
    participationId?: Id<"eventBandParticipations">;
  },
) {
  const slot = await ctx.db.get(args.needId);
  if (!slot || slot.eventId !== args.eventId) {
    throw new Error("Slot not found on this event.");
  }
  if (slot.externalArtistName?.trim()) {
    throw new Error("This position is filled by an outside artist.");
  }
  const rivals = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_needId", (q) => q.eq("needId", args.needId))
    .take(100);
  for (const rival of rivals) {
    if (rival._id === args.participationId) continue;
    await unclaimSlot(ctx, rival._id);
  }
}

export async function upsertEventBandParticipation(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    organizationId: string;
    role: "headliner" | "support" | "other";
    /** Slot this act fills, when booked from an `eventArtistNeeds` row. */
    needId?: Id<"eventArtistNeeds">;
  },
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_eventId_and_organizationId", (q) =>
      q.eq("eventId", args.eventId).eq("organizationId", args.organizationId),
    )
    .unique();
  if (args.needId) {
    await claimSlot(ctx, {
      needId: args.needId,
      eventId: args.eventId,
      participationId: existing?._id,
    });
  }
  if (existing) {
    await ctx.db.patch(existing._id, {
      role: args.role,
      ...(args.needId ? { needId: args.needId } : {}),
      updatedAt: now,
    });
    if (args.needId) {
      // Filling a position hands its run-of-show times to the act (when the act
      // has none) and retires the position's own blocks; a position this act
      // left gets its own times back.
      await inheritSlotTimes(ctx, existing._id, args.needId);
      await syncParticipationBlocks(ctx, existing._id);
      await syncNeedBlocks(ctx, args.needId);
      if (existing.needId && existing.needId !== args.needId) {
        await syncNeedBlocks(ctx, existing.needId);
      }
      await syncInvoiceLineForSlot(ctx, args.needId, now);
    } else {
      await ensureActPosition(ctx, existing._id);
    }
    return existing._id;
  }
  const participationId = await ctx.db.insert("eventBandParticipations", {
    eventId: args.eventId,
    organizationId: args.organizationId,
    role: args.role,
    needId: args.needId,
    createdAt: now,
    updatedAt: now,
  });
  if (args.needId) {
    await inheritSlotTimes(ctx, participationId, args.needId);
    await syncParticipationBlocks(ctx, participationId);
    await syncNeedBlocks(ctx, args.needId);
    await syncInvoiceLineForSlot(ctx, args.needId, now);
  } else {
    await ensureActPosition(ctx, participationId);
  }
  await scheduleBandAssignedEmails(ctx, {
    eventId: args.eventId,
    organizationId: args.organizationId,
    role: args.role,
  });
  return participationId;
}
