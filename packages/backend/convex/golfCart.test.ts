// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  addMembership,
  asUser,
  createOrg,
  createUser,
  makeTest,
  setActiveOrg,
  type Test,
} from "./test/setup.helpers";

async function arborAdmin(t: Test) {
  const admin = await createUser(t, { role: "admin" });
  const arbor = await createOrg(t, { type: "arbor_internal" });
  await addMembership(t, admin._id, arbor.organizationId, "org_admin", true);
  await setActiveOrg(t, admin._id, arbor.organizationId);
  return admin;
}

async function seedEvent(t: Test, needsCart: boolean) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const startAt = now + 5 * 24 * 60 * 60 * 1000;
    const eventId = await ctx.db.insert("events", {
      title: "Cart night",
      status: "scheduling",
      visibility: "internal",
      startAt,
      endAt: startAt + 3 * 60 * 60 * 1000,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: false,
      eventType: "Crewed Event",
      teamsInterested: ["Sound"],
      needsCart,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("eventScheduleBlocks", {
      eventId,
      blockType: "setup",
      label: "Setup",
      dayIndex: 0,
      startsAt: startAt - 2 * 60 * 60 * 1000,
      endsAt: startAt,
      createdAt: now,
      updatedAt: now,
    });
    return eventId;
  });
}

async function cartEmails(t: Test) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("emailNotifications").collect()).filter(
      (row) => row.template === "golf_cart_event_ready",
    ),
  );
}

test("settings start empty and don't include admins", async () => {
  const t = makeTest();
  const admin = await arborAdmin(t);
  const settings = await asUser(t, admin).query(api.golfCart.getGolfCartSettings, {});
  expect(settings.alertRecipients).toEqual([]);
});

test("a cart event going Ready emails only the configured recipients", async () => {
  const t = makeTest();
  const admin = await arborAdmin(t);
  await asUser(t, admin).mutation(api.golfCart.updateGolfCartSettings, {
    alertRecipients: [" Carts@Stanford.edu "],
  });
  const eventId = await seedEvent(t, true);

  await asUser(t, admin).mutation(api.events.setStatus, { id: eventId, status: "ready" });
  const emails = await cartEmails(t);
  expect(emails.map((row) => row.to)).toEqual(["carts@stanford.edu"]);
  expect(emails[0]?.subject).toBe("Golf cart needed: Cart night");
  expect((emails[0]?.payload as { setupLabel?: string }).setupLabel).toBeTruthy();

  // Re-saving Ready is not a new transition.
  await asUser(t, admin).mutation(api.events.update, { id: eventId, status: "ready" });
  expect(await cartEmails(t)).toHaveLength(1);
});

test("non-cart events and an empty list send nothing", async () => {
  const t = makeTest();
  const admin = await arborAdmin(t);
  const cartEvent = await seedEvent(t, true);
  await asUser(t, admin).mutation(api.events.update, { id: cartEvent, status: "ready" });
  expect(await cartEmails(t)).toHaveLength(0);

  await asUser(t, admin).mutation(api.golfCart.updateGolfCartSettings, {
    alertRecipients: ["carts@stanford.edu"],
  });
  const plainEvent = await seedEvent(t, false);
  await asUser(t, admin).mutation(api.events.update, { id: plainEvent, status: "ready" });
  expect(await cartEmails(t)).toHaveLength(0);
});
