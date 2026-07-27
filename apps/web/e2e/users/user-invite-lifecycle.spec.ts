import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";
import { formFieldInput } from "../helpers/forms";
import { clickWithConfirm, pickSelectOption } from "../helpers/select";
import {
  cardByTitle,
  invitationRow,
  managedUsers,
  openUsersAccessPage,
  pollInvitationState,
  resetManagedUser,
} from "../helpers/users";

/**
 * Invitations, driven from the Users UI rather than seeded.
 *
 * Batch 1 covered *accepting* an invite, but the invite itself came from
 * `e2eHelpers:createPendingInvite` — so `inviteUserAdmin`, `updateInviteAdmin`,
 * `resendInviteAdmin`, and `cancelInviteAdmin` had never been exercised, and
 * neither had the compensation payload the invite carries to acceptance.
 *
 * The user behind the invite email is deleted first. `inviteUserAdmin` marks an
 * invitation accepted on the spot when someone with that address already
 * exists, which would quietly turn every pending-invite assertion below into a
 * test of nothing.
 */
test.describe("invite lifecycle", () => {
  // Five sequential mutations, each with its own round trip to a shared
  // deployment, plus two modals. Does not fit the 90s project default.
  test.setTimeout(180_000);

  const email = managedUsers.invite;

  test.beforeAll(() => {
    resetManagedUser(email);
    runConvex("e2eHelpers:clearInvitationsForEmail", { email });
  });

  test("admin invites, edits, resends, then cancels an invitation", async ({ page }) => {
    await openUsersAccessPage(page);

    // ---- invite --------------------------------------------------------
    await cardByTitle(page, "Invitations")
      .getByRole("button", { name: "Invite User" })
      .click();
    const inviteModal = cardByTitle(page, "Invite User");
    await expect(inviteModal).toBeVisible({ timeout: 25_000 });

    await formFieldInput(page, inviteModal, "Email").fill(email);
    await pickSelectOption(page, page.getByTestId("invite-role-trigger"), "Member");
    await inviteModal.getByLabel("Crew", { exact: true }).check();
    await inviteModal.getByLabel("Sound", { exact: true }).check();

    // Rate and payroll only render for Arbor Live invites, and they are not
    // cosmetic: `userInvites` replays them onto the user at acceptance, so an
    // invite that drops them creates someone with the wrong pay.
    await pickSelectOption(page, page.getByTestId("invite-rate-mode-trigger"), "Custom");
    await formFieldInput(page, inviteModal, "Custom hourly rate (USD)").fill("33");
    await pickSelectOption(
      page,
      page.getByTestId("invite-payroll-trigger"),
      "External payroll",
    );

    await inviteModal.getByRole("button", { name: "Send Invite" }).click();

    const invited = await pollInvitationState(email, (row) => row?.status === "pending");
    expect(invited.role).toBe("member");
    expect(invited.verticals).toContain("Crew");
    expect(invited.disciplines).toContain("Sound");
    expect(invited.rateMode).toBe("custom");
    expect(invited.payrollMethod).toBe("external");

    const row = invitationRow(page, email);
    await expect(row).toBeVisible({ timeout: 25_000 });
    await expect(row).toContainText("pending");

    // ---- edit ----------------------------------------------------------
    await row.getByRole("button", { name: "Edit" }).click();
    const editModal = cardByTitle(page, "Edit Invitation");
    await expect(editModal).toBeVisible({ timeout: 25_000 });
    // The email is fixed once sent — editing is for role and teams only.
    await expect(editModal.getByRole("textbox").first()).toBeDisabled();

    await pickSelectOption(page, page.getByTestId("edit-invite-role-trigger"), "Admin");
    await editModal.getByRole("button", { name: "Save changes" }).click();

    const edited = await pollInvitationState(email, (state) => state?.role === "admin");
    expect(edited.status).toBe("pending");
    expect(edited.invitationId).toBe(invited.invitationId);
    await expect(row).toContainText("admin");

    // ---- resend --------------------------------------------------------
    const beforeResend = Date.now();
    await row.getByRole("button", { name: "Resend" }).click();

    // A resend has to actually send. `scheduleUserInviteEmail` dedupes on the
    // invitation, so the resend passes a fresh key — without it this queues
    // nothing and the operator is left waiting on an email that never comes.
    const resentEmail = await pollConvex<{ to: string; template: string; createdAt: number }>(
      "e2eHelpers:getLatestEmailNotification",
      { to: email, template: "user_invite", afterCreatedAt: beforeResend },
      (row) => Boolean(row),
    );
    expect(resentEmail.to).toBe(email);
    const resent = await pollInvitationState(
      email,
      (state) => (state?.expiresAt ?? 0) > edited.expiresAt,
    );
    expect(resent.status).toBe("pending");

    // ---- cancel, declined ----------------------------------------------
    // Playwright dismisses `window.confirm` by default, so backing out is the
    // *default* behaviour of an unguarded spec — which means a spec that only
    // ever accepts would pass even if the confirm were deleted. Assert the
    // decline explicitly.
    const declinedMessage = await clickWithConfirm(
      page,
      row.getByRole("button", { name: "Cancel" }),
      "dismiss",
    );
    expect(declinedMessage).toContain(email);

    const stillPending = await pollInvitationState(email, (state) => Boolean(state));
    expect(stillPending.status).toBe("pending");

    // ---- cancel, confirmed ---------------------------------------------
    await clickWithConfirm(page, row.getByRole("button", { name: "Cancel" }), "accept");

    const cancelled = await pollInvitationState(email, (state) => state?.status === "cancelled");
    expect(cancelled.invitationId).toBe(invited.invitationId);

    // A cancelled invite keeps its row but loses every action on it.
    await expect(row).toContainText("cancelled");
    await expect(row.getByRole("button", { name: "Resend" })).toHaveCount(0);

    // ...and drops out of the Pending filter entirely.
    await pickSelectOption(page, page.getByTestId("invitation-status-filter"), "Pending");
    await expect(invitationRow(page, email)).toHaveCount(0, { timeout: 25_000 });
  });
});
