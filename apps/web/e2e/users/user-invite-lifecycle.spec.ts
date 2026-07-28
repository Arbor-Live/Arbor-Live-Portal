import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { getLatestEmailNotification } from "../helpers/email";
import { checkboxByLabel, formField, selectByLabel } from "../helpers/form";
import { pickSelectOption } from "../helpers/select";
import { waitForInvitationState } from "../helpers/users";

/**
 * The Users invite UI, end to end.
 *
 * Every earlier batch that needed an invite minted one with
 * `e2eHelpers:createPendingInvite`, so `inviteUserAdmin` and the whole
 * pending/edit/resend/cancel surface shipped with no coverage at all — and it
 * writes to two places at once: a better-auth `invitation` (status, role) and a
 * `pendingUserInvites` row (token, verticals, rate mode, payroll method). The
 * accept link and the invite email are both built from the second, so this
 * asserts both.
 */
test.describe("user invite lifecycle", () => {
  // Four mutations, each with a Convex round trip, plus two email waits.
  test.setTimeout(180_000);

  // A stamped address per run, for two reasons: `inviteUserAdmin` treats an
  // email that already has a user as an accepted invite, and
  // `resendInviteAdmin` updates the invitation `where: email` rather than by
  // id, so a leftover invitation for the same address would make resend
  // ambiguous.
  const stamp = Date.now();
  const inviteEmail = `e2e-invite-${stamp}@arborlive.test`;
  const declineEmail = `e2e-invite-decline-${stamp}@arborlive.test`;

  test.afterAll(() => {
    // Invitations are not events, so `pruneE2eSeedData` never reclaims them,
    // and `listInvitationsAdmin` pages with `.take(2000)`.
    runConvex("e2eHelpers:deleteInvitationsByEmail", { email: inviteEmail });
    runConvex("e2eHelpers:deleteInvitationsByEmail", { email: declineEmail });
  });

  test("admin invites, edits, resends, then cancels", async ({ page }) => {
    await page.goto("/dashboard/users/access");
    await expect(page.getByText("User Access & Invitations")).toBeVisible({ timeout: 30_000 });

    const usersCard = page
      .locator("[data-slot='card']")
      .filter({ has: page.getByText("Users", { exact: true }) });
    const invitationsCard = page
      .locator("[data-slot='card']")
      .filter({ has: page.getByText("Invitations", { exact: true }) });

    // The invite is scoped to the shared organization filter above Users.
    // Arbor Live is the default (arbor_internal), which unlocks Member/Admin
    // plus rate and payroll fields on the invite form.
    await expect(usersCard.locator("[data-slot='select-trigger']").first()).toHaveText(
      "Arbor Live",
      { timeout: 30_000 },
    );

    await usersCard.getByRole("button", { name: "Invite User" }).click();

    const modal = page.getByTestId("invite-user-modal");
    await expect(modal).toBeVisible({ timeout: 20_000 });

    await formField(modal, "Email").fill(inviteEmail);
    await checkboxByLabel(modal, "Crew").check();
    await checkboxByLabel(modal, "Sound").check();

    // Custom is the only rate mode that carries a number onto the pending
    // invite, so it is the one worth driving.
    await pickSelectOption(page, selectByLabel(modal, "Rate"), "Custom");
    await pickSelectOption(page, selectByLabel(modal, "Payment method"), "External payroll");
    await formField(modal, "Custom hourly rate (USD)").fill("47");

    await modal.getByRole("button", { name: "Send Invite" }).click();
    await expect(page.getByText("Invite sent.")).toBeVisible({ timeout: 30_000 });

    const invited = await waitForInvitationState(inviteEmail, (state) => state?.status === "pending");
    expect(invited.role).toBe("member");
    expect(invited.hasPendingToken).toBe(true);
    expect(invited.pendingVerticals).toContain("Crew");
    expect(invited.pendingDisciplines).toContain("Sound");
    expect(invited.pendingRateMode).toBe("custom");
    expect(invited.pendingCustomHourlyRateUsd).toBe(47);
    expect(invited.pendingPayrollMethod).toBe("external");

    const inviteRow = page.getByTestId(`invite-row-${invited.invitationId}`);
    await expect(inviteRow).toContainText(inviteEmail, { timeout: 30_000 });
    await expect(inviteRow).toContainText("pending");

    // The invite email is what makes the invite usable at all.
    const firstEmail = await waitForInviteEmail(inviteEmail, 0);
    expect(firstEmail.template).toBe("user_invite");

    // Edit: promote the pending invite to admin. `updateInviteAdmin` writes the
    // role to both the invitation and the pending row, and it is the pending
    // row that `/accept-invite` reads — so checking only the invitation would
    // miss an invite that accepts as the wrong role.
    await inviteRow.getByRole("button", { name: "Edit" }).click();
    const editModal = page.getByTestId("edit-invite-modal");
    await expect(editModal).toBeVisible({ timeout: 20_000 });
    await pickSelectOption(page, selectByLabel(editModal, "Role"), "Admin");
    await editModal.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Invitation updated.")).toBeVisible({ timeout: 30_000 });
    const edited = await waitForInvitationState(inviteEmail, (state) => state?.role === "admin");
    expect(edited.pendingRole).toBe("admin");
    expect(edited.status).toBe("pending");
    await expect(inviteRow).toContainText("admin", { timeout: 30_000 });

    // Resend: another email, and a pushed-out expiry.
    const resendAfter = Date.now();
    await inviteRow.getByRole("button", { name: "Resend" }).click();
    await expect(page.getByText("Invite resent.")).toBeVisible({ timeout: 30_000 });
    const resentEmail = await waitForInviteEmail(inviteEmail, resendAfter);
    expect(resentEmail.template).toBe("user_invite");
    const resent = await waitForInvitationState(
      inviteEmail,
      (state) => (state?.expiresAt ?? 0) > edited.expiresAt,
    );
    expect(resent.status).toBe("pending");

    // Cancel sits behind a `window.confirm`, which Playwright dismisses by
    // default — without this the mutation never runs and the poll below times
    // out waiting for a change nobody requested.
    page.once("dialog", (dialog) => void dialog.accept());
    await inviteRow.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByText(`Invitation cancelled for ${inviteEmail}.`)).toBeVisible({
      timeout: 30_000,
    });
    const cancelled = await waitForInvitationState(
      inviteEmail,
      (state) => state?.status === "cancelled",
    );
    // Cancelling has to revoke the token, not just flip the status: the accept
    // link resolves through the pending row, so leaving it behind would leave a
    // cancelled invite redeemable.
    expect(cancelled.hasPendingToken).toBe(false);

    // Default status filter is Pending, so cancelled rows drop out of the table
    // until the operator switches the filter.
    await pickSelectOption(page, selectByLabel(invitationsCard, "Status Filter"), "Cancelled");

    const cancelledInviteRow = page.getByTestId(`invite-row-${invited.invitationId}`);
    await expect(cancelledInviteRow).toContainText("cancelled", { timeout: 30_000 });
    await expect(cancelledInviteRow.getByRole("button", { name: "Resend" })).toHaveCount(0);
    await expect(cancelledInviteRow.getByRole("button", { name: "Edit" })).toHaveCount(0);
  });

  test("dismissing the cancel confirm leaves the invite pending", async ({ page }) => {
    runConvex("e2eHelpers:createPendingInvite", { email: declineEmail });
    const seeded = await waitForInvitationState(declineEmail, (state) => state?.status === "pending");

    await page.goto("/dashboard/users/access");
    const inviteRow = page.getByTestId(`invite-row-${seeded.invitationId}`);
    await expect(inviteRow).toContainText(declineEmail, { timeout: 30_000 });

    // Declining the confirm is the operator changing their mind, and it has to
    // be a no-op. This is also what proves the `accept()` above is load-bearing
    // rather than decorative.
    page.once("dialog", (dialog) => void dialog.dismiss());
    await inviteRow.getByRole("button", { name: "Cancel" }).click();

    await expect(inviteRow).toContainText("pending");
    const after = await waitForInvitationState(declineEmail, (state) => Boolean(state));
    expect(after.status).toBe("pending");
    expect(after.hasPendingToken).toBe(true);
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
