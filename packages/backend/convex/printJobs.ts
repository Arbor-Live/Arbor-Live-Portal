import { v } from "convex/values";
import { fileStem } from "@arbor/show-file";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { RENTAL_EVENT_TYPES } from "./eventPullLists";
import { requireArborInternalContext } from "./lib/auth";
import {
  MAX_POSTER_COPIES,
  printableFormatFromContentType,
  printableFormatFromName,
} from "./lib/printable";
import { resolveStoredR2AssetUrl } from "./inventoryR2";

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
  // eventContactsUpdatedAt covers deletions: removing the last contact leaves no
  // row whose updatedAt the loop below could pick up.
  let max = Math.max(event?.updatedAt ?? 0, event?.eventContactsUpdatedAt ?? 0);
  const [blocks, shifts, artifacts, pullListItems, eventContacts] = await Promise.all([
    ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(500),
    ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(500),
    ctx.db
      .query("eventArtifacts")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(500),
    ctx.db
      .query("eventPullListItems")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(500),
    ctx.db
      .query("eventContacts")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(200),
  ]);
  for (const row of [...blocks, ...shifts, ...artifacts, ...pullListItems, ...eventContacts]) {
    if (row.updatedAt > max) max = row.updatedAt;
  }

  // Host billing contacts print on the brief, so their edits refresh it too.
  if (event?.hostGroupId) {
    const contacts = await ctx.db
      .query("invoiceContacts")
      .withIndex("by_groupId", (q) => q.eq("groupId", event.hostGroupId))
      .take(200);
    for (const contact of contacts) {
      if (contact.updatedAt > max) max = contact.updatedAt;
    }
  }

  // Rider content and the venue address also feed the brief. A rider edit or a
  // venue/ancestor address edit must refresh the printed brief even though the
  // event itself did not change, so fold both into the freshness stamp.
  const participations = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(50);
  for (const participation of participations) {
    if (participation.updatedAt > max) max = participation.updatedAt;
    const riders = await ctx.db
      .query("bandRiders")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", participation.organizationId),
      )
      .take(50);
    for (const rider of riders) {
      if (rider.updatedAt > max) max = rider.updatedAt;
    }
  }

  let venueId = event?.venueId;
  for (let hop = 0; venueId && hop < 20; hop += 1) {
    const venue = await ctx.db.get(venueId);
    if (!venue) break;
    if (venue.updatedAt > max) max = venue.updatedAt;
    venueId = venue.parentId;
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

  const printer = await firstEnabledPrinter(ctx);
  if (!printer) {
    console.warn(`[printJobs] no enabled printer; skipped brief for event ${eventId}`);
    return null;
  }

  const sourceUpdatedAt = await briefSourceUpdatedAt(ctx, eventId);
  // File and poster prints share the event's job history; only a brief counts
  // as "already printed" here.
  const recent = await ctx.db
    .query("printJobs")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .order("desc")
    .take(50);
  const latest = recent.find((job) => (job.kind ?? "brief") === "brief");
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

async function firstEnabledPrinter(ctx: MutationCtx): Promise<Doc<"printers"> | null> {
  return (
    (
      await ctx.db
        .query("printers")
        .withIndex("by_enabled", (q) => q.eq("enabled", true))
        .take(1)
    )[0] ?? null
  );
}

const UNPRINTABLE_FILE_MESSAGE = "Only PDF, PNG, and JPEG files can be printed.";

/** Daily sweep: schedule a brief check for events coming up in the print window. */
export const enqueueDue = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    // A day's events sit far below this cap; it is a safety valve so a
    // pathological backlog can never fan out without bound.
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
      // Each event is handled in its own mutation: reading its brief source is
      // heavier than this sweep's transaction should carry.
      await ctx.scheduler.runAfter(0, internal.printJobs.enqueueForEvent, {
        eventId: event._id,
      });
    }
    return null;
  },
});

/**
 * Enqueues a brief for one event if it is new or changed. Called per event by
 * the daily sweep, and directly when a rental's outbound delivery is processed.
 */
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

/** Queues an event file's attachment (PDF or image) for the warehouse printer. */
export const printEventFile = mutation({
  args: { artifactId: v.id("eventArtifacts") },
  returns: v.union(v.id("printJobs"), v.null()),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact) throw new Error("File not found.");
    if (artifact.linkUrl) {
      if (!printableFormatFromName(artifact.linkUrl)) throw new Error(UNPRINTABLE_FILE_MESSAGE);
    } else if (artifact.storageFileId) {
      const metadata = await ctx.db.system.get("_storage", artifact.storageFileId);
      if (!printableFormatFromContentType(metadata?.contentType)) {
        throw new Error(UNPRINTABLE_FILE_MESSAGE);
      }
    } else {
      throw new Error("This file has no attachment to print.");
    }

    const printer = await firstEnabledPrinter(ctx);
    if (!printer) return null;
    const now = Date.now();
    const jobId = await ctx.db.insert("printJobs", {
      eventId: artifact.eventId,
      printerId: printer._id,
      status: "pending",
      kind: "event_file",
      artifactId: artifact._id,
      copies: 1,
      sourceUpdatedAt: artifact.updatedAt,
      fileName: `${fileStem(artifact.title)}.pdf`,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.printRender.run, { jobId });
    return jobId;
  },
});

