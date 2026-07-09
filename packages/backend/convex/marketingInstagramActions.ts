"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

async function publishToInstagram(imageUrl: string, caption: string) {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!accessToken || !accountId) {
    throw new Error("Instagram credentials are not configured.");
  }

  const containerResponse = await fetch(
    `https://graph.facebook.com/v21.0/${accountId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      }),
    },
  );
  const containerJson = (await containerResponse.json()) as {
    id?: string;
    error?: { message?: string };
  };
  if (!containerResponse.ok || !containerJson.id) {
    throw new Error(containerJson.error?.message ?? "Failed to create Instagram media container.");
  }

  const publishResponse = await fetch(
    `https://graph.facebook.com/v21.0/${accountId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: containerJson.id,
        access_token: accessToken,
      }),
    },
  );
  const publishJson = (await publishResponse.json()) as {
    id?: string;
    error?: { message?: string };
  };
  if (!publishResponse.ok || !publishJson.id) {
    throw new Error(publishJson.error?.message ?? "Failed to publish Instagram media.");
  }
  return publishJson.id;
}

export const processJob = internalAction({
  args: { jobId: v.id("marketingPublishJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.marketingInstagram.getJobQuery, { jobId: args.jobId });
    if (!job || job.status !== "queued" || job.target !== "instagram") return null;

    await ctx.runMutation(internal.marketingInstagram.markJobProcessing, { jobId: args.jobId });

    try {
      const caption: string | null = await ctx.runMutation(
        internal.marketingDesigns.buildInstagramCaption,
        { designId: job.designId },
      );
      if (!caption) throw new Error("Design or event not found.");

      const design = await ctx.runQuery(internal.marketingInstagram.getDesignQuery, {
        designId: job.designId,
      });
      if (!design) throw new Error("Design not found.");

      const instagramPostId = await publishToInstagram(design.imageUrl, caption);
      await ctx.runMutation(internal.marketingInstagram.markJobCompleted, {
        jobId: args.jobId,
        designId: job.designId,
        instagramPostId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Instagram publish failed.";
      await ctx.runMutation(internal.marketingInstagram.markJobFailed, {
        jobId: args.jobId,
        designId: job.designId,
        error: message,
      });
    }

    return null;
  },
});
