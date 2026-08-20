import { test, expect, type Locator, type Page } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";
import { fillSearchableSelectQuery } from "../helpers/select";

type SeededApplication = {
  applicationId: string;
  name: string;
  email: string;
  queuePath: string;
};

type ApplicationState = {
  status: string;
  convertedUserId: string | null;
  traineeShiftCount: number;
  traineeShiftEventIds: string[];
};

function seedApplication(label: string): SeededApplication {
  return runConvex("e2eHelpers:seedSubmittedCrewApplication", {
    name: `E2E ${label} ${Date.now()}`,
  }) as SeededApplication;
}

/** Open the Submitted queue and return the card for one applicant. */
async function openSubmittedCard(page: Page, seeded: SeededApplication): Promise<Locator> {
  await page.goto(seeded.queuePath);
  await expect(page.getByText(/Crew applications/i).first()).toBeVisible({ timeout: 25_000 });
  await page.getByRole("button", { name: "Submitted" }).click();

  const card = page.locator("article").filter({ hasText: seeded.name }).first();
  await expect(card).toBeVisible({ timeout: 25_000 });
  return card;
}

test.describe("crew application triage", () => {
  test("admin can turn away a submitted application", async ({ page }) => {
    const seeded = seedApplication("Turn Away");
    const card = await openSubmittedCard(page, seeded);

    await card.getByRole("button", { name: "Turn away" }).click();

    const state = await pollConvex<ApplicationState>(
      "e2eHelpers:getCrewApplicationState",
      { applicationId: seeded.applicationId },
      (row) => row?.status === "closed",
    );
    expect(state.status).toBe("closed");

    // Closed applications drop out of the Submitted queue.
    await expect(page.locator("article").filter({ hasText: seeded.name })).toHaveCount(0, {
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Closed" }).click();
    await expect(page.getByText(seeded.name).first()).toBeVisible({ timeout: 20_000 });
  });

  test("admin can convert an applicant to a member and an invite is created", async ({ page }) => {
    const seeded = seedApplication("Convert");
    const card = await openSubmittedCard(page, seeded);

    // Vertical/discipline default from the application; take the defaults.
    await card.getByRole("button", { name: "Convert to member" }).click();

    const state = await pollConvex<ApplicationState>(
      "e2eHelpers:getCrewApplicationState",
      { applicationId: seeded.applicationId },
      (row) => row?.status === "converted",
    );
    expect(state.status).toBe("converted");

    const invite = await pollConvex<{ url: string; token: string }>(
      "e2eHelpers:getInviteAcceptUrl",
      { email: seeded.email },
      (row) => Boolean(row?.token),
    );
    expect(invite.url).toContain(invite.token);

    await page.getByRole("button", { name: "Converted" }).click();
    await expect(page.getByText(seeded.name).first()).toBeVisible({ timeout: 20_000 });
  });

  test("admin can assign a submitted applicant as a trainee on an event", async ({ page }) => {
    const seededEvent = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Trainee Event ${Date.now()}`,
      // Trainee intro needs a venue address plus a manager contact.
      traineeReady: true,
    }) as { eventId: string; title: string };

    const seeded = seedApplication("Trainee");
    const card = await openSubmittedCard(page, seeded);

    await card.getByTestId("searchable-select-trigger").first().click();
    const menu = page.getByTestId("searchable-select-menu");
    await expect(menu).toBeVisible({ timeout: 20_000 });
    await fillSearchableSelectQuery(menu, seededEvent.title);
    await menu.getByRole("option", { name: seededEvent.title }).first().click();

    await expect(card.getByText("Presence")).toBeVisible({ timeout: 20_000 });
    // Call time stays blank until `events.get` resolves; assigning before that
    // fails with "Enter a call time."
    await expect(card.getByTestId("date-time-picker")).not.toHaveAttribute("data-value", "", {
      timeout: 30_000,
    });

    const assign = card.getByRole("button", { name: "Assign as trainee" });
    await expect(assign).toBeEnabled({ timeout: 20_000 });
    await assign.click();

    const state = await pollConvex<ApplicationState>(
      "e2eHelpers:getCrewApplicationState",
      { applicationId: seeded.applicationId },
      (row) => row?.status === "trainee",
    );
    expect(state.status).toBe("trainee");
    expect(state.traineeShiftCount).toBe(1);
    expect(state.traineeShiftEventIds).toContain(seededEvent.eventId);
  });
});
