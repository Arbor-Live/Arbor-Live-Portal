import { test, expect } from "@playwright/test";
import { crewAuthFile } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { runConvex } from "../helpers/convex";

test.describe("crew availability only part", () => {
  test.use({ storageState: crewAuthFile });

  test("picking setup and strike keeps both when the event has a section on another day", async ({ page }) => {
    const crew = runConvex("e2eHelpers:ensureCrewUser", {
      email: e2eEnv.crewEmail,
      password: e2eEnv.crewPassword,
      name: e2eEnv.crewName,
    }) as { userId: string };
    runConvex("e2eHelpers:resetCrewAvailability", { userId: crew.userId, clearNights: true });
    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Only Part ${Date.now()}`,
      daysAhead: 9,
      startTime: "19:00",
      endTime: "21:00",
      setupDaysBefore: 2,
    }) as { title: string };

    await page.goto("/dashboard/events/my-availability");
    const night = page.getByRole("main").getByTestId("crew-night").filter({ hasText: seeded.title });
    await expect(night).toBeVisible({ timeout: 25_000 });
    await night.getByRole("radio", { name: "Only part" }).click();

    const form = night.getByTestId("crew-night-part");
    const setup = form.getByRole("button", { name: "Setup 5:00 PM–7:00 PM" });
    const strike = form.getByRole("button", { name: "Strike 9:00 PM–10:00 PM" });
    await strike.click();
    await expect(strike).toHaveAttribute("aria-pressed", "true");
    await setup.click();
    await expect(strike).toHaveAttribute("aria-pressed", "true");
    await expect(setup).toHaveAttribute("aria-pressed", "true");
    await expect(form).toContainText("You're free 5:00 PM–7:00 PM and 9:00 PM–10:00 PM");
    // The setup two days earlier can't be written as a time on this night.
    await expect(form.getByRole("button", { name: "Setup 3:00 PM–4:30 PM" })).toHaveCount(0);

    await form.getByRole("button", { name: "Save" }).click();
    await expect(night).toContainText("Free 5:00 PM–7:00 PM, 9:00 PM–10:00 PM", { timeout: 20_000 });
  });
});
