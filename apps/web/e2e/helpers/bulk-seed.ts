import { runConvex } from "./convex";

/**
 * Helpers for the list/picker cap regressions. Each spec pushes one table past
 * the `.take()` ceiling its query used to select on, asserts the *newest* row is
 * reachable, then purges the batch — the Convex deployment is shared across
 * worktrees, so batches must not survive the spec.
 */

/** Rows per seed call. Keeps each mutation transaction comfortably small. */
const CHUNK = 100;

export type BulkTable =
  | "events"
  | "invoices"
  | "shortLinks"
  | "marketingPosts"
  | "crewApplications"
  | "bandApplications"
  | "damageReports"
  | "inventoryItems"
  | "inventoryTypes";

export function bulkStamp() {
  return String(Date.now());
}

/** Must match `bulkLabel` in `packages/backend/convex/e2eBulkSeed.ts`. */
export function bulkLabel(stamp: string, index: number) {
  return `E2E Bulk ${stamp} #${index}`;
}

/** Label of the newest row in a batch — the one the old capped query dropped. */
export function newestLabel(stamp: string, total: number) {
  return bulkLabel(stamp, total - 1);
}

/**
 * Seed `total` rows through `e2eBulkSeed:<seeder>`, in chunks. Returns the last
 * chunk's result so callers can pick up ids the seeder created.
 */
export function seedBulk(
  seeder: string,
  stamp: string,
  total: number,
  extraArgs: Record<string, unknown> = {},
) {
  let last: Record<string, unknown> | null = null;
  for (let offset = 0; offset < total; offset += CHUNK) {
    const count = Math.min(CHUNK, total - offset);
    // Rows the seeder had to create itself (the damage-report inventory item)
    // are threaded into later chunks so one batch shares one item.
    const carried: Record<string, unknown> = {};
    for (const key of ["inventoryItemId", "typeId"]) {
      if (last && last[key] !== undefined) carried[key] = last[key];
    }
    last = runConvex(`e2eBulkSeed:${seeder}`, {
      stamp,
      offset,
      count,
      ...extraArgs,
      ...carried,
    }) as Record<string, unknown>;
  }
  return last ?? {};
}

/** Delete a stamped batch, looping until the table reports nothing remaining. */
export function purgeBulk(stamp: string, tables: BulkTable[]) {
  for (const table of tables) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const result = runConvex("e2eBulkSeed:purgeBulk", { stamp, table }) as {
        deleted: number;
        remaining: number;
      };
      if (result.remaining === 0) break;
    }
  }
}
