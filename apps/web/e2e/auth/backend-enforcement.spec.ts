import { test, expect } from "@playwright/test";
import { crewAuthFile } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { pollConvex, resolveConvexUrl, runConvex } from "../helpers/convex";

/**
 * `AdminOnlyGuard` is client-side, so it only makes a refusal legible — it is
 * not the boundary. These tests skip the UI entirely: they take the crew user's
 * own Convex JWT from their authenticated session and call privileged functions
 * directly, which is what an actual escalation attempt looks like.
 *
 * This is the layer that catches a `requireAdmin` → `requireAuth` regression
 * even when every guard in the UI is still intact.
 */

// Resolved from the same source the app builds against — never hardcoded, or
// CI ends up calling a different deployment than the one issuing its tokens.
const convexUrl = resolveConvexUrl();

type ConvexResponse = { status: string; errorMessage?: string; value?: unknown };

async function callConvexAs(
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

test.describe("convex rejects privileged calls from a non-admin", () => {
  test.use({ storageState: crewAuthFile });

  test.beforeAll(() => {
    runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
    });
  });

  test("admin-only queries are refused even with a valid crew token", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });

    for (const path of [
      "crewApplications:listAdmin",
      "bandApplications:listAdmin",
      "users:listUsersForAdmin",
    ]) {
      const result = await callConvexAs(page, "query", path, {});
      expect(result.status, `${path} should not succeed for a non-admin`).toBe("error");
      expect(result.errorMessage ?? "").toMatch(/admin|access|permission/i);
    }
  });

  test("an admin-only mutation cannot change data from a crew session", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedSubmittedCrewApplication", {
      name: `E2E Escalation ${Date.now()}`,
    }) as { applicationId: string; name: string };

    await page.goto("/dashboard");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });

    const result = await callConvexAs(page, "mutation", "crewApplications:close", {
      applicationId: seeded.applicationId,
    });
    expect(result.status).toBe("error");

    // The refusal must also mean nothing was written.
    const state = await pollConvex<{ status: string }>(
      "e2eHelpers:getCrewApplicationState",
      { applicationId: seeded.applicationId },
      (row) => row?.status === "submitted",
    );
    expect(state.status).toBe("submitted");
  });
});
