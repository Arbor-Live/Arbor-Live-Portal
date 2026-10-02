import { test, expect, type Locator, type Page } from "@playwright/test";
import { acceptAppDialog } from "../helpers/auth";
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
  assigneeUserId: string | null;
  outreachStage: string | null;
  traineeShiftCount: number;
  traineeShiftEventIds: string[];
};

function seedApplication(label: string): SeededApplication {
  return runConvex("e2eHelpers:seedSubmittedCrewApplication", {
    name: `E2E ${label} ${Date.now()}`,
  }) as SeededApplication;
}

/** The applicant's row in the list (open applications show by default). */
async function findRow(page: Page, seeded: SeededApplication): Promise<Locator> {
  await page.goto(seeded.queuePath);
  await expect(page.getByTestId("crew-applications-page")).toBeVisible({ timeout: 25_000 });
  const row = page.getByTestId("crew-application-row").filter({ hasText: seeded.name }).first();
  await expect(row).toBeVisible({ timeout: 25_000 });
  return row;
}

/** Open the applicant's side panel. */
async function openSheet(page: Page, seeded: SeededApplication): Promise<Locator> {
  const row = await findRow(page, seeded);
  await row.getByRole("button", { name: new RegExp(seeded.name) }).first().click();
  const sheet = page.getByTestId("crew-application-sheet");
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  return sheet;
}

test.describe("crew application triage", () => {
  test("marking an applicant reached out makes the admin the owner", async ({ page }) => {
    const seeded = seedApplication("Outreach");
    const row = await findRow(page, seeded);
    await expect(page.getByTestId("crew-applications-group-new")).toContainText(seeded.name);

    await row.getByRole("button", { name: "Mark reached out" }).click();

    const state = await pollConvex<ApplicationState>(
      "e2eHelpers:getCrewApplicationState",
      { applicationId: seeded.applicationId },
      (current) => current?.outreachStage === "contacted",
    );
    expect(state.assigneeUserId).toBeTruthy();
    await expect(page.getByTestId("crew-applications-group-contacted")).toContainText(seeded.name, {
      timeout: 20_000,
    });

    // Later steps keep the owner.
    const sheet = await openSheet(page, seeded);
    await sheet.getByTestId("crew-application-stage").getByRole("radio", { name: "Meeting booked" }).click();
    const booked = await pollConvex<ApplicationState>(
      "e2eHelpers:getCrewApplicationState",
      { applicationId: seeded.applicationId },
      (current) => current?.outreachStage === "meeting_booked",
    );
    expect(booked.assigneeUserId).toBe(state.assigneeUserId);
  });

  test("admin can turn away a submitted application", async ({ page }) => {
    const seeded = seedApplication("Turn Away");
    const sheet = await openSheet(page, seeded);

    await sheet.getByRole("button", { name: "Turn away" }).click();
    await acceptAppDialog(page, "Turn away");

    const state = await pollConvex<ApplicationState>(
      "e2eHelpers:getCrewApplicationState",
      { applicationId: seeded.applicationId },
      (row) => row?.status === "closed",
    );
    expect(state.status).toBe("closed");

    // Turned-away applications drop out of the default (open) view.
    await expect(
      page.getByTestId("crew-application-row").filter({ hasText: seeded.name }),
    ).toHaveCount(0, { timeout: 20_000 });
  });

  test("admin can convert an applicant to a member and an invite is created", async ({ page }) => {
    const seeded = seedApplication("Convert");
    const sheet = await openSheet(page, seeded);

    // Vertical/discipline default from the application; take the defaults.
    await sheet.getByRole("radio", { name: "Convert to member" }).click();
    await sheet.getByRole("button", { name: "Convert to member" }).click();

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
  });

  test("admin can assign a submitted applicant as a trainee on an event", async ({ page }) => {
    const seededEvent = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Trainee Event ${Date.now()}`,
      // Trainee intro needs a venue address plus a manager contact.
      traineeReady: true,
    }) as { eventId: string; title: string };

    const seeded = seedApplication("Trainee");
    const sheet = await openSheet(page, seeded);
    // Trainee is the default decision for a submitted applicant.
    const card = sheet.getByTestId("crew-application-trainee-form");

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

    const assign = sheet.getByRole("button", { name: "Assign as trainee" });
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
