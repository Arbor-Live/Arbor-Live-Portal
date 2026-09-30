/**
 * Filter-bar state (see `components/filter-bar.tsx`), kept free of React so it
 * can be tested and shared. Each chip matches rows where any of its values
 * applies (`is`) or none does (`is_not`). The server-side twin is
 * `packages/backend/convex/lib/listFilters.ts`.
 */

export type FilterOperator = "is" | "is_not";

export type FilterOption = { value: string; label: string; description?: string };

export type FilterDefinition = {
  id: string;
  label: string;
  options: FilterOption[];
  /** One value at a time (yes/no style filters); the chip closes on pick. */
  single?: boolean;
  /** Offer "is not". On by default for multi-value filters. */
  negatable?: boolean;
};

export type FilterValue = { operator: FilterOperator; values: string[] };

export type FilterState = Record<string, FilterValue>;

/** Filters with at least one value picked; chips still being set up don't count. */
export function activeFilters(state: FilterState): FilterState {
  return Object.fromEntries(Object.entries(state).filter(([, value]) => value.values.length > 0));
}

/** True when `candidates` (one value or several, e.g. tags) passes the chip. */
export function matchesFilter(filter: FilterValue | undefined, candidates: string | string[]) {
  if (!filter || filter.values.length === 0) return true;
  const list = Array.isArray(candidates) ? candidates : [candidates];
  const hit = list.some((candidate) => filter.values.includes(candidate));
  return filter.operator === "is" ? hit : !hit;
}
