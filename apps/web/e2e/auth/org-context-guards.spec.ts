import { test, expect } from "@playwright/test";
import { bandAuthFile } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { runConvex } from "../helpers/convex";

/**
 * Org-*type* separation, which is a different axis from role. The band payee is
 * not an Arbor member at all, so they should be stopped by `ArborOnlyGuard`
 * before role ever comes into it.
 */
const arborOnlyRoutes = [
  "/dashboard/events/venues",
  "/dashboard/users/crew-applications",
  "/dashboard/financial-hub",
] as const;

/** Payments stay band-org-only; profile/riders are shared with portal admins. */
const bandOnlyRoutes = ["/dashboard/bands-and-performers/payments"] as const;

const bandOrAdminRoutes = [
  "/dashboard/bands-and-performers",
  "/dashboard/bands-and-performers/riders",
] as const;

test.describe("band user on Arbor-only routes", () => {
  test.use({ storageState: bandAuthFile });

  test.beforeAll(() => {
    runConvex("e2eHelpers:ensureBandPayeeUser", {
      email: e2eEnv.bandEmail,
      password: e2eEnv.bandPassword,
      name: e2eEnv.bandName,
      bandName: e2eEnv.bandOrgName,
    });
  });

  for (const path of arborOnlyRoutes) {
    test(`band org is refused on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText("Arbor Internal Only").first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Something went wrong")).toHaveCount(0);
    });
  }
});

test.describe("admin on band-only payment routes", () => {
  for (const path of bandOnlyRoutes) {
    test(`Arbor admin is refused on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText("Band Organization Only").first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Something went wrong")).toHaveCount(0);
    });
  }
});

test.describe("admin reaches shared band routes", () => {
  for (const path of bandOrAdminRoutes) {
    test(`Arbor admin reaches ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText("Band Organization Only")).toHaveCount(0, {
        timeout: 30_000,
      });
      await expect(page.getByText("Admin access required")).toHaveCount(0);
      await expect(page.getByText("Something went wrong")).toHaveCount(0);
      await expect(page.getByText("Manage a band").first()).toBeVisible({
        timeout: 30_000,
      });
    });
  }
});

test.describe("band user reaches their own routes", () => {
  test.use({ storageState: bandAuthFile });

  // Control: the guards must not be refusing everyone everywhere.
  for (const path of [...bandOnlyRoutes, ...bandOrAdminRoutes]) {
    test(`band org still reaches ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText("Band Organization Only")).toHaveCount(0, {
        timeout: 30_000,
      });
      await expect(page.getByText("Arbor Internal Only")).toHaveCount(0);
      await expect(page.getByText("Admin access required")).toHaveCount(0);
    });
  }
});
