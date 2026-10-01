import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Bound on shifts scanned for one user (mirrors `myEventActions`). */
const USER_SHIFT_SCAN_CAP = 500;

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

/**
 * The user's show shifts across events, from the crew side. Same rule as
 * `listShowShifts`: a shift counts only when linked to a `show` block.
 */
export async function listUserShowShifts(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<Array<Doc<"eventCrewShifts">>> {
  const shifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_userId_and_startsAt", (q) => q.eq("userId", userId))
    .take(USER_SHIFT_SCAN_CAP);

  const blockIds = [
    ...new Set(
      shifts
        .map((shift) => shift.scheduleBlockId)
        .filter((id): id is Id<"eventScheduleBlocks"> => Boolean(id)),
    ),
  ];
  const showBlockIds = new Set<Id<"eventScheduleBlocks">>();
  for (const blockId of blockIds) {
    const block = await ctx.db.get(blockId);
    if (block?.blockType === "show") showBlockIds.add(blockId);
  }

  return shifts.filter(
    (shift) => shift.scheduleBlockId && showBlockIds.has(shift.scheduleBlockId),
  );
}

/** Whether the user worked the event's show shift. */
export async function userWorkedShowShift(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  userId: string,
): Promise<boolean> {
  return (await listShowShifts(ctx, eventId)).some((shift) => shift.userId === userId);
}
