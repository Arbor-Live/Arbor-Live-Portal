import { test, expect, type Page } from "@playwright/test";
import { adminAuthFile, bandAuthFile, crewAuthFile, signInWithCredentials } from "../helpers/auth";
import { e2eEnv } from "../helpers/env";
import { runConvex } from "../helpers/convex";
import { callConvexAs } from "../helpers/convexCall";

/**
 * The ⌘K search is gated on the server. Every call here asks for everything
 * (`includeAdmin` / `includeOperations: true`), as a tampered client would; the
 * sections each role gets back must still match what it may open.
 */
const stamp = Date.now();
const token = `Scope${stamp}`;
const opsEmail = "e2e-ops@arborlive.test";

type Results = {
  events: { _id: string; title: string }[];
  invoices: { _id: string }[];
  people: { id: string }[];
  artists: { organizationId: string }[];
};

let eventId = "";

test.beforeAll(() => {
  eventId = (
    runConvex("e2eHelpers:seedCrewedEventWithSchedule", { title: `${token} Night` }) as {
      eventId: string;
    }
  ).eventId;
  runConvex("e2eHelpers:seedApprovedQuoteWithLinkedEvent", { clientGroupName: `${token} Host` });
  runConvex("e2eHelpers:ensureCrewUser", {
    email: `scope-${stamp}@arborlive.test`,
    password: e2eEnv.crewPassword,
    name: `${token} Person`,
  });
  runConvex("e2eHelpers:ensureBandPayeeUser", {
    email: `scope-band-${stamp}@arborlive.test`,
    password: e2eEnv.crewPassword,
    bandName: `${token} Band`,
    orgSlug: `scope-band-${stamp}`,
  });
  runConvex("e2eHelpers:ensureCrewUser", {
    email: opsEmail,
    password: e2eEnv.crewPassword,
    name: "E2E Operations",
    verticals: ["Operations"],
  });
});

async function search(page: Page, flags = { includeAdmin: true, includeOperations: true }) {
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Search" })).toBeVisible({ timeout: 45_000 });
  const result = await callConvexAs(page, "query", "globalSearch:search", { query: token, ...flags });
  expect(result.status, result.errorMessage).toBe("success");
  return result.value as Results;
}

function sections(results: Results) {
  return {
    events: results.events.length > 0,
    invoices: results.invoices.length > 0,
    people: results.people.length > 0,
    artists: results.artists.length > 0,
  };
}

test.describe("global search scope", () => {
  test.describe("admin", () => {
    test.use({ storageState: adminAuthFile });

    test("gets every section", async ({ page }) => {
      expect(sections(await search(page))).toEqual({
        events: true,
        invoices: true,
        people: true,
        artists: true,
      });
    });

    test("in crew mode gets what crew gets", async ({ page }) => {
      // The palette sends both flags off in crew mode.
      const results = await search(page, { includeAdmin: false, includeOperations: false });
      expect(sections(results)).toEqual({
        events: true,
        invoices: false,
        people: false,
        artists: true,
      });
    });
  });

  test.describe("operations", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("gets invoices but not people", async ({ page }) => {
      await signInWithCredentials(page, opsEmail, e2eEnv.crewPassword);
      expect(sections(await search(page))).toEqual({
        events: true,
        invoices: true,
        people: false,
        artists: true,
      });
    });
  });

  test.describe("crew", () => {
    test.use({ storageState: crewAuthFile });

    test("gets events and artists only, and can open the event it finds", async ({ page }) => {
      const results = await search(page);
      expect(sections(results)).toEqual({
        events: true,
        invoices: false,
        people: false,
        artists: true,
      });
      expect(results.events.map((event) => event._id)).toContain(eventId);

      await page.goto(`/dashboard/events/${eventId}`);
      await expect(page.getByText(`${token} Night`).first()).toBeVisible({ timeout: 45_000 });
    });
  });

  test.describe("artist account", () => {
    test.use({ storageState: bandAuthFile });

    test("gets nothing from Arbor Live", async ({ page }) => {
      expect(sections(await search(page))).toEqual({
        events: false,
        invoices: false,
        people: false,
        artists: false,
      });
    });
  });
});
