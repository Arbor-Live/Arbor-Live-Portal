"use node";

import { v } from "convex/values";
import { renderEventBriefPdfBuffer } from "@arbor/rider-document/brief";
import { renderImagePdfBuffer } from "@arbor/rider-document/image";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { printableFormatFromContentType, printableFormatFromName } from "./lib/printable";

const DOWNLOAD_TIMEOUT_MS = 60_000;

/** Renders the job's brief, or converts its file/poster to a PDF. Throws with a user-facing reason. */
async function renderJobPdf(ctx: ActionCtx, job: Doc<"printJobs">): Promise<Uint8Array> {
  if ((job.kind ?? "brief") === "brief") {
    const brief = await ctx.runQuery(internal.eventBrief.getBriefSource, {
      eventId: job.eventId,
    });
    if (!brief) throw new Error("Event not found for print job.");
    return await renderEventBriefPdfBuffer(brief);
  }

  const source = await ctx.runQuery(internal.printJobs.getFileSource, { jobId: job._id });
  if (!source) throw new Error("The file to print no longer exists.");

  let bytes: Uint8Array;
  let contentType: string | null;
  if (source.storageId) {
    const blob = await ctx.storage.get(source.storageId);
    if (!blob) throw new Error("The file to print is missing from storage.");
    bytes = new Uint8Array(await blob.arrayBuffer());
    contentType = blob.type;
  } else if (source.url) {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`File download failed with HTTP ${response.status}.`);
    bytes = new Uint8Array(await response.arrayBuffer());
    contentType = response.headers.get("content-type");
  } else {
    throw new Error("The file to print no longer exists.");
  }

  const format = printableFormatFromContentType(contentType) ?? printableFormatFromName(source.name);
  if (format === "pdf") return bytes;
  if (format) return await renderImagePdfBuffer(bytes, format);
  throw new Error("Only PDF, PNG, and JPEG files can be printed.");
}

/** Renders a queued job's PDF to Convex storage, then parks the job as `ready`. */
export const run = internalAction({
  args: { jobId: v.id("printJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.printJobs.getJob, { jobId: args.jobId });
    if (!job) return null;

    try {
      const pdf = await renderJobPdf(ctx, job);
      const blob = new Blob([new Uint8Array(pdf)], { type: "application/pdf" });
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
