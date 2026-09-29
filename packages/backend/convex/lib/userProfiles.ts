import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const PROFILE_PAGE_SIZE = 500;
/**
 * Fail loudly rather than silently truncating once the roster is implausibly
 * large. A silent cap here would drop people from availability, digest, or
 * directory scans without telling anyone (see AGENTS.md, "Numbers and limits").
 */
const MAX_ADMIN_PROFILES = 20_000;

/**
 * Every `userAdminProfiles` row, paged to completion. Prefer this over a bare
 * `.take(N)` so a growing roster (alumni are retained, never deleted) can never
 * silently drop people from an unbounded-population scan.
 */
export async function loadAllAdminProfiles(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"userAdminProfiles">[]> {
  const rows: Doc<"userAdminProfiles">[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await ctx.db
      .query("userAdminProfiles")
      .paginate({ cursor, numItems: PROFILE_PAGE_SIZE });
    rows.push(...page.page);
    if (rows.length > MAX_ADMIN_PROFILES) {
      throw new Error(
        `userAdminProfiles exceeded ${MAX_ADMIN_PROFILES} rows; refusing to scan partially.`,
      );
    }
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  return rows;
}

