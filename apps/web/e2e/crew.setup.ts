import { test as setup, expect } from "@playwright/test";
import { runConvex } from "./helpers/convex";
import {
  crewAuthFile,
  ensureAuthDir,
  signInAsCrew,
} from "./helpers/auth";
import { e2eEnv } from "./helpers/env";

setup("authenticate crew", async ({ page }) => {
  ensureAuthDir();
  runConvex("e2eHelpers:ensureCrewUser", {
    email: e2eEnv.crewEmail,
    password: e2eEnv.crewPassword,
    name: e2eEnv.crewName,
  });
  await signInAsCrew(page);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: crewAuthFile });
  console.log(`E2E crew session stored for ${e2eEnv.crewEmail}`);
});
