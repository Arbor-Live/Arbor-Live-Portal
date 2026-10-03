import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

type AvailabilityResponse = Pick<Doc<"eventCrewAvailabilityResponses">, "userId" | "responseStatus">;

/** People who answered "only if necessary" for an event. */
export function backupUserIdsFrom(responses: AvailabilityResponse[]) {
  return new Set(
    responses
      .filter((response) => response.responseStatus === "only_if_necessary")
      .map((response) => response.userId),
  );
}

/** Backups for one event, for callers that haven't loaded its responses. */
export async function loadBackupUserIds(ctx: Pick<QueryCtx, "db">, eventId: Id<"events">) {
  const responses = await ctx.db
    .query("eventCrewAvailabilityResponses")
    .withIndex("by_eventId_and_responseStatus", (q) =>
      q.eq("eventId", eventId).eq("responseStatus", "only_if_necessary"),
    )
    .take(500);
  return backupUserIdsFrom(responses);
}
