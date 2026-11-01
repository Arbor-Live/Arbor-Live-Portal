import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

if (!convexUrl) {
  throw new Error(
    "NEXT_PUBLIC_CONVEX_URL is not set. Add it in Vercel (Preview + Production) or run `pnpm dev` locally.",
  );
}

if (!convexSiteUrl) {
  throw new Error(
    "NEXT_PUBLIC_CONVEX_SITE_URL is not set. Add it in Vercel or let the build derive it from the Convex cloud URL.",
  );
}

export const {
  handler,
  preloadAuthQuery,
  isAuthenticated,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthNextJs({
  convexUrl,
  convexSiteUrl,
});

/**
 * For page titles in `generateMetadata`: null instead of a throw when the
 * lookup fails (signed out, wrong organization, bad id), since a throw there
 * replaces the whole page with the error screen.
 */
export async function fetchAuthQueryOrNull<Query extends FunctionReference<"query">>(
  query: Query,
  args: FunctionArgs<Query>,
): Promise<FunctionReturnType<Query> | null> {
  try {
    return await fetchAuthQuery(query, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[convex] Title query failed: ${message}`);
    return null;
  }
}
