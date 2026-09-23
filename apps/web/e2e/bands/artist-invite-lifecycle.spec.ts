import { test, expect } from "@playwright/test";
import { acceptAppDialog, bandAuthFile, dismissAppDialog } from "../helpers/auth";
import { runConvex } from "../helpers/convex";
import { getLatestEmailNotification } from "../helpers/email";
import { formField } from "../helpers/form";
import { waitForInvitationState } from "../helpers/users";

/**
 * Artist-org self-service on `/dashboard/artists`: invite a teammate, resend
 * the same pending row, then remove it. Retyping the email at the top used to
 * be the only way to resend; cancelling was not available at all.
 */
test.describe("artist page invite lifecycle", () => {
  test.use({ storageState: bandAuthFile });
  test.setTimeout(180_000);

  const stamp = Date.now();
  const inviteEmail = `e2e-artist-invite-${stamp}@arborlive.test`;
  const dismissEmail = `e2e-artist-invite-dismiss-${stamp}@arborlive.test`;

  test.afterAll(() => {
    runConvex("e2eHelpers:deleteInvitationsByEmail", { email: inviteEmail });
    runConvex("e2eHelpers:deleteInvitationsByEmail", { email: dismissEmail });
  });

  test("artist invites, resends, then removes a pending teammate", async ({ page }) => {
    await page.goto("/dashboard/artists");
    const teamCard = page.getByTestId("artist-team-card");
    await expect(teamCard).toBeVisible({ timeout: 30_000 });
    await expect(teamCard.getByText("Pending invitations")).toBeVisible();

    await formField(teamCard, "Email address").fill(inviteEmail);
    await formField(teamCard, "Role").fill("Vocals");
    await teamCard.getByRole("button", { name: "Send invitation" }).click();
    await expect(teamCard.getByText(`Invitation sent to ${inviteEmail}.`)).toBeVisible({
      timeout: 30_000,
    });

    const invited = await waitForInvitationState(inviteEmail, (state) => state?.status === "pending");
    expect(invited.role).toBe("org_member");
    expect(invited.hasPendingToken).toBe(true);
    expect(invited.pendingRole).toBe("org_member");

    const inviteRow = page.getByTestId(`artist-invite-row-${invited.invitationId}`);
    await expect(inviteRow).toContainText(inviteEmail, { timeout: 30_000 });
    await expect(inviteRow.getByRole("button", { name: "Resend" })).toBeVisible();
    await expect(inviteRow.getByRole("button", { name: "Remove" })).toBeVisible();

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

    await inviteRow.getByRole("button", { name: "Remove" }).click();
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
    await page.goto("/dashboard/artists");
    const teamCard = page.getByTestId("artist-team-card");
    await expect(teamCard).toBeVisible({ timeout: 30_000 });

    await formField(teamCard, "Email address").fill(dismissEmail);
    await teamCard.getByRole("button", { name: "Send invitation" }).click();
    await expect(teamCard.getByText(`Invitation sent to ${dismissEmail}.`)).toBeVisible({
      timeout: 30_000,
    });

    const seeded = await waitForInvitationState(dismissEmail, (state) => state?.status === "pending");
    const inviteRow = page.getByTestId(`artist-invite-row-${seeded.invitationId}`);
    await expect(inviteRow).toBeVisible({ timeout: 30_000 });

    await inviteRow.getByRole("button", { name: "Remove" }).click();
    await dismissAppDialog(page);

    const after = await waitForInvitationState(dismissEmail, (state) => state?.status === "pending");
    expect(after.status).toBe("pending");
    expect(after.hasPendingToken).toBe(true);
    await expect(inviteRow).toBeVisible();
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
