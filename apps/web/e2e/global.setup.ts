import { execFileSync } from "child_process";
import path from "path";
import { test as setup, expect } from "@playwright/test";
import {
  adminAuthFile,
  ensureAuthDir,
  signInAsAdmin,
} from "./helpers/auth";
import { e2eEnv } from "./helpers/env";

const backendDir = path.join(__dirname, "../../../packages/backend");

function ensureE2eAdmin() {
  execFileSync(
    "pnpm",
    [
      "exec",
      "convex",
      "run",
      "e2eHelpers:ensureAdmin",
      JSON.stringify({
        email: e2eEnv.adminEmail,
        password: e2eEnv.adminPassword,
        name: e2eEnv.adminName,
      }),
    ],
    {
      cwd: backendDir,
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

setup("authenticate admin", async ({ page }) => {
  ensureAuthDir();
  ensureE2eAdmin();
  await signInAsAdmin(page);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: adminAuthFile });
  console.log(`E2E admin session stored for ${e2eEnv.adminEmail}`);
});
