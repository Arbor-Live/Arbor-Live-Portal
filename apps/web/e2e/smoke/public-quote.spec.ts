import { test, expect } from "@playwright/test";
import { execFileSync } from "child_process";
import path from "path";

const backendDir = path.join(__dirname, "../../../../packages/backend");

function seedPublicQuote() {
  const raw = execFileSync(
    "pnpm",
    ["exec", "convex", "run", "e2eHelpers:seedMinimalPublicQuote", "{}"],
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
  return JSON.parse(match[0]) as {
    path: string;
    invoiceNumber: string;
    publicApprovalToken: string;
  };
}

test.describe("public quote smoke", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("public event quote page renders for a seeded token", async ({ page }) => {
    const seeded = seedPublicQuote();
    await page.goto(seeded.path);
    await expect(page.getByText(/Your quote|E2E Quote Client|Awaiting your approval/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Quote unavailable|invalid or expired/i)).toHaveCount(0);
  });
});
