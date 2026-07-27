import { defineConfig, devices } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, "e2e/.auth/admin.json");
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "e2e-report" }],
    // Machine-readable results for the CI flake comment.
    ["json", { outputFile: "e2e-results.json" }],
  ],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    /**
     * Playwright's default is 0 — no limit — which means a locator that matches
     * nothing turns `click()`/`fill()` into a silent wait for the *entire* test
     * timeout: no error, no screenshot, no browser traffic, so it reads as a
     * hung app rather than a bad selector. Two mistyped locators cost ~10
     * minutes of Batch 9's runtime that way. 45s is far longer than any real
     * interaction here (expect is 15s) and still fails fast enough to attribute.
     */
    actionTimeout: 45_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
    },
    {
      name: "setup-crew",
      testMatch: /crew\.setup\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "setup-band",
      testMatch: /band\.setup\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
      dependencies: ["setup", "setup-crew", "setup-band"],
      testIgnore: /global\.setup\.ts|crew\.setup\.ts|band\.setup\.ts/,
    },
  ],
});
