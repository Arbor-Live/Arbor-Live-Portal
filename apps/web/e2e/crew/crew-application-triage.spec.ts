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

  test("admin can assign a trainee from the event's crew board", async ({ page }) => {
    const seededEvent = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Event Trainee ${Date.now()}`,
      traineeReady: true,
    }) as { eventId: string; title: string };
    const seeded = seedApplication("Event Trainee");

    await page.goto(`/dashboard/events/${seededEvent.eventId}/schedule`);
    const trainees = page.getByTestId("crew-trainees");
    await expect(trainees).toBeVisible({ timeout: 30_000 });
    await trainees.getByRole("button", { name: "Assign trainee" }).click();

    const dialog = page.getByTestId("assign-trainee-dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByTestId("searchable-select-trigger").first().click();
    const menu = page.getByTestId("searchable-select-menu");
    await expect(menu).toBeVisible({ timeout: 20_000 });
    await fillSearchableSelectQuery(menu, seeded.name);
    await menu.getByRole("option", { name: new RegExp(seeded.name) }).first().click();

    await expect(dialog.getByTestId("date-time-picker")).not.toHaveAttribute("data-value", "", {
      timeout: 30_000,
    });
    await dialog.getByRole("button", { name: "Assign trainee" }).click();

    const state = await pollConvex<ApplicationState>(
      "e2eHelpers:getCrewApplicationState",
      { applicationId: seeded.applicationId },
      (row) => row?.status === "trainee",
    );
    expect(state.traineeShiftEventIds).toContain(seededEvent.eventId);
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    // Pulled into the board without a reload, and not left as an unsaved change.
    await expect(trainees).toContainText(seeded.name, { timeout: 20_000 });
  });

  test("an event missing its venue and lead is fixed from the dialog, then the trainee is assigned", async ({ page }) => {
    const stamp = Date.now();
    const seededEvent = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Unready Trainee Event ${stamp}`,
    }) as { eventId: string; title: string };

    const seeded = seedApplication("Unready");
    const sheet = await openSheet(page, seeded);
    const form = sheet.getByTestId("crew-application-trainee-form");

    await form.getByTestId("searchable-select-trigger").first().click();
    const eventMenu = page.getByTestId("searchable-select-menu");
    await fillSearchableSelectQuery(eventMenu, seededEvent.title);
    await eventMenu.getByRole("option", { name: seededEvent.title }).first().click();

    // Warned as soon as the event is picked, before Assign.
    await expect(form.getByTestId("trainee-readiness-missing")).toBeVisible({ timeout: 20_000 });
    await expect(form.getByTestId("date-time-picker")).not.toHaveAttribute("data-value", "", {
      timeout: 30_000,
    });

    // Assign opens the fix dialog instead of failing.
    await sheet.getByRole("button", { name: "Assign as trainee" }).click();
    const dialog = page.getByTestId("trainee-readiness-dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Venue: create one with its address from the picker.
    const venueName = `E2E Trainee Fix Venue ${stamp}`;
    await dialog.getByTestId("trainee-readiness-venue").getByTestId("searchable-select-trigger").click();
    const venueMenu = page.getByTestId("searchable-select-menu");
    await fillSearchableSelectQuery(venueMenu, venueName);
    await venueMenu.getByRole("button", { name: /Create venue/i }).click();
    const createDialog = page.getByTestId("venue-create-dialog");
    await createDialog.getByLabel("Address").fill("450 Serra Mall, Stanford, CA 94305");
    await createDialog.getByRole("button", { name: /Create & select/i }).click();
    await expect(dialog.getByTestId("trainee-readiness-venue")).toContainText("450 Serra Mall", {
      timeout: 20_000,
    });

    // Contact: make the admin the event lead, adding a phone if their profile lacks one.
    const contact = dialog.getByTestId("trainee-readiness-contact");
    await contact.getByTestId("searchable-select-trigger").click();
    const staffMenu = page.getByTestId("searchable-select-menu");
    await fillSearchableSelectQuery(staffMenu, "E2E Admin");
    await staffMenu.getByRole("option", { name: /E2E Admin/ }).first().click();
    const phone = contact.getByLabel(/Phone for/);
    await expect(phone.or(contact.getByText(/is their contact/))).toBeVisible({ timeout: 20_000 });
    if (await phone.isVisible()) {
      await phone.fill("6505550123");
      await contact.getByRole("button", { name: "Save phone" }).click();
    }
    await expect(contact).toContainText("is their contact", { timeout: 20_000 });

    await dialog.getByRole("button", { name: "Assign as trainee" }).click();
    const state = await pollConvex<ApplicationState>(
      "e2eHelpers:getCrewApplicationState",
      { applicationId: seeded.applicationId },
      (row) => row?.status === "trainee",
    );
    expect(state.traineeShiftEventIds).toContain(seededEvent.eventId);
  });

  test("a trainee moves to Decision needed once their training is over", async ({ page }) => {
    const stamp = Date.now();
    const done = `E2E Trained ${stamp}`;
    const upcoming = `E2E Training Soon ${stamp}`;
    runConvex("e2eHelpers:seedTraineeApplication", { name: done, trainingEnded: true });
    runConvex("e2eHelpers:seedTraineeApplication", { name: upcoming, trainingEnded: false });

    await page.goto("/dashboard/users/crew-applications");
    await expect(page.getByTestId("crew-applications-page")).toBeVisible({ timeout: 25_000 });
    const decisionGroup = page.getByTestId("crew-applications-group-decision_needed");
    await expect(decisionGroup).toContainText(done, { timeout: 25_000 });
    await expect(decisionGroup).not.toContainText(upcoming);
    await expect(page.getByTestId("crew-applications-group-trainee")).toContainText(upcoming);

    await decisionGroup.getByRole("button", { name: new RegExp(done) }).first().click();
    const sheet = page.getByTestId("crew-application-sheet");
    await expect(sheet.getByText("Decision needed").first()).toBeVisible({ timeout: 20_000 });
    await expect(sheet.getByTestId("crew-application-training-ends")).toContainText("Training ended");
  });
});
