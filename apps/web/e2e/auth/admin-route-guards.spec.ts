import { test, expect } from "@playwright/test";
import { crewAuthFile } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { runConvex } from "../helpers/convex";

/**
 * Routes the sidebar itself marks `adminOnly: true`
 * (`apps/web/src/components/app-sidebar.tsx`) — the app's own statement of
 * which areas are admin-limited.
 */
const adminRoutes = [
  { path: "/dashboard/users", label: "users" },
  { path: "/dashboard/users/crew-applications", label: "crew applications" },
  { path: "/dashboard/users/band-applications", label: "band applications" },
  { path: "/dashboard/financial-hub", label: "financial hub" },
  { path: "/dashboard/financial-hub/insights", label: "insights" },
  { path: "/dashboard/events/crew-scheduling", label: "crew scheduling" },
  { path: "/dashboard/events/venues", label: "venues" },
  { path: "/dashboard/events/open-mic", label: "open mic" },
  { path: "/dashboard/inventory/types", label: "inventory types" },
  { path: "/dashboard/inventory/import", label: "inventory import" },
] as const;

/**
 * The e2e crew user is a real `arbor_internal` member but not an admin, so they
 * walk straight through `ArborOnlyGuard`. Hitting these URLs directly is the
 * realistic escalation attempt.
 */
test.describe("admin route guards", () => {
  test.use({ storageState: crewAuthFile });

  test.beforeAll(() => {
    runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
    });
  });

  for (const { path, label } of adminRoutes) {
    test(`non-admin crew is refused on ${label}`, async ({ page }) => {
      await page.goto(path);

      await expect(page.getByText("Admin access required").first()).toBeVisible({
        timeout: 30_000,
      });

      // Refused, not crashed — a raw error boundary would also "fail closed"
      // but tells the user nothing.
      await expect(page.getByText("Something went wrong")).toHaveCount(0);
    });
  }

  test("the sidebar does not advertise admin areas to crew", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });

    const nav = page.getByRole("navigation").first();
    await expect(nav.getByRole("link", { name: "Users", exact: true })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Finances", exact: true })).toHaveCount(0);
  });
});

test.describe("admin route access for admins", () => {
  // Control: the same routes must still work for a real admin, otherwise the
  // guard above could be passing by breaking the page for everyone.
  for (const { path, label } of adminRoutes) {
    test(`admin still reaches ${label}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText("Admin access required")).toHaveCount(0, {
        timeout: 30_000,
      });
    });
  }
});
