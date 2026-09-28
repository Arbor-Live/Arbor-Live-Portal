import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { releaseSlotFromInvoice } from "./artistLineSync";
import { unclaimSlot } from "./eventBandParticipation";
import { deleteActBlocks } from "./runOfShow";

/**
 * Deletes a position with its inquiries and blocks; a seated act is unlinked,
 * not removed (it keeps its run-of-show on the act row).
 *
 * Lives in its own module so apply/regenerate paths can reuse it without
 * pulling the position-row cleanup into the schema's import graph.
 */
export async function removePositionRow(ctx: MutationCtx, needId: Id<"eventArtistNeeds">) {
  const slot = await ctx.db.get(needId);
  if (!slot) return;
  // Bounded on purpose: a position sees a handful of inquiries, and any
  // straggler past this is inert once its slot is gone.
  const inquiries = await ctx.db
    .query("eventArtistInquiries")
    .withIndex("by_needId", (q) => q.eq("needId", slot._id))
    .take(200);
  for (const inquiry of inquiries) {
    await ctx.db.delete(inquiry._id);
  }
  // Unlink any act that was booked against this slot rather than orphaning it.
  const filled = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_needId", (q) => q.eq("needId", slot._id))
    .take(100);
  for (const row of filled) {
    await unclaimSlot(ctx, row._id);
  }
  await releaseSlotFromInvoice(ctx, slot._id);
  await ctx.db.delete(slot._id);
  await deleteActBlocks(ctx, { needId: slot._id });
}
