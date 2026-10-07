import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { resolveUserStatus, type UserStatus } from "./userStatus";

/**
 * Fail loudly rather than silently truncating once the roster is implausibly
 * large. A silent cap here would drop people from availability, digest, or
 * directory scans without telling anyone (see AGENTS.md, "Numbers and limits").
 * One bounded read, not a cursor loop: a query/mutation may only run a single
 * paginated query, and these helpers run inside ones that page other data.
 */
const MAX_ADMIN_PROFILES = 5_000;

/**
 * Every `userAdminProfiles` row, or a loud failure past the cap. Prefer this
 * over a bare `.take(N)` so a growing roster (alumni are retained, never
 * deleted) can never silently drop people from a scan.
 */
export async function loadAllAdminProfiles(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"userAdminProfiles">[]> {
  const rows = await ctx.db.query("userAdminProfiles").take(MAX_ADMIN_PROFILES + 1);
  if (rows.length > MAX_ADMIN_PROFILES) {
    throw new Error(
      `userAdminProfiles exceeded ${MAX_ADMIN_PROFILES} rows; refusing to return a partial list.`,
    );
  }
  return rows;
}

/**
 * `userAdminProfiles` rows whose `status` is one of `statuses`, read through
 * the `by_status` index instead of scanning the whole table. One bounded read
 * per status, with the same loud cap as `loadAllAdminProfiles`.
 *
 * Rows with no stored `status` predate `backfillUserProfileStatus`; they are
 * read too and classified with `resolveUserStatus`, exactly as the rest of the
 * app does, so a deployment that hasn't run the migration loses no one.
 */
export async function loadAdminProfilesByStatus(
  ctx: QueryCtx | MutationCtx,
  statuses: readonly UserStatus[],
): Promise<Doc<"userAdminProfiles">[]> {
  const rows: Doc<"userAdminProfiles">[] = [];
  for (const status of new Set(statuses)) {
    const matching = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_status", (q) => q.eq("status", status))
      .take(MAX_ADMIN_PROFILES + 1);
    if (matching.length > MAX_ADMIN_PROFILES) {
      throw new Error(
        `userAdminProfiles with status ${status} exceeded ${MAX_ADMIN_PROFILES} rows; refusing to return a partial list.`,
      );
    }
    rows.push(...matching);
  }
  const wanted = new Set<UserStatus>(statuses);
  const unset = await ctx.db
    .query("userAdminProfiles")
    .withIndex("by_status", (q) => q.eq("status", undefined))
    .take(MAX_ADMIN_PROFILES + 1);
  if (unset.length > MAX_ADMIN_PROFILES) {
    throw new Error(
      `userAdminProfiles without a status exceeded ${MAX_ADMIN_PROFILES} rows; refusing to return a partial list.`,
    );
  }
  rows.push(...unset.filter((row) => wanted.has(resolveUserStatus(row))));
  return rows;
}
