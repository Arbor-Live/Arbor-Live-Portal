import { test as setup, expect } from "@playwright/test";
import { runConvex } from "./helpers/convex";
import {
  bandAuthFile,
  ensureAuthDir,
  signInAsBand,
} from "./helpers/auth";
import { e2eEnv } from "./helpers/env";

setup("authenticate band payee", async ({ page }) => {
  ensureAuthDir();
  runConvex("e2eHelpers:ensureBandPayeeUser", {
    email: e2eEnv.bandEmail,
    password: e2eEnv.bandPassword,
    name: e2eEnv.bandName,
    bandName: e2eEnv.bandOrgName,
  });
  await signInAsBand(page);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: bandAuthFile });
  console.log(`E2E band session stored for ${e2eEnv.bandEmail}`);
});
