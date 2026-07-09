import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
import { resolveStoredR2AssetUrl } from "./inventoryR2";

export const getJobQuery = internalQuery({
  args: { jobId: v.id("marketingPublishJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

export const getDesignQuery = internalQuery({
  args: { designId: v.id("eventMarketingDesigns") },
  handler: async (ctx, args) => {
    const design = await ctx.db.get(args.designId);
    if (!design) return null;
    const imageUrl = (await resolveStoredR2AssetUrl(design.imageUrl)) ?? design.imageUrl;
    return { ...design, imageUrl };
  },
});

export const markJobProcessing = internalMutation({
  args: { jobId: v.id("marketingPublishJobs") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, { status: "processing", updatedAt: Date.now() });
  },
});

export const markJobCompleted = internalMutation({
  args: {
    jobId: v.id("marketingPublishJobs"),
    designId: v.id("eventMarketingDesigns"),
    instagramPostId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.jobId, { status: "completed", updatedAt: now });
    await ctx.db.patch(args.designId, {
      instagramPostId: args.instagramPostId,
      lastError: undefined,
      updatedAt: now,
    });
  },
});

export const markJobFailed = internalMutation({
  args: {
    jobId: v.id("marketingPublishJobs"),
    designId: v.id("eventMarketingDesigns"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.jobId, { status: "failed", lastError: args.error, updatedAt: now });
    await ctx.db.patch(args.designId, { lastError: args.error, updatedAt: now });
  },
});
