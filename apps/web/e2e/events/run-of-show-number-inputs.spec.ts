import { test, expect } from "@playwright/test";
import { e2eEnv } from "../helpers/env";
import { runConvex } from "../helpers/convex";

/**
 * Number fields must be clearable and retypeable. They used to clamp on every
 * keystroke (`Math.max(5, Number(v) || 5)`), so clearing "15" to type "30"
 * left "5" behind and produced "305".
 */
test("build run of show number fields can be cleared and retyped", async ({ page }) => {
  test.setTimeout(120_000);

  const band = runConvex("e2eHelpers:ensureBandPayeeUser", {
    email: e2eEnv.bandEmail,
    password: e2eEnv.bandPassword,
    name: e2eEnv.bandName,
    bandName: e2eEnv.bandOrgName,
  }) as { organizationId: string };
  const seeded = runConvex("e2eHelpers:seedEventWithBandRider", {
    organizationId: band.organizationId,
    eventTitle: `E2E ROS Inputs ${Date.now()}`,
  }) as { eventId: string };

  await page.goto(`/dashboard/events/${seeded.eventId}/schedule`);
  await page.getByRole("button", { name: "Build run of show" }).click();

  const soundcheck = page.getByLabel(/soundcheck length in minutes/).first();
  await expect(soundcheck).toBeVisible({ timeout: 30_000 });

  // Clear and retype: the field stays empty while clearing, then reads 30.
  await soundcheck.fill("");
  await expect(soundcheck).toHaveValue("");
  await soundcheck.pressSequentially("30");
  await expect(soundcheck).toHaveValue("30");

  // A soundcheck can be skipped: left empty, it falls back to 0 on blur.
  await soundcheck.fill("");
  await soundcheck.blur();
  await expect(soundcheck).toHaveValue("0");

  const changeover = page.getByLabel("Changeover (min)");
  await changeover.fill("");
  await changeover.pressSequentially("20");
  await expect(changeover).toHaveValue("20");

  const setLength = page.getByLabel(/set length in minutes/).first();
  await setLength.fill("");
  await expect(setLength).toHaveValue("");
  await setLength.pressSequentially("50");
  await expect(setLength).toHaveValue("50");

  // Below the minimum is allowed mid-typing and snaps to 5 on blur.
  await setLength.fill("3");
  await expect(setLength).toHaveValue("3");
  await setLength.blur();
  await expect(setLength).toHaveValue("5");
});

  // Clear and retype: the field stays empty while clearing, then reads 30.
  await soundcheck.fill("");
  await expect(soundcheck).toHaveValue("");
  await soundcheck.pressSequentially("30");
  await expect(soundcheck).toHaveValue("30");

  // Below the minimum is allowed mid-typing and snaps to 5 on blur.
  await soundcheck.fill("3");
  await expect(soundcheck).toHaveValue("3");
  await soundcheck.blur();
  await expect(soundcheck).toHaveValue("5");

  // Left empty, it falls back to the minimum on blur.
  await soundcheck.fill("");
  await soundcheck.blur();
  await expect(soundcheck).toHaveValue("5");

  const changeover = page.getByLabel("Changeover (min)");
  await changeover.fill("");
  await changeover.pressSequentially("20");
  await expect(changeover).toHaveValue("20");

  const setLength = page.getByLabel(/set length in minutes/).first();
  await setLength.fill("");
  await expect(setLength).toHaveValue("");
  await setLength.pressSequentially("50");
  await expect(setLength).toHaveValue("50");
});
