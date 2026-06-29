import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import { getConvexCloudUrl, getConvexSiteUrl } from "@/lib/convex-env";

export const {
  handler,
  preloadAuthQuery,
  isAuthenticated,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthNextJs({
  convexUrl: getConvexCloudUrl(),
  convexSiteUrl: getConvexSiteUrl(),
});
