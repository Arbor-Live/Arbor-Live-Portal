import { test, expect, type Page } from "@playwright/test";
import { runConvex, pollConvex } from "../helpers/convex";

type Seed = {
  eventId: string;
  title: string;
  startAt: number;
  publicPath: string;
};

const STAMP = Date.now();
const EMAIL = `e2e.openmic.${STAMP}@stanford.edu`;

/**
 * Public Open Mic sign-up wizard (`/open-mic`). The wizard picks the next
 * active night itself (`api.openMic.getActiveNight`), so the fixture is seeded
 * with a start 1h in the past — inside the 4h sign-up window, earlier than any
 * other seeded night — to make it the night the form renders. The email-keyed
 * `getOpenMicSignupByEmail` oracle keeps the assertion independent of which
 * night ends up winning, and cleanup goes through the seeded event.
 */
test.describe("public open mic sign-up wizard", () => {
  let seeded: Seed;

  test.beforeAll(() => {
    seeded = runConvex("e2eHelpers:seedOpenMicNight", {
      title: `E2E Open Mic ${STAMP}`,
      startAt: Date.now() - 60 * 60 * 1000,
      endAt: Date.now() + 60 * 60 * 1000,
    }) as Seed;
  });

  test.afterAll(() => {
    runConvex("e2eHelpers:deleteOpenMicFixture", { eventId: seeded.eventId });
  });

  test("wizard shows the active night and a full sign-up lands in the queue", async ({
    page,
  }) => {
    await page.goto(seeded.publicPath);
    await expect(page.getByText(seeded.title).first()).toBeVisible({ timeout: 25_000 });

    await advancePastIntroIfShown(page);
    await page.getByRole("button", { name: "Next", exact: true }).click(); // welcome

    await page.getByLabel("Your name").fill("E2E Open Mic Performer");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.getByLabel("Stanford email").fill(EMAIL);
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.getByPlaceholder(/Singing a song/).fill("An original song on guitar");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.getByRole("button", { name: "Background Music" }).click();
    await page.getByRole("button", { name: "Music Stand" }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page
      .getByPlaceholder(/youtube\.com/)
      .fill("https://youtube.com/watch?v=e2e-backing-track");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.getByPlaceholder(/Pronouns/).fill("she/her");
    await page.getByRole("button", { name: "Sign me up" }).click();

    await expect(page.getByText("You're on the list!").first()).toBeVisible({
      timeout: 25_000,
    });

    const signup = await pollConvex<{
      status: string;
      equipment: string[];
      bgMusicLink?: string;
      whatTheyreDoing: string;
      nightTitle: string;
    }>("e2eHelpers:getOpenMicSignupByEmail", { email: EMAIL }, (row) => row?.status === "queued");
    expect(signup.status).toBe("queued");
    expect(signup.equipment).toContain("Background Music");
    expect(signup.equipment).toContain("Music Stand");
    expect(signup.bgMusicLink).toBe("https://youtube.com/watch?v=e2e-backing-track");
    expect(signup.whatTheyreDoing).toBe("An original song on guitar");
    expect(signup.nightTitle).toBe(seeded.title);
  });

  test("non-Stanford email is refused on the email step", async ({ page }) => {
    await page.goto(seeded.publicPath);
    await expect(page.getByText(seeded.title).first()).toBeVisible({ timeout: 25_000 });

    await advancePastIntroIfShown(page);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Your name").fill("E2E Wrong Email");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.getByLabel("Stanford email").fill("not.stanford@gmail.com");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // The client-side zod `.refine()` blocks the step — the wizard must not
    // advance to the "What will you be doing?" step.
    await expect(page.getByText("What will you be doing?").first()).toHaveCount(0, {
      timeout: 25_000,
    });
    await expect(page.getByText("What's your Stanford email?").first()).toBeVisible();
  });

  test("Background Music without a link is refused on the link step", async ({
    page,
  }) => {
    await page.goto(seeded.publicPath);
    await expect(page.getByText(seeded.title).first()).toBeVisible({ timeout: 25_000 });

    await advancePastIntroIfShown(page);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Your name").fill("E2E Missing Link");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Stanford email").fill(EMAIL);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByPlaceholder(/Singing a song/).fill("A poem");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.getByRole("button", { name: "Background Music" }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      page.getByText("Add a background music link when selecting Background Music"),
    ).toBeVisible({ timeout: 25_000 });
  });
});

/**
 * The public wizard opens on a marketing "intro" slide whenever the shared
 * `marketingSettings.openMicMarketingBoost` flag is on (it is a singleton, so
 * whichever worktree last touched it decides). The intro is skippable only via
 * its own "Sign up to perform" button — there is no footer "Next" — so click
 * through it when present, then the regular steps line up for all of the above.
 */
async function advancePastIntroIfShown(page: Page) {
  const signUp = page.getByRole("button", { name: "Sign up to perform" });
  if (await signUp.isVisible().catch(() => false)) {
    await signUp.click();
  }
}
