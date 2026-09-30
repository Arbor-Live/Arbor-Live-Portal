import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Crew invites reuse one UID per person/event, so calendar clients only apply a
 * re-sent invite as an update when its SEQUENCE is higher (RFC 5546). Bump the
 * event's counter on every crew change and stamp that run's invites with it.
 */
export async function bumpCrewInviteSequence(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<number> {
  const event = await ctx.db.get(eventId);
  const sequence = (event?.crewInviteSequence ?? 0) + 1;
  await ctx.db.patch(eventId, { crewInviteSequence: sequence });
  return sequence;
}
