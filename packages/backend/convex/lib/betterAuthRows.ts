import { components } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Drain every page of a Better Auth model rather than reading a single fixed
 * page. The previous single-page reads silently truncated once an org grew past
 * the page size (e.g. users beyond 1000 vanished from admin lists); looping the
 * cursor keeps these admin-only reads complete. `maxPages` is a runaway
 * guard: past it we throw instead of returning a partial list as if it
 * were complete.
 */
export async function fetchAllBetterAuthRows<T>(
  ctx: QueryCtx | MutationCtx,
  model: "user" | "organization" | "invitation",
  pageSize: number,
  maxPages = 50,
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model,
      paginationOpts: { cursor, numItems: pageSize },
    });
    rows.push(...((result?.page ?? []) as T[]));
    if (result?.isDone || !result?.continueCursor) return rows;
    cursor = result.continueCursor as string;
  }
  throw new Error(
    `Better Auth ${model} list exceeded ${maxPages} pages of ${pageSize} (got ${rows.length} rows). Refusing a partial result.`,
  );
}
