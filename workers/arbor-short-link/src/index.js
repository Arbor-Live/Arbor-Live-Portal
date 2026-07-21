/**
 * arbor.st short-link redirect worker.
 *
 * Env:
 * - CONVEX_SITE_URL — e.g. https://your-deployment.convex.site
 * - SHORT_LINK_WORKER_SECRET — must match Convex SHORT_LINK_WORKER_SECRET
 * - FALLBACK_BASE_URL — optional, default https://arborlive.stanford.edu
 */
export default {
  async fetch(request, env) {
    if (request.method !== "GET") {
      return new Response("Forbidden", { status: 403 });
    }

    const url = new URL(request.url);
    const key = url.pathname.slice(1);
    const fallbackBase = env.FALLBACK_BASE_URL ?? "https://arborlive.stanford.edu";

    if (!key) {
      return Response.redirect(`${fallbackBase}/${url.search}`, 302);
    }

    const convexSiteUrl = env.CONVEX_SITE_URL?.replace(/\/+$/, "");
    if (!convexSiteUrl || !env.SHORT_LINK_WORKER_SECRET) {
      return Response.redirect(`${fallbackBase}/${key}${url.search}`, 302);
    }

    const lookupUrl = `${convexSiteUrl}/short-link?slug=${encodeURIComponent(key)}`;
    const res = await fetch(lookupUrl, {
      headers: {
        Authorization: `Bearer ${env.SHORT_LINK_WORKER_SECRET}`,
      },
    });

    if (res.status === 302) {
      const location = res.headers.get("Location");
      if (location) {
        const dest = new URL(location);
        if (url.search && !dest.search) {
          dest.search = url.search;
        }
        return Response.redirect(dest.toString(), 302);
      }
    }

    return Response.redirect(`${fallbackBase}/${key}${url.search}`, 302);
  },
};
