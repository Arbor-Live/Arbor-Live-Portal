import { test, expect, type Page } from "@playwright/test";
import { crewAuthFile, signInWithCredentials } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { runConvex } from "../helpers/convex";
import { callConvexAs } from "../helpers/convexCall";

/**
 * The Operations team books acts and runs events end to end: they edit every
 * event (not just the ones they lead), work the Ops Center, and stay out of the
 * admin-only areas (users, crew applications, settings).
 */
const opsEmail = "e2e-ops@arborlive.test";
const opsPassword = e2eEnv.crewPassword;

type SeededEvent = { eventId: string; path: string; title: string };

async function signInAsOps(page: Page) {
  await signInWithCredentials(page, opsEmail, opsPassword);
}

test.describe("Operations team access", () => {
  // Signs in as the Operations user itself instead of reusing the admin session.
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(() => {
    runConvex("e2eHelpers:ensureCrewUser", {
      email: opsEmail,
      password: opsPassword,
      name: "E2E Operations",
      verticals: ["Operations"],
    });
  });

  test("ops edits an event they don't lead", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Ops Edit ${Date.now()}`,
    }) as SeededEvent;
    await signInAsOps(page);

    const nextTitle = `${seeded.title} by Ops`;
    await page.goto(seeded.path);
    await expect(page.getByTestId("event-workspace")).toBeVisible({ timeout: 45_000 });
    const titleInput = page.getByTestId("event-title-input");
    await expect(titleInput).toBeVisible({ timeout: 30_000 });
    await titleInput.fill(nextTitle);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/Saved/i).first()).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await expect(page.getByTestId("event-title-input")).toHaveValue(nextTitle, { timeout: 30_000 });
  });

  test("ops gets the Ops Center and booking areas, not the admin ones", async ({ page }) => {
    await signInAsOps(page);
    await page.goto("/dashboard/financial-hub");
    await expect(page.getByTestId("attention-booking-requests")).toBeVisible({ timeout: 30_000 });
    // Crew payroll and settings stay admin-only.
    await expect(page.getByTestId("attention-timecards")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);

    for (const path of [
      "/dashboard/users/artist-applications",
      "/dashboard/events/venues",
      "/dashboard/events/crew-scheduling",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/(Admin|Operations) access required/)).toHaveCount(0);
      await expect(page.getByText("Something went wrong")).toHaveCount(0);
    }

    await page.goto("/dashboard/users/crew-applications");
    await expect(page.getByText("Admin access required").first()).toBeVisible({ timeout: 30_000 });

    const sidebar = page.locator('[data-slot="sidebar"]').first();
    await expect(sidebar.getByRole("button", { name: "Ops Center", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Users", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name: "Users", exact: true })).toHaveCount(0);
  });

  test("convex grants ops their work and still refuses admin-only calls", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Ops Api ${Date.now()}`,
    }) as SeededEvent;
    await signInAsOps(page);

    for (const path of ["bandApplications:listAdmin", "users:listBandOrganizationsAdmin", "invoiceGroups:listForAdmin"]) {
      const result = await callConvexAs(page, "query", path, {});
      expect(result.status, `${path} should succeed for Operations`).toBe("success");
    }
    const edit = await callConvexAs(page, "mutation", "events:update", {
      id: seeded.eventId,
      notes: "Edited by Operations",
    });
    expect(edit.status).toBe("success");

    for (const path of ["crewApplications:listAdmin", "users:listUsersForAdmin"]) {
      const result = await callConvexAs(page, "query", path, {});
      expect(result.status, `${path} should stay admin-only`).toBe("error");
    }
    const remove = await callConvexAs(page, "mutation", "events:deleteEvent", { id: seeded.eventId });
    expect(remove.status).toBe("error");
  });
});

test.describe("crew without the Operations team", () => {
  test.use({ storageState: crewAuthFile });

  test("cannot edit an event they don't lead", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Crew Edit ${Date.now()}`,
    }) as SeededEvent;
    await page.goto("/dashboard");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });

    const result = await callConvexAs(page, "mutation", "events:update", {
      id: seeded.eventId,
      notes: "Edited by crew",
    });
    expect(result.status).toBe("error");
    expect(result.errorMessage ?? "").toMatch(/permission to edit this event/i);
  });
});
