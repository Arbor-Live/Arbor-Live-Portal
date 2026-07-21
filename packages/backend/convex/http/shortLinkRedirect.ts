import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";

function workerSecretFromRequest(req: Request) {
  const auth = req.headers.get("Authorization")?.trim();
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length).trim();
}

function verifyWorkerSecret(req: Request) {
  const expected = process.env.SHORT_LINK_WORKER_SECRET?.trim();
  if (!expected) {
    console.error("SHORT_LINK_WORKER_SECRET is not configured");
    return false;
  }
  const provided = workerSecretFromRequest(req);
  return Boolean(provided && provided === expected);
}

export const handleShortLinkLookup = httpAction(async (ctx, req) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!verifyWorkerSecret(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug")?.trim();
  if (!slug) {
    return new Response("Missing slug", { status: 400 });
  }

  const match = await ctx.runQuery(internal.shortLinks.lookupBySlugInternal, { slug });
  if (!match) {
    return new Response("Not found", { status: 404 });
  }

  await ctx.scheduler.runAfter(0, internal.shortLinks.recordClick, { slug });

  return new Response(null, {
    status: 302,
    headers: {
      Location: match.destinationUrl,
    },
  });
});
