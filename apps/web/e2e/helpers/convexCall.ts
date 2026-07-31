import { resolveConvexUrl } from "./convex";

// Resolved from the same source the app builds against — never hardcoded, or
// CI ends up calling a different deployment than the one issuing its tokens.
const convexUrl = resolveConvexUrl();

export type ConvexResponse = { status: string; errorMessage?: string; value?: unknown };

/**
 * Call a Convex function directly with the authenticated session's own JWT,
 * bypassing the UI. This is what an actual escalation attempt looks like —
 * `AdminOnlyGuard` is client-side, so it only makes a refusal legible, it is
 * not the boundary.
 */
export async function callConvexAs(
  page: import("@playwright/test").Page,
  kind: "query" | "mutation",
  path: string,
  args: Record<string, unknown>,
): Promise<ConvexResponse> {
  return await page.evaluate(
    async ({ convexUrl, kind, path, args }) => {
      const tokenRes = await fetch("/api/auth/convex/token");
      if (!tokenRes.ok) throw new Error(`token fetch failed: ${tokenRes.status}`);
      const { token } = (await tokenRes.json()) as { token: string };

      const res = await fetch(`${convexUrl}/api/${kind}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ path, args, format: "json" }),
      });
      return (await res.json()) as { status: string; errorMessage?: string; value?: unknown };
    },
    { convexUrl, kind, path, args },
  );
}
