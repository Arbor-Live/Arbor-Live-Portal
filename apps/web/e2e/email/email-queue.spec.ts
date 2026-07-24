import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { e2eTestEmail, waitForSentEmail } from "../helpers/email";

/**
 * Asserts the app email pipeline (enqueue → render → mark sent) without calling Resend.
 * Requires deployment env E2E_EMAIL_MOCK=true (set by scripts/e2e-run.mjs).
 */
test.describe("email queue (mocked Resend)", () => {
  test("smoke email renders and marks sent without Resend", async () => {
    const to = e2eTestEmail(`smoke-${Date.now()}`);
    const subject = `E2E mock smoke ${Date.now()}`;
    const afterCreatedAt = Date.now() - 5_000;

    runConvex("e2eHelpers:enqueueSmokeEmail", { to, subject });

    const notification = await waitForSentEmail({
      to,
      template: "email_verification",
      afterCreatedAt,
    });

    expect(notification.status).toBe("sent");
    expect(notification.resendId).toMatch(/^e2e-mock:/);
    expect(notification.subject).toContain("E2E mock smoke");
  });

  test("invite email path queues and marks sent without Resend", async () => {
    const to = e2eTestEmail(`invite-${Date.now()}`);
    const afterCreatedAt = Date.now() - 5_000;

    const invite = runConvex("e2eHelpers:sendInviteEmail", { email: to }) as {
      email: string;
      token: string;
      url: string;
    };
    expect(invite.email).toBe(to);
    expect(invite.token).toBeTruthy();

    const notification = await waitForSentEmail({
      to,
      template: "user_invite",
      afterCreatedAt,
    });
    expect(notification.status).toBe("sent");
    expect(notification.resendId).toMatch(/^e2e-mock:/);
  });
});
