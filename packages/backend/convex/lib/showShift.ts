import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * The crews who work the show itself — shifts linked to a `show` section block.
 * Setup/strike-only crew are deliberately excluded: media requests and the crew
 * media board only concern people who were on the show.
 *
 * Shifts with no `scheduleBlockId` are not show shifts (they cannot be proven
 * to be on the show), so they are excluded too.
 */
export async function listShowShifts(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
): Promise<Array<Doc<"eventCrewShifts">>> {
  const blocks = await ctx.db
    .query("eventScheduleBlocks")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(500);
  const showBlockIds = new Set(
    blocks.filter((block) => block.blockType === "show").map((block) => block._id),
  );
  if (showBlockIds.size === 0) return [];

  const shifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(500);
  return shifts.filter(
    (shift) => shift.scheduleBlockId && showBlockIds.has(shift.scheduleBlockId),
  );
}
