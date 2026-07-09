"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

type PostPeerResponse = {
  id?: string;
  postId?: string;
  data?: { id?: string };
  error?: string;
  message?: string;
};

function getPostPeerAccessKey() {
  return process.env.POSTPEER_ACCESS_KEY ?? process.env.POSTPEER_SECRET;
}

async function publishToInstagramViaPostPeer(imageUrl: string, caption: string) {
  const accessKey = getPostPeerAccessKey();
  const accountId = process.env.POSTPEER_INSTAGRAM_ACCOUNT_ID;
  if (!accessKey || !accountId) {
    throw new Error("PostPeer credentials are not configured.");
  }

  const response = await fetch("https://api.postpeer.dev/v1/posts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-access-key": accessKey,
    },
    body: JSON.stringify({
      content: caption,
      platforms: [
        {
          platform: "instagram",
          accountId,
          mediaItems: [
            {
              url: imageUrl,
              type: "image",
            },
          ],
        },
      ],
    }),
  });

  const body = (await response.json().catch(() => ({}))) as PostPeerResponse;
  if (!response.ok) {
    throw new Error(body.message ?? body.error ?? `PostPeer publish failed (${response.status}).`);
  }

  const postId = body.id ?? body.postId ?? body.data?.id;
  return postId ?? "postpeer-published";
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

      const instagramPostId = await publishToInstagramViaPostPeer(design.imageUrl, caption);
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
