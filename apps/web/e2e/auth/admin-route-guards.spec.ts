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
  { path: "/dashboard/users/artist-applications", label: "band applications" },
  { path: "/dashboard/financial-hub", label: "financial hub" },
  { path: "/dashboard/financial-hub/insights", label: "insights" },
  { path: "/dashboard/events/crew-scheduling", label: "crew scheduling" },
  { path: "/dashboard/events/venues", label: "venues" },
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

    const sidebar = page.locator('[data-slot="sidebar"]').first();
    await expect(sidebar.getByRole("link", { name: "Users", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name: "Users", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Ops Center", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name: "Ops Center", exact: true })).toHaveCount(0);

    // Crew get the Artists section for the directory, without the admin pages in it.
    await page.goto("/dashboard/artists/directory");
    await expect(page.getByTestId("artist-directory")).toBeVisible({ timeout: 30_000 });
    await expect(sidebar.locator('a[href="/dashboard/artists/directory"]').first()).toBeVisible();
    for (const adminPage of ["Profile", "Technical riders", "Organizations", "Artist applications"]) {
      await expect(sidebar.getByRole("link", { name: adminPage, exact: true })).toHaveCount(0);
    }
  });

  test("non-admin crew is refused on bands and performers", async ({ page }) => {
    await page.goto("/dashboard/artists");
    await expect(page.getByText("Admin access required").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  });

  test("non-admin crew can reach the open mic runner", async ({ page }) => {
    await page.goto("/dashboard/events/open-mic");
    await expect(page.getByRole("heading", { name: "Open Mic", level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Admin access required")).toHaveCount(0);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
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
