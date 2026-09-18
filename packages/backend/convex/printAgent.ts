import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireArborInternalContext } from "./lib/auth";

/** A claim older than this is assumed dead (Pi rebooted mid-print) and reclaimable. */
const CLAIM_LEASE_MS = 5 * 60 * 1000;

function assertAgentToken(token: string) {
  const expected = process.env.PRINT_AGENT_TOKEN;
  if (!expected) {
    throw new Error("PRINT_AGENT_TOKEN is not set on this deployment.");
  }
  if (token !== expected) {
    throw new Error("Invalid print agent token.");
  }
}

async function upsertPrinter(
  ctx: MutationCtx,
  queueName: string,
): Promise<Doc<"printers">> {
  const existing = await ctx.db
    .query("printers")
    .withIndex("by_queueName", (q) => q.eq("queueName", queueName))
    .unique();
  if (existing) return existing;
  const now = Date.now();
  const id = await ctx.db.insert("printers", {
    queueName,
    name: queueName,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });
  return (await ctx.db.get(id))!;
}

/** Reports liveness so the portal can show whether the warehouse printer is up. */
export const heartbeat = mutation({
  args: {
    token: v.string(),
    queueName: v.string(),
    status: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.object({ printerId: v.id("printers") }),
  handler: async (ctx, args) => {
    assertAgentToken(args.token);
    const now = Date.now();
    const printer = await upsertPrinter(ctx, args.queueName);
    await ctx.db.patch(printer._id, {
      lastSeenAt: now,
      lastSeenStatus: args.status,
      lastError: args.error,
      updatedAt: now,
    });
    return { printerId: printer._id };
  },
});

/**
 * Claims the oldest ready job for this printer and returns a signed PDF URL.
 * Stale `printing` jobs are returned to the queue first so a reboot can retry.
 */
export const claimNext = mutation({
  args: { token: v.string(), queueName: v.string() },
  returns: v.union(
    v.null(),
    v.object({ jobId: v.id("printJobs"), url: v.string(), fileName: v.string() }),
  ),
  handler: async (ctx, args) => {
    assertAgentToken(args.token);
    const now = Date.now();
    const printer = await upsertPrinter(ctx, args.queueName);
    await ctx.db.patch(printer._id, { lastSeenAt: now, updatedAt: now });
    if (!printer.enabled) return null;

    const printing = await ctx.db
      .query("printJobs")
      .withIndex("by_printerId_and_status", (q) =>
        q.eq("printerId", printer._id).eq("status", "printing"),
      )
      .take(20);
    for (const job of printing) {
      if (job.claimedAt !== undefined && now - job.claimedAt > CLAIM_LEASE_MS) {
        await ctx.db.patch(job._id, {
          status: "ready",
          claimedAt: undefined,
          updatedAt: now,
        });
      }
    }

    const ready = (
      await ctx.db
        .query("printJobs")
        .withIndex("by_printerId_and_status", (q) =>
          q.eq("printerId", printer._id).eq("status", "ready"),
        )
        .order("asc")
        .take(1)
    )[0];
    if (!ready) return null;

    const url = ready.storageId ? await ctx.storage.getUrl(ready.storageId) : null;
    if (!url) {
      await ctx.db.patch(ready._id, {
        status: "failed",
        error: "Rendered PDF is missing from storage.",
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.patch(ready._id, {
      status: "printing",
      claimedAt: now,
      attempts: ready.attempts + 1,
      updatedAt: now,
    });
    return { jobId: ready._id, url, fileName: ready.fileName };
  },
});

export const complete = mutation({
  args: { token: v.string(), jobId: v.id("printJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertAgentToken(args.token);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === "printed") return null;
    await ctx.db.patch(args.jobId, {
      status: "printed",
      printedAt: Date.now(),
      error: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const fail = mutation({
  args: { token: v.string(), jobId: v.id("printJobs"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertAgentToken(args.token);
    await ctx.db.patch(args.jobId, {
      status: "failed",
      error: args.error,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Printer status for the dashboard (online = heartbeat within the last 5 min). */
export const listPrinters = query({
  args: {},
  handler: async (ctx) => {
    await requireArborInternalContext(ctx);
    const printers = await ctx.db.query("printers").take(50);
    return printers.map((printer) => ({
      _id: printer._id,
      name: printer.name,
      queueName: printer.queueName,
      enabled: printer.enabled,
      lastSeenAt: printer.lastSeenAt,
      lastSeenStatus: printer.lastSeenStatus,
      lastError: printer.lastError,
    }));
  },
});
