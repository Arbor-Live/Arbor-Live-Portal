// @vitest-environment edge-runtime
import { expect, test } from "vitest";
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
} from "./test/setup";

async function arborUserWithVerticals(verticals: Array<"Operations" | "Crew">) {
  const t = makeTest();
  const arbor = await createOrg(t, { type: "arbor_internal" });
  const user = await createUser(t);
  await addMembership(t, user._id, arbor.organizationId, "member", true);
  await setActiveOrg(t, user._id, arbor.organizationId);
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert("userAdminProfiles", {
      userId: user._id,
      verticals,
      createdAt: now,
      updatedAt: now,
    });
  });
  return { t, user };
}

async function seedEvent(t: Test): Promise<Id<"events">> {
  const now = Date.now();
  return await t.run(async (ctx) =>
    ctx.db.insert("events", {
      title: "Test Event",
      status: "tentative",
      visibility: "internal",
      startAt: now,
      endAt: now + 3_600_000,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: false,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function seedInquiry(t: Test): Promise<Id<"eventArtistInquiries">> {
  const now = Date.now();
  return await t.run(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      title: "Test Event",
      status: "tentative",
      visibility: "internal",
      startAt: now,
      endAt: now + 3_600_000,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: false,
      createdAt: now,
      updatedAt: now,
    });
    const needId = await ctx.db.insert("eventArtistNeeds", {
      eventId,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.insert("eventArtistInquiries", {
      needId,
      eventId,
      organizationId: "test-band-org",
      status: "submitted",
      createdAt: now,
      updatedAt: now,
    });
  });
}

test("refuses dismissInquiry for Arbor crew without Operations", async () => {
  const { t, user } = await arborUserWithVerticals(["Crew"]);
  const inquiryId = await seedInquiry(t);

  await expect(
    asUser(t, user).mutation(api.eventArtistNeeds.dismissInquiry, { inquiryId }),
  ).rejects.toThrow(/Operations team access required/);
});

test("allows dismissInquiry for the Operations vertical", async () => {
  const { t, user } = await arborUserWithVerticals(["Operations"]);
  const inquiryId = await seedInquiry(t);

  await asUser(t, user).mutation(api.eventArtistNeeds.dismissInquiry, { inquiryId });

  const inquiry = await t.run(async (ctx) => ctx.db.get(inquiryId));
  expect(inquiry?.status).toBe("dismissed");
});

test("refuses acceptInquiry for Arbor crew without Operations", async () => {
  const { t, user } = await arborUserWithVerticals(["Crew"]);
  const inquiryId = await seedInquiry(t);

  await expect(
    asUser(t, user).mutation(api.eventArtistNeeds.acceptInquiry, { inquiryId }),
  ).rejects.toThrow(/Operations team access required/);
});

test("passes acceptInquiry gate for the Operations vertical", async () => {
  const { t, user } = await arborUserWithVerticals(["Operations"]);
  const inquiryId = await seedInquiry(t);
  await t.run(async (ctx) => ctx.db.delete(inquiryId));

  await expect(
    asUser(t, user).mutation(api.eventArtistNeeds.acceptInquiry, { inquiryId }),
  ).rejects.toThrow(/Inquiry not found/);
});

test("refuses inviteBandFromEvent for Arbor crew without Operations", async () => {
  const { t, user } = await arborUserWithVerticals(["Crew"]);
  const eventId = await seedEvent(t);

  await expect(
    asUser(t, user).mutation(api.eventBands.inviteBandFromEvent, {
      eventId,
      email: "band@arbor.test",
      artistName: "Test Band",
      role: "headliner",
      pricingMode: "fixed_total",
      totalUsd: 100,
    }),
  ).rejects.toThrow(/Operations team access required/);
});

test("passes inviteBandFromEvent gate for the Operations vertical", async () => {
  const { t, user } = await arborUserWithVerticals(["Operations"]);
  const eventId = await seedEvent(t);
  await t.run(async (ctx) => ctx.db.delete(eventId));

  await expect(
    asUser(t, user).mutation(api.eventBands.inviteBandFromEvent, {
      eventId,
      email: "band@arbor.test",
      artistName: "Test Band",
      role: "headliner",
      pricingMode: "fixed_total",
      totalUsd: 100,
    }),
  ).rejects.toThrow(/Event not found/);
});
