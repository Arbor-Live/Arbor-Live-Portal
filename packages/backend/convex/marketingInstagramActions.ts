"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const POSTPEER_BASE_URL = "https://api.postpeer.dev/v1";
/** PostPeer accepts with 202 while the publish worker keeps running. */
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 120_000;

type PostPeerPlatformResult = {
  platform?: string;
  success?: boolean;
  platformPostId?: string | null;
  platformPostUrl?: string | null;
  status?: string;
  error?: string | null;
  errorMessage?: string | null;
  warningMessage?: string | null;
};

type PostPeerPost = {
  postId?: string;
  id?: string;
  status?: string;
  platforms?: PostPeerPlatformResult[];
};

type PostPeerResponse = PostPeerPost & {
  success?: boolean;
  error?: string | { message?: string };
  message?: string;
  post?: PostPeerPost;
  data?: PostPeerPost;
};

function getPostPeerAccessKey() {
  return process.env.POSTPEER_ACCESS_KEY ?? process.env.POSTPEER_SECRET;
}

function requirePostPeerConfig() {
  const accessKey = getPostPeerAccessKey();
  const accountId = process.env.POSTPEER_INSTAGRAM_ACCOUNT_ID;
  if (!accessKey || !accountId) {
    throw new Error("PostPeer credentials are not configured.");
  }
  return { accessKey, accountId };
}

function postPeerHeaders(accessKey: string): HeadersInit {
  return { "Content-Type": "application/json", "x-access-key": accessKey };
}

async function readBody(response: Response): Promise<PostPeerResponse> {
  return (await response.json().catch(() => ({}))) as PostPeerResponse;
}

function errorMessage(body: PostPeerResponse, fallback: string): string {
  if (typeof body.message === "string" && body.message.trim()) return body.message.trim();
  if (typeof body.error === "string" && body.error.trim()) return body.error.trim();
  if (body.error && typeof body.error === "object" && typeof body.error.message === "string") {
    const message = body.error.message.trim();
    if (message) return message;
  }
  return fallback;
}

function platformError(platform: PostPeerPlatformResult): string | null {
  return platform.errorMessage?.trim() || platform.error?.trim() || null;
}

function isTerminalStatus(status: string | undefined): boolean {
  return status === "published" || status === "partial" || status === "failed";
}

function describeFailure(post: PostPeerPost, fallback: string): string {
  const failures = (post.platforms ?? [])
    .filter((platform) => platform.success === false || platformError(platform))
    .map((platform) => `${platform.platform ?? "platform"}: ${platformError(platform) ?? "failed"}`);
  return failures.length > 0 ? failures.join("; ") : fallback;
}

function normalizePost(body: PostPeerResponse): PostPeerPost {
  return body.post ?? body.data ?? body;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function createPostPeerPost(
  imageUrl: string,
  caption: string,
  idempotencyKey: string,
): Promise<{ postId: string | null; post: PostPeerPost }> {
  const { accessKey, accountId } = requirePostPeerConfig();
  const response = await fetch(`${POSTPEER_BASE_URL}/posts`, {
    method: "POST",
    headers: postPeerHeaders(accessKey),
    body: JSON.stringify({
      content: caption,
      platforms: [{ platform: "instagram", accountId }],
      mediaItems: [{ type: "image", url: imageUrl }],
      publishNow: true,
      idempotencyKey,
    }),
  });

  const body = await readBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, `PostPeer publish failed (${response.status}).`));
  }

  const post = normalizePost(body);
  return { postId: post.postId ?? post.id ?? null, post };
}

async function fetchPostPeerPost(postId: string): Promise<PostPeerPost> {
  const { accessKey } = requirePostPeerConfig();
  const response = await fetch(`${POSTPEER_BASE_URL}/posts/${postId}`, {
    headers: postPeerHeaders(accessKey),
  });
  const body = await readBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(body, `PostPeer status check failed (${response.status}).`));
  }
  return normalizePost(body);
}

async function publishToInstagramViaPostPeer(
  imageUrl: string,
  caption: string,
  idempotencyKey: string,
): Promise<{ postId: string; postUrl: string | null }> {
  const { postId, post } = await createPostPeerPost(imageUrl, caption, idempotencyKey);
  if (!postId) throw new Error("PostPeer did not return a post id.");

  let current = post;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (!isTerminalStatus(current.status) && Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    current = await fetchPostPeerPost(postId);
  }

  if (!isTerminalStatus(current.status)) {
    throw new Error(
      `Instagram is still publishing after ${Math.round(POLL_TIMEOUT_MS / 1000)}s. Check the PostPeer dashboard.`,
    );
  }
  if (current.status !== "published") {
    throw new Error(describeFailure(current, `PostPeer reported status "${current.status}".`));
  }

  const instagram = (current.platforms ?? []).find((platform) => platform.platform === "instagram");
  if (instagram?.warningMessage?.trim()) {
    console.warn(`Instagram publish warning: ${instagram.warningMessage.trim()}`);
  }
  return {
    postId: instagram?.platformPostId?.trim() || postId,
    postUrl: instagram?.platformPostUrl?.trim() || null,
  };
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
      if (!design.imageUrl?.trim()) throw new Error("Design has no poster image.");

      const { postId, postUrl } = await publishToInstagramViaPostPeer(
        design.imageUrl,
        caption,
        String(args.jobId),
      );
      await ctx.runMutation(internal.marketingInstagram.markJobCompleted, {
        jobId: args.jobId,
        designId: job.designId,
        instagramPostId: postId,
        instagramPostUrl: postUrl,
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
