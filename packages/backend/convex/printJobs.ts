import { v } from "convex/values";
import { fileStem } from "@arbor/show-file";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { RENTAL_EVENT_TYPES } from "./eventPullLists";
import { requireArborInternalContext } from "./lib/auth";

/**
 * Briefs print for events starting inside this window. The cron runs in the
 * morning so crew grab that day's briefs; 24h also catches the next morning.
 */
const PRINT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Newest `updatedAt` across the events a brief prints, so edits re-enqueue. */
async function briefSourceUpdatedAt(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<number> {
  const event = await ctx.db.get(eventId);
  let max = event?.updatedAt ?? 0;
  const [blocks, shifts, assignments, artifacts] = await Promise.all([
    ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(500),
    ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(500),
    ctx.db
      .query("eventPeopleAssignments")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(500),
    ctx.db
      .query("eventArtifacts")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(500),
  ]);
  for (const row of [...blocks, ...shifts, ...assignments, ...artifacts]) {
    if (row.updatedAt > max) max = row.updatedAt;
  }
  return max;
}

/**
 * Creates a print job when the brief is new or has changed. `force` is the
 * manual reprint path, which ignores the source-version guard.
 */
async function ensurePrintJob(
  ctx: MutationCtx,
  eventId: Id<"events">,
  force: boolean,
): Promise<Id<"printJobs"> | null> {
  const event = await ctx.db.get(eventId);
  if (!event) return null;

  const printer = (
    await ctx.db
      .query("printers")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .take(1)
  )[0];
  if (!printer) return null;

  const sourceUpdatedAt = await briefSourceUpdatedAt(ctx, eventId);
  const latest = (
    await ctx.db
      .query("printJobs")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .order("desc")
      .take(1)
  )[0];
  if (
    !force &&
    latest &&
    latest.status !== "failed" &&
    latest.sourceUpdatedAt >= sourceUpdatedAt
  ) {
    return latest._id;
  }

  const now = Date.now();
  const jobId = await ctx.db.insert("printJobs", {
    eventId,
    printerId: printer._id,
    status: "pending",
    sourceUpdatedAt,
    fileName: `${fileStem(event.title)}-brief.pdf`,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.printRender.run, { jobId });
  return jobId;
}

/** Daily sweep: enqueue briefs for events coming up in the print window. */
export const enqueueDue = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const upcoming = await ctx.db
      .query("events")
      .withIndex("by_startAt", (q) =>
        q.gte("startAt", now).lte("startAt", now + PRINT_WINDOW_MS),
      )
      .take(200);
    for (const event of upcoming) {
      if (event.status === "cancelled" || event.status === "completed") continue;
      // Rentals print when their outbound delivery is processed, not on the
      // morning sweep, so the brief matches what was actually pulled.
      if (event.eventType && RENTAL_EVENT_TYPES.has(event.eventType)) continue;
      await ensurePrintJob(ctx, event._id, false);
    }
    return null;
  },
});

/** Enqueues a brief when a rental's outbound delivery is processed. */
export const enqueueForEvent = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.union(v.id("printJobs"), v.null()),
  handler: async (ctx, args) => await ensurePrintJob(ctx, args.eventId, false),
});

export const markReady = internalMutation({
  args: {
    jobId: v.id("printJobs"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: "ready",
      storageId: args.storageId,
      error: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const markFailed = internalMutation({
  args: {
    jobId: v.id("printJobs"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: "failed",
      error: args.error,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const getJob = internalQuery({
  args: { jobId: v.id("printJobs") },
  handler: async (ctx, args) => await ctx.db.get(args.jobId),
});

/** Manual reprint from the portal, for any Arbor staff member. */
export const reprint = mutation({
  args: { eventId: v.id("events") },
  returns: v.union(v.id("printJobs"), v.null()),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    return await ensurePrintJob(ctx, args.eventId, true);
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const jobs = await ctx.db.query("printJobs").order("desc").take(limit);
    const rows = [];
    for (const job of jobs) {
      const [event, printer] = await Promise.all([
        ctx.db.get(job.eventId),
        ctx.db.get(job.printerId),
      ]);
      rows.push({
        _id: job._id,
        status: job.status,
        eventId: job.eventId,
        eventTitle: event?.title ?? "Unknown event",
        printerName: printer?.name ?? printer?.queueName ?? "Printer",
        fileName: job.fileName,
        attempts: job.attempts,
        error: job.error,
        createdAt: job.createdAt,
        printedAt: job.printedAt,
      });
    }
    return rows;
  },
});