/** Queues copies of an event's saved marketing poster for the warehouse printer. */
export const printPoster = mutation({
  args: { designId: v.id("eventMarketingDesigns"), copies: v.number() },
  returns: v.union(v.id("printJobs"), v.null()),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    if (!Number.isInteger(args.copies) || args.copies < 1 || args.copies > MAX_POSTER_COPIES) {
      throw new Error(`Choose between 1 and ${MAX_POSTER_COPIES} copies.`);
    }
    const design = await ctx.db.get(args.designId);
    if (!design?.imageUrl?.trim()) throw new Error("Save a poster image before printing.");
    if (!printableFormatFromName(design.imageUrl)) {
      throw new Error("Only PNG, JPEG, and PDF posters can be printed.");
    }
    const event = await ctx.db.get(design.eventId);
    if (!event) throw new Error("Event not found.");

    const printer = await firstEnabledPrinter(ctx);
    if (!printer) return null;
    const now = Date.now();
    const jobId = await ctx.db.insert("printJobs", {
      eventId: design.eventId,
      printerId: printer._id,
      status: "pending",
      kind: "poster",
      designId: design._id,
      copies: args.copies,
      sourceUpdatedAt: design.updatedAt,
      fileName: `${fileStem(event.title)}-poster.pdf`,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.printRender.run, { jobId });
    return jobId;
  },
});

/** Reprints a job from the queue page as the same kind, source, and copy count. */
export const reprintJob = mutation({
  args: { jobId: v.id("printJobs") },
  returns: v.union(v.id("printJobs"), v.null()),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Print job not found.");
    if ((job.kind ?? "brief") === "brief") return await ensurePrintJob(ctx, job.eventId, true);

    const printer = await firstEnabledPrinter(ctx);
    if (!printer) return null;
    const now = Date.now();
    const jobId = await ctx.db.insert("printJobs", {
      eventId: job.eventId,
      printerId: printer._id,
      status: "pending",
      kind: job.kind,
      artifactId: job.artifactId,
      designId: job.designId,
      copies: job.copies,
      sourceUpdatedAt: job.sourceUpdatedAt,
      fileName: job.fileName,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.printRender.run, { jobId });
    return jobId;
  },
});

/**
 * Where the render action reads a file or poster job's bytes: a Convex storage
 * blob, or a fetchable URL (R2 or external). Null when the source is gone.
 */
export const getFileSource = internalQuery({
  args: { jobId: v.id("printJobs") },
  returns: v.union(
    v.null(),
    v.object({
      storageId: v.optional(v.id("_storage")),
      url: v.optional(v.string()),
      /** Name to fall back on when the response has no usable content type. */
      name: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    if (job.kind === "event_file" && job.artifactId) {
      const artifact = await ctx.db.get(job.artifactId);
      if (!artifact) return null;
      if (artifact.linkUrl) {
        const url = await resolveStoredR2AssetUrl(artifact.linkUrl);
        return url ? { url, name: artifact.linkUrl } : null;
      }
      return artifact.storageFileId
        ? { storageId: artifact.storageFileId, name: artifact.title }
        : null;
    }
    if (job.kind === "poster" && job.designId) {
      const design = await ctx.db.get(job.designId);
      if (!design?.imageUrl) return null;
      const url = await resolveStoredR2AssetUrl(design.imageUrl);
      return url ? { url, name: design.imageUrl } : null;
    }
    return null;
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
        kind: job.kind ?? "brief",
        copies: job.copies ?? 1,
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

/**
 * Finished jobs hold a rendered PDF in storage. Keep a month of history, then
 * drop the job (and its blob); the daily cron drains any backlog over a few
 * runs at 200 jobs each.
 */
const JOB_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export const pruneOldJobs = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - JOB_RETENTION_MS;
    for (const status of ["printed", "failed"] as const) {
      const stale = await ctx.db
        .query("printJobs")
        .withIndex("by_status_and_createdAt", (q) =>
          q.eq("status", status).lt("createdAt", cutoff),
        )
        .take(200);
      for (const job of stale) {
        if (job.storageId) await ctx.storage.delete(job.storageId);
        await ctx.db.delete(job._id);
      }
    }
    return null;
  },
});
