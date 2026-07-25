/**
 * Guard shared by every test-only Convex function. Test helpers can write
 * arbitrary rows, so they must never be callable on a real deployment.
 */
export function assertE2eHelpersEnabled() {
  if (process.env.E2E_HELPERS !== "true") {
    throw new Error("E2E helpers are disabled. Set E2E_HELPERS=true on the Convex deployment.");
  }
  const siteUrl = process.env.SITE_URL ?? "";
  if (!siteUrl.includes("localhost") && !siteUrl.includes("127.0.0.1")) {
    throw new Error("E2E helpers only run when SITE_URL points at localhost.");
  }
}
