import { test, expect } from "@playwright/test";
import { crewAuthFile } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { runConvex } from "../helpers/convex";

function ensureCleanCrew() {
  const crew = runConvex("e2eHelpers:ensureCrewUser", {
    email: e2eEnv.crewEmail,
    password: e2eEnv.crewPassword,
    name: e2eEnv.crewName,
  }) as { userId: string };
  runConvex("e2eHelpers:resetCrewAvailability", { userId: crew.userId, clearNights: true });
  runConvex("e2eHelpers:clearCrewShifts", { userId: crew.userId });
  return crew;
}

test.describe("crew Home to-do", () => {
  test.use({ storageState: crewAuthFile });

  test("answering a night clears its card, raises the next, and shows on My Availability", async ({ page }) => {
    ensureCleanCrew();
    const stamp = Date.now();
    const first = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Todo Soon ${stamp}`,
      daysAhead: 1,
    }) as { title: string };
    const second = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Todo Later ${stamp}`,
      daysAhead: 2,
    }) as { title: string };

    await page.goto("/dashboard");
    const main = page.getByRole("main");
    const card = main.getByTestId("crew-todo-card");
    await expect(card.getByText(first.title)).toBeVisible({ timeout: 30_000 });

    await card.getByRole("button", { name: "I'm free" }).click();
    await expect(main.getByTestId("crew-todo-card").getByText(first.title)).toHaveCount(0, { timeout: 20_000 });
    await expect(main.getByTestId("crew-todo-card").getByText(second.title)).toBeVisible();

    await page.goto("/dashboard/events/my-availability");
    await expect(
      page.getByRole("main").getByTestId("crew-night").filter({ hasText: first.title }).getByText("You: Free all night"),
    ).toBeVisible({ timeout: 25_000 });
  });

  test("Later moves a card back and keeps it in the count", async ({ page }) => {
    const crew = ensureCleanCrew();
    runConvex("e2eHelpers:seedEndedShowShift", { userId: crew.userId, title: `E2E Todo Ended ${Date.now()}` });

    await page.goto("/dashboard");
    const main = page.getByRole("main");
    const count = main.getByTestId("crew-todo-count");
    const card = main.getByTestId("crew-todo-card");
    await expect(card).toBeVisible({ timeout: 30_000 });
    const before = { count: await count.textContent(), card: await card.textContent() };

    await main.getByRole("button", { name: "Later" }).click();
    // The outgoing card is still in the DOM for its exit.
    await expect(card).toHaveCount(1);
    await expect(card).not.toHaveText(before.card!);
    await expect(count).toHaveText(before.count!);
  });

  test("a usual evening becomes the primary answer", async ({ page }) => {
    const crew = ensureCleanCrew();
    runConvex("e2eHelpers:seedUsualEvenings", { userId: crew.userId, level: "usually" });
    runConvex("e2eHelpers:seedCrewedEventWithSchedule", { title: `E2E Todo Usual ${Date.now()}`, daysAhead: 3 });

    await page.goto("/dashboard");
    const card = page.getByRole("main").getByTestId("crew-todo-card");
    await expect(card.getByText(/You're usually free \w+days/)).toBeVisible({ timeout: 30_000 });
    await expect(card.getByRole("button", { name: "Confirm" })).toBeVisible();
    runConvex("e2eHelpers:resetCrewAvailability", { userId: crew.userId, clearNights: true });
  });

  test("Customize keeps working, without the widgets the stack replaced", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard");
    const home = page.getByTestId("crewHome-dashboard");
    await home.getByRole("button", { name: "Customize" }).click();
    const customize = page.getByTestId("dashboard-customize");
    await expect(customize.getByRole("switch", { name: "Show Pay periods" })).toBeVisible();
    await expect(customize.getByRole("switch", { name: "Show Availability" })).toHaveCount(0);
    await expect(customize.getByRole("switch", { name: "Show Upcoming shifts" })).toHaveCount(0);
    await home.getByRole("button", { name: "Done" }).click();
    await expect(customize).toHaveCount(0);
  });

  test("phones keep the widgets and Customize behind Everything else", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    const main = page.getByRole("main");
    const trigger = main.getByRole("button", { name: "Everything else" });
    await expect(trigger).toBeVisible({ timeout: 30_000 });
    await expect(main.getByTestId("home-upcoming-shifts").locator("visible=true")).toHaveCount(0);
    await trigger.click();
    await expect(main.getByTestId("home-upcoming-shifts").locator("visible=true")).toHaveCount(1);
    await main.getByRole("button", { name: "Customize" }).locator("visible=true").click();
    await expect(page.getByTestId("dashboard-customize")).toBeVisible();
    await expect(main.getByRole("button", { name: "Reset layout" })).toBeVisible();
  });
});
