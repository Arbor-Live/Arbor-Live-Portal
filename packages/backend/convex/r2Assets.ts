import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { inventoryR2 } from "./inventoryR2";
import {
  collectReferencedR2Keys,
  isWithinOrphanGracePeriod,
  R2_ORPHAN_GRACE_MS,
} from "./lib/r2Lifecycle";

/** Metadata rows scanned per orphan-sweeper invocation. */
const METADATA_PAGE_SIZE = 100;
/** Hard cap on deletes per invocation to stay within mutation limits. */
const MAX_DELETES_PER_RUN = 200;

export const listReferencedKeys = internalQuery({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    return [...(await collectReferencedR2Keys(ctx))];
  },
});

export const reportOrphans = internalMutation({
  args: {},
  returns: v.object({
    referencedCount: v.number(),
    scannedCount: v.number(),
    orphanCount: v.number(),
    graceSkippedCount: v.number(),
    orphanKeys: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const referenced = await collectReferencedR2Keys(ctx);
    const now = Date.now();
    let scannedCount = 0;
    let orphanCount = 0;
    let graceSkippedCount = 0;
    const orphanKeys: string[] = [];
    let cursor: string | null = null;

    while (orphanKeys.length < 500) {
      const page = await inventoryR2.listMetadata(ctx, METADATA_PAGE_SIZE, cursor);
      for (const row of page.page) {
        scannedCount += 1;
        if (referenced.has(row.key)) continue;
        if (isWithinOrphanGracePeriod(row.lastModified, now)) {
          graceSkippedCount += 1;
          continue;
        }
        orphanCount += 1;
        orphanKeys.push(row.key);
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    return {
      referencedCount: referenced.size,
      scannedCount,
      orphanCount,
      graceSkippedCount,
      orphanKeys,
    };
  },
});

export const pruneOrphans = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    deletedThisRun: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const referenced = await collectReferencedR2Keys(ctx);
    const now = Date.now();
    let deletedThisRun = args.deletedThisRun ?? 0;
    let cursor: string | null = args.cursor ?? null;
    let scheduledContinuation = false;

    while (deletedThisRun < MAX_DELETES_PER_RUN) {
      const page = await inventoryR2.listMetadata(ctx, METADATA_PAGE_SIZE, cursor);

      for (const row of page.page) {
        if (referenced.has(row.key)) continue;
        if (isWithinOrphanGracePeriod(row.lastModified, now)) continue;

        try {
          await inventoryR2.deleteObject(ctx, row.key);
          deletedThisRun += 1;
        } catch (error) {
          console.error(`R2 orphan delete failed for key "${row.key}":`, error);
        }

        if (deletedThisRun >= MAX_DELETES_PER_RUN) break;
      }

      if (page.isDone) {
        return null;
      }

      cursor = page.continueCursor;

      if (deletedThisRun >= MAX_DELETES_PER_RUN) {
        scheduledContinuation = true;
        break;
      }
    }

    if (scheduledContinuation && cursor) {
      await ctx.scheduler.runAfter(0, internal.r2Assets.pruneOrphans, {
        cursor,
        deletedThisRun: 0,
      });
    }

    return null;
  },
});

export { R2_ORPHAN_GRACE_MS, MAX_DELETES_PER_RUN, METADATA_PAGE_SIZE };
