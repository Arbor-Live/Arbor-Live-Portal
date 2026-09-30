import { test, expect } from "@playwright/test";
import { acceptAppDialog, dismissAppDialog } from "../helpers/auth";
import { runConvex } from "../helpers/convex";
import { getLatestEmailNotification } from "../helpers/email";
import { formField, selectByLabel } from "../helpers/form";
import { pickSelectOption } from "../helpers/select";
import {
  closeSheet,
  listInvitationsByEmail,
  openAddPersonDialog,
  orgFilter,
  toggleFilter,
  waitForInvitationState,
} from "../helpers/users";

/**
 * The Users invite UI, end to end: Add person (invite mode), then the
 * Invitations tab's rows and side panel.
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
  const reinviteEmail = `e2e-reinvite-${stamp}@arborlive.test`;

  test.afterAll(() => {
    // Invitations are not events, so `pruneE2eSeedData` never reclaims them,
    // and `listInvitationsAdmin` pages with `.take(2000)`.
    runConvex("e2eHelpers:deleteInvitationsByEmail", { email: inviteEmail });
    runConvex("e2eHelpers:deleteInvitationsByEmail", { email: declineEmail });
    runConvex("e2eHelpers:deleteInvitationsByEmail", { email: reinviteEmail });
  });

  test("admin invites, edits, resends, then cancels", async ({ page }) => {
    await page.goto("/dashboard/users/invitations");

    // The invite goes to the shared organization filter's org. Arbor Live is
    // the default (arbor_internal), which unlocks Member/Admin plus rate and
    // payroll fields on the invite form.
    await expect(orgFilter(page)).toHaveText("Arbor Live", { timeout: 30_000 });

    const modal = await openAddPersonDialog(page);

    await formField(modal, "Email").fill(inviteEmail);
    await modal.getByRole("checkbox", { name: "Crew", exact: true }).check();
    // Specialties are scoped to the selected vertical; Design is Marketing-only,
    // so it must not be offered for a Crew member.
    await expect(modal.getByRole("checkbox", { name: "Design", exact: true })).toHaveCount(0);
    await expect(modal.getByRole("checkbox", { name: "Sound", exact: true })).toHaveCount(1);
    await modal.getByRole("checkbox", { name: "Sound", exact: true }).check();

    // Custom is the only rate mode that carries a number onto the pending
    // invite, so it is the one worth driving.
    await pickSelectOption(page, selectByLabel(modal, "Rate"), "Custom");
    await pickSelectOption(page, selectByLabel(modal, "Payment method"), "External payroll");
    await formField(modal, "Custom hourly rate (USD)").fill("47");

    await modal.getByRole("button", { name: "Send invite" }).click();
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
    await expect(inviteRow.getByTestId("invite-status")).toHaveText("Pending");

    // The invite email is what makes the invite usable at all.
    const firstEmail = await waitForInviteEmail(inviteEmail, 0);
    expect(firstEmail.template).toBe("user_invite");

    // Edit: promote the pending invite to admin. `updateInviteAdmin` writes the
    // role to both the invitation and the pending row, and it is the pending
    // row that `/accept-invite` reads — so checking only the invitation would
    // miss an invite that accepts as the wrong role.
    await inviteRow.getByRole("button").first().click();
    const sheet = page.getByTestId("invite-sheet");
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    await pickSelectOption(page, selectByLabel(sheet, "Role"), "Admin");
    await sheet.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Invitation updated.")).toBeVisible({ timeout: 30_000 });
    const edited = await waitForInvitationState(inviteEmail, (state) => state?.role === "admin");
    expect(edited.pendingRole).toBe("admin");
    expect(edited.status).toBe("pending");
    await expect(inviteRow.getByTestId("invite-role")).toHaveText("Admin", { timeout: 30_000 });

    // Resend: another email, and a pushed-out expiry.
    const resendAfter = Date.now();
    await sheet.getByRole("button", { name: "Resend invite" }).click();
    await expect(page.getByText("Invite resent.")).toBeVisible({ timeout: 30_000 });
    const resentEmail = await waitForInviteEmail(inviteEmail, resendAfter);
    expect(resentEmail.template).toBe("user_invite");
    const resent = await waitForInvitationState(
      inviteEmail,
      (state) => (state?.expiresAt ?? 0) > edited.expiresAt,
    );
    expect(resent.status).toBe("pending");

    await sheet.getByRole("button", { name: "Cancel invitation" }).click();
    await acceptAppDialog(page, "Cancel invitation");

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

    // The panel stays on the invite, now read-only with no resend or cancel.
    await expect(sheet.getByText("Cancelled", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(sheet.getByRole("button", { name: "Resend invite" })).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "Cancel invitation" })).toHaveCount(0);
    await closeSheet(page, sheet);

    // Default status filter is Pending, so the cancelled row drops out of the
    // list until the operator switches the filter.
    await expect(inviteRow).toHaveCount(0, { timeout: 30_000 });
    await toggleFilter(page, "Invitation status", "Cancelled").click();

    const cancelledInviteRow = page.getByTestId(`invite-row-${invited.invitationId}`);
    await expect(cancelledInviteRow.getByTestId("invite-status")).toHaveText("Cancelled", {
      timeout: 30_000,
    });
  });

  test("re-inviting the same address reuses one pending invitation", async ({ page }) => {
    await page.goto("/dashboard/users/invitations");
    // The invite goes to the organization filter's org, which is empty until
    // the org list resolves — submit before then and validation refuses it.
    await expect(orgFilter(page)).toHaveText("Arbor Live", { timeout: 30_000 });

    let modal = await openAddPersonDialog(page);
    await formField(modal, "Email").fill(reinviteEmail);
    await modal.getByRole("button", { name: "Send invite" }).click();

    const first = await waitForInvitationState(reinviteEmail, (state) => state?.status === "pending");
    await expect(modal).toHaveCount(0, { timeout: 30_000 });

    // A second send to the same address refreshes that invitation instead of
    // minting a second one. Reuse is what keeps the invite list unambiguous:
    // `resendInviteAdmin` resolves a row by id, and duplicates leave stale
    // accept links behind. `expiresAt` moving is the signal the second send ran.
    modal = await openAddPersonDialog(page);
    await formField(modal, "Email").fill(reinviteEmail);
    await modal.getByRole("button", { name: "Send invite" }).click();

    const second = await waitForInvitationState(
      reinviteEmail,
      (state) => (state?.expiresAt ?? 0) > first.expiresAt,
    );
    expect(second.invitationId).toBe(first.invitationId);

    const rows = listInvitationsByEmail(reinviteEmail);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
  });

  test("dismissing the cancel confirm leaves the invite pending", async ({ page }) => {
    runConvex("e2eHelpers:createPendingInvite", { email: declineEmail });
    const seeded = await waitForInvitationState(declineEmail, (state) => state?.status === "pending");

    // `createPendingInvite` invites into Arbor Live, the default org filter.
    await page.goto("/dashboard/users/invitations");
    const inviteRow = page.getByTestId(`invite-row-${seeded.invitationId}`);
    await expect(inviteRow).toContainText(declineEmail, { timeout: 30_000 });

    // Cancel from the row's ⋯ menu this time.
    await inviteRow.getByRole("button", { name: `More for ${declineEmail}` }).click();
    await page.getByRole("menuitem", { name: "Cancel invitation" }).click();
    await dismissAppDialog(page);

    await expect(inviteRow.getByTestId("invite-status")).toHaveText("Pending");
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
