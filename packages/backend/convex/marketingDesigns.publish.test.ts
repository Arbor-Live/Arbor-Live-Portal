// @vitest-environment edge-runtime
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  addMembership,
  asUser,
  createOrg,
  createUser,
  makeTest,
  setActiveOrg,
  type Test,
} from "./test/setup.helpers";

async function designer(t: Test) {
  const arbor = await createOrg(t, { type: "arbor_internal" });
  const user = await createUser(t, {});
  await addMembership(t, user._id, arbor.organizationId, "member", true);
  await setActiveOrg(t, user._id, arbor.organizationId);
  await t.run(async (ctx) => {
    await ctx.db.insert("userAdminProfiles", {
      userId: user._id,
      status: "active",
      verticals: ["Crew", "Marketing"],
      disciplines: ["Design"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  return asUser(t, user);
}

async function publicEvent(t: Test, status: "tentative" | "ready") {
  const now = Date.now();
  return await t.run(async (ctx) =>
    ctx.db.insert("events", {
      title: "Friday showcase",
      status,
      visibility: "public",
      startAt: now + 7 * 24 * 60 * 60 * 1000,
      endAt: now + 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: false,
      teamsInterested: ["Design"],
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function errorOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ConvexError);
  return (error as ConvexError<{ code: string; message: string }>).data;
}

describe("publishing a poster", () => {
  test("a tentative public event is not offered for publish, and says why", async () => {
    const t = makeTest();
    const marketer = await designer(t);
    const eventId: Id<"events"> = await publicEvent(t, "tentative");

    const sheet = await marketer.query(api.marketingDesigns.getForEvent, { eventId });
    expect(sheet?.canPublish).toBe(false);
    expect(sheet?.publishBlockedReason).toMatch(/tentative/);

    const designId = await marketer.mutation(api.marketingDesigns.create, {
      eventId,
      imageUrl: "https://example.com/poster.jpg",
    });
    // Before: a plain Error, which production turned into a bare "Server Error".
    const data = await errorOf(marketer.mutation(api.marketingDesigns.markReady, { id: designId }));
    expect(data.code).toBe("MARKETING_DESIGN_NOT_PUBLISHABLE");
    expect(data.message).toBe(sheet?.publishBlockedReason);
  });

  test("a confirmed public event publishes", async () => {
    const t = makeTest();
    const marketer = await designer(t);
    const eventId = await publicEvent(t, "ready");

    const sheet = await marketer.query(api.marketingDesigns.getForEvent, { eventId });
    expect(sheet?.canPublish).toBe(true);
    expect(sheet?.publishBlockedReason).toBeNull();

    const designId = await marketer.mutation(api.marketingDesigns.create, {
      eventId,
      imageUrl: "https://example.com/poster.jpg",
    });
    await expect(
      marketer.mutation(api.marketingDesigns.markReady, { id: designId }),
    ).resolves.toEqual({ ok: true });
  });
});
