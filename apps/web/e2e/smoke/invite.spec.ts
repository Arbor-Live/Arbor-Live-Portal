import { test, expect } from "@playwright/test";
import { execFileSync } from "child_process";
import path from "path";
import { e2eEnv } from "../helpers/env";

const backendDir = path.join(__dirname, "../../../../packages/backend");

function createPendingInvite(email: string) {
  const raw = execFileSync(
    "pnpm",
    [
      "exec",
      "convex",
      "run",
      "e2eHelpers:createPendingInvite",
      JSON.stringify({ email }),
    ],
    {
      cwd: backendDir,
      encoding: "utf8",
      env: process.env,
    },
  );
  const match = raw.match(/\{[\s\S]*\}\s*$/);
  if (!match) {
    throw new Error(`Unexpected convex run output:\n${raw}`);
  }
  return JSON.parse(match[0]) as { url: string; token: string; email: string };
}

test.describe("invite smoke", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("invited user can accept invite and reach onboarding", async ({ page }) => {
    const inviteEmail = `e2e.crew.${Date.now()}@arborlive.test`;
    const invite = createPendingInvite(inviteEmail);

    await page.goto(invite.url.startsWith("http") ? invite.url : invite.url);
    await expect(page.getByText("Accept your invitation")).toBeVisible({ timeout: 20_000 });

    // Deliberately NOT "E2E Crew": the mention typeahead resolves `@Name` to every
    // candidate with that name, so each run's invite-created user must not collide
    // with the stable crew account the mention specs target. The stamped user is
    // also pruned at the start of each run (e2eHelpers:pruneStaleE2eUsers).
    await page.getByRole("textbox").first().fill(`E2E Invitee ${Date.now()}`);
    const passwords = page.locator('input[type="password"]');
    await passwords.nth(0).fill(e2eEnv.adminPassword);
    await passwords.nth(1).fill(e2eEnv.adminPassword);

    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 45_000 });
  });
});
