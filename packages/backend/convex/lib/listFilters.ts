import { v } from "convex/values";

/**
 * A filter-bar chip (`components/filter-bar.tsx` in the web app) as a query
 * argument: the row matches when any of `values` applies (`is`) or none does
 * (`is_not`). An empty `values` list means the chip isn't set yet and matches
 * everything.
 */
export const listFilter = v.optional(
  v.object({
    operator: v.union(v.literal("is"), v.literal("is_not")),
    values: v.array(v.string()),
  }),
);

export type ListFilter = { operator: "is" | "is_not"; values: string[] };

export function isActiveFilter(filter: ListFilter | undefined): filter is ListFilter {
  return Boolean(filter?.values.length);
}

/** `candidates` is the row's value, or several (tags, capabilities). */
export function matchesListFilter(filter: ListFilter | undefined, candidates: string[]) {
  if (!isActiveFilter(filter)) return true;
  const hit = candidates.some((candidate) => filter.values.includes(candidate));
  return filter.operator === "is" ? hit : !hit;
}

/**
 * How many rows a filtered list scans per page. Filters that no index serves
 * run in memory over a window of the table; each page scans the next window on
 * the client's cursor, so large tables page on with Load more instead of being
 * cut off at the window.
 */
export const FILTER_SCAN_WINDOW = 2000;
