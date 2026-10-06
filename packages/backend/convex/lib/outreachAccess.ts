import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireOperationsAccess } from "./auth";

/**
 * Booking acts (Open Positions, artist outreach) is Operations' job: admins and
 * the Operations team, in Arbor Live's context. Crew can see the artist
 * directory but not these.
 */
export async function requireOutreachAccess(ctx: QueryCtx | MutationCtx) {
  return await requireOperationsAccess(ctx);
}
