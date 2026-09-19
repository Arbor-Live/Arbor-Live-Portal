"use node";

import { v } from "convex/values";
import { renderEventBriefPdfBuffer } from "@arbor/rider-document/brief";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/** Renders a queued brief to Convex storage, then parks the job as `ready`. */
export const run = internalAction({
  args: { jobId: v.id("printJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.printJobs.getJob, { jobId: args.jobId });
    if (!job) return null;

    const brief = await ctx.runQuery(internal.eventBrief.getBriefSource, {
      eventId: job.eventId,
    });
    if (!brief) {
      await ctx.runMutation(internal.printJobs.markFailed, {
        jobId: args.jobId,
        error: "Event not found for print job.",
      });
      return null;
    }

    try {
      const buffer = await renderEventBriefPdfBuffer(brief);
      const blob = new Blob([new Uint8Array(buffer)], { type: "application/pdf" });
      const storageId = await ctx.storage.store(blob);
      await ctx.runMutation(internal.printJobs.markReady, {
        jobId: args.jobId,
        storageId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.printJobs.markFailed, {
        jobId: args.jobId,
        error: message,
      });
    }
    return null;
  },
});
