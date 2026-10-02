import { test, expect, type Locator, type Page } from "@playwright/test";
import { acceptAppDialog, bandAuthFile, dismissAppDialog } from "../helpers/auth";
import { runConvex } from "../helpers/convex";
import { getLatestEmailNotification } from "../helpers/email";
import { formField } from "../helpers/form";
import { waitForInvitationState } from "../helpers/users";

/**
 * Artist-org self-service on the Team tab (`/dashboard/artists/team`): invite a teammate, resend
 * the same pending row, then remove it. Retyping the email at the top used to
 * be the only way to resend; cancelling was not available at all.
 */
async function openTeam(page: Page) {
  await page.goto("/dashboard/artists/team");
  const team = page.getByTestId("artist-team");
  await expect(team).toBeVisible({ timeout: 30_000 });
  return team;
}

async function sendInvite(page: Page, email: string, options?: { role?: string }) {
  await page.getByRole("button", { name: "Invite member" }).click();
  const dialog = page.getByTestId("artist-invite-dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await formField(dialog, "Email address").fill(email);
  if (options?.role) await formField(dialog, "Role").fill(options.role);
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  return dialog;
}

async function removeInvite(page: Page, inviteRow: Locator) {
  await inviteRow.getByRole("button", { name: /More for the invitation/ }).click();
  await page.getByRole("menuitem", { name: "Remove invitation" }).click();
}

test.describe("artist page invite lifecycle", () => {
  test.use({ storageState: bandAuthFile });
  test.setTimeout(180_000);

  const stamp = Date.now();
  const inviteEmail = `e2e-artist-invite-${stamp}@arborlive.test`;
  const dismissEmail = `e2e-artist-invite-dismiss-${stamp}@arborlive.test`;
  const mismatchEmail = `e2e-artist-invite-mismatch-${stamp}@arborlive.test`;

  test.afterAll(() => {
    runConvex("e2eHelpers:deleteInvitationsByEmail", { email: inviteEmail });
    runConvex("e2eHelpers:deleteInvitationsByEmail", { email: dismissEmail });
    runConvex("e2eHelpers:deleteInvitationsByEmail", { email: mismatchEmail });
  });

  test("artist invites, resends, then removes a pending teammate", async ({ page }) => {
    const team = await openTeam(page);
    await expect(team.getByText("Pending invitations")).toBeVisible();

    await sendInvite(page, inviteEmail, { role: "Vocals" });
    await expect(page.getByText(`Invitation sent to ${inviteEmail}.`)).toBeVisible({
      timeout: 30_000,
    });

    const invited = await waitForInvitationState(inviteEmail, (state) => state?.status === "pending");
    expect(invited.role).toBe("org_member");
    expect(invited.hasPendingToken).toBe(true);
    expect(invited.pendingRole).toBe("org_member");

    const inviteRow = page.getByTestId(`artist-invite-row-${invited.invitationId}`);
    await expect(inviteRow).toContainText(inviteEmail, { timeout: 30_000 });
    await expect(inviteRow.getByRole("button", { name: "Resend" })).toBeVisible();
    await expect(inviteRow).toContainText("Vocals");

    const firstEmail = await waitForInviteEmail(inviteEmail, 0);
    expect(firstEmail.template).toBe("user_invite");

    const resendAfter = Date.now();
    await inviteRow.getByRole("button", { name: "Resend" }).click();
    await expect(page.getByText(`Invitation resent to ${inviteEmail}.`)).toBeVisible({
      timeout: 30_000,
    });
    const resentEmail = await waitForInviteEmail(inviteEmail, resendAfter);
    expect(resentEmail.template).toBe("user_invite");
    const resent = await waitForInvitationState(
      inviteEmail,
      (state) => (state?.expiresAt ?? 0) > invited.expiresAt,
    );
    expect(resent.status).toBe("pending");
    expect(resent.invitationId).toBe(invited.invitationId);
    expect(resent.hasPendingToken).toBe(true);

    await removeInvite(page, inviteRow);
    await acceptAppDialog(page, "Remove");
    await expect(page.getByText(`Invitation removed for ${inviteEmail}.`)).toBeVisible({
      timeout: 30_000,
    });
    const cancelled = await waitForInvitationState(
      inviteEmail,
      (state) => state?.status === "cancelled",
    );
    expect(cancelled.hasPendingToken).toBe(false);
    await expect(page.getByTestId(`artist-invite-row-${invited.invitationId}`)).toHaveCount(0);
  });

  test("dismissing the remove confirm leaves the invite pending", async ({ page }) => {
    await openTeam(page);

    await sendInvite(page, dismissEmail);
    await expect(page.getByText(`Invitation sent to ${dismissEmail}.`)).toBeVisible({
      timeout: 30_000,
    });

    const seeded = await waitForInvitationState(dismissEmail, (state) => state?.status === "pending");
    const inviteRow = page.getByTestId(`artist-invite-row-${seeded.invitationId}`);
    await expect(inviteRow).toBeVisible({ timeout: 30_000 });

    await removeInvite(page, inviteRow);
    await dismissAppDialog(page);

    const after = await waitForInvitationState(dismissEmail, (state) => state?.status === "pending");
    expect(after.status).toBe("pending");
    expect(after.hasPendingToken).toBe(true);
    await expect(inviteRow).toBeVisible();
  });

  test("retyping a pending email with a different access level is refused", async ({ page }) => {
    await openTeam(page);

    await sendInvite(page, mismatchEmail);
    await expect(page.getByText(`Invitation sent to ${mismatchEmail}.`)).toBeVisible({
      timeout: 30_000,
    });
    const seeded = await waitForInvitationState(
      mismatchEmail,
      (state) => state?.status === "pending",
    );
    expect(seeded.role).toBe("org_member");

    await page.getByRole("button", { name: "Invite member" }).click();
    const dialog = page.getByTestId("artist-invite-dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await formField(dialog, "Email address").fill(mismatchEmail);
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "Admin", exact: true }).click();
    await dialog.getByRole("button", { name: "Send invitation" }).click();
    await expect(dialog.getByText("Invitation not sent")).toBeVisible({ timeout: 30_000 });
    await expect(
      dialog.getByText("Remove it before sending a different access level."),
    ).toBeVisible();

    const after = await waitForInvitationState(
      mismatchEmail,
      (state) => state?.status === "pending",
    );
    expect(after.invitationId).toBe(seeded.invitationId);
    expect(after.role).toBe("org_member");
  });
});

/**
 * Wait for an invite email. Accepts `queued` as well as `sent` on purpose:
 * delivery runs through a scheduled action and, under `E2E_EMAIL_MOCK`, there is
 * no Resend id to wait for — what this spec asserts is that inviting enqueued
 * one at all. `email/email-queue.spec.ts` owns the delivery pipeline.
 */
async function waitForInviteEmail(to: string, afterCreatedAt: number) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const row = getLatestEmailNotification({ to, template: "user_invite", afterCreatedAt });
    if (row) return row;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for a user_invite email to ${to}`);
}
