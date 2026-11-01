// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mapSponsorTypeToGroupType } from "./lib/bookingRequestQuote";
import { makeTest, type Test } from "./test/setup.helpers";

type SubmitArgs = {
  email: string;
  sponsorType: string;
  organization?: string;
  invoiceGroupId?: Id<"invoiceGroups">;
};

function submit(t: Test, args: SubmitArgs) {
  return t.mutation(api.eventRequests.submitPublic, {
    firstName: "Ada",
    lastName: "Lovelace",
    phone: "6505550100",
    eventDateText: "May 10, 2030",
    eventStartTimeText: "6:00 PM",
    eventEndTimeText: "8:00 PM",
    earliestSetupText: "Flexible setup time",
    flexibleSetupTime: true,
    eventName: "Garden Party",
    eventCategory: "Live Bands",
    crewOrRental: "Crewed",
    servicesNeeded: ["Crewed"],
    expectedTurnout: 40,
    ...args,
  });
}

async function errorCode(attempt: Promise<unknown>) {
  const error = await attempt.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ConvexError);
  return (error as ConvexError<{ code: string }>).data.code;
}

async function requestCount(t: Test) {
  return await t.run(async (ctx) => (await ctx.db.query("eventRequests").collect()).length);
}

async function createStanfordGroup(t: Test) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("invoiceGroups", {
      name: "Stanford Music",
      normalizedName: "stanford music",
      type: "department",
      equipmentPricingMode: "subsidized",
      active: true,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
    });
  });
}

test("a non-Stanford email can request as a non-Stanford individual", async () => {
  const t = makeTest();

  const { id } = await submit(t, {
    email: " Ada@Gmail.com ",
    sponsorType: "Individual (non-Stanford)",
  });

  const row = await t.run(async (ctx) => await ctx.db.get(id));
  expect(row).toMatchObject({
    status: "submitted",
    email: "ada@gmail.com",
    sponsorType: "Individual (non-Stanford)",
  });
  expect(row?.invoiceGroupId).toBeUndefined();
  expect(row?.organization).toBeUndefined();
  const billing = await t.run(async (ctx) => ({
    groups: await ctx.db.query("invoiceGroups").collect(),
    contacts: await ctx.db.query("invoiceContacts").collect(),
  }));
  expect(billing.groups).toEqual([]);
  expect(billing.contacts.map((contact) => contact.groupId)).toEqual([undefined]);
});

test.each([
  "a,b@gmail.com",
  "<a>@gmail.com",
  "a@gmail",
  "a@gmail..com",
  "a@gmail.com.",
])("rejects the malformed email %s", async (email) => {
  const t = makeTest();
  expect(await errorCode(submit(t, { email, sponsorType: "Individual (non-Stanford)" }))).toBe(
    "REQUEST_EMAIL_INVALID",
  );
});

test.each(["individual (non-stanford)", "Other: Individual (non-Stanford)", "Individual Stanford Affiliate"])(
  "a non-Stanford email cannot use the sponsor type %s",
  async (sponsorType) => {
    const t = makeTest();
    expect(await errorCode(submit(t, { email: "ada@gmail.com", sponsorType }))).toBe(
      "REQUEST_NON_STANFORD_INDIVIDUAL_ONLY",
    );
  },
);

test("the non-Stanford sponsor type maps to the individual group type", () => {
  expect(mapSponsorTypeToGroupType("Individual (non-Stanford)")).toBe("individual");
});

test("a non-Stanford email cannot bill a Stanford group", async () => {
  const t = makeTest();
  const invoiceGroupId = await createStanfordGroup(t);

  expect(
    await errorCode(
      submit(t, {
        email: "ada@gmail.com",
        sponsorType: "Individual (non-Stanford)",
        invoiceGroupId,
      }),
    ),
  ).toBe("REQUEST_NON_STANFORD_INDIVIDUAL_ONLY");
  expect(
    await errorCode(
      submit(t, { email: "ada@gmail.com", sponsorType: "Stanford Department", invoiceGroupId }),
    ),
  ).toBe("REQUEST_NON_STANFORD_INDIVIDUAL_ONLY");
  expect(await requestCount(t)).toBe(0);
});

test("a non-Stanford email cannot name an organization", async () => {
  const t = makeTest();

  expect(
    await errorCode(
      submit(t, {
        email: "ada@gmail.com",
        sponsorType: "Individual (non-Stanford)",
        organization: "Stanford Music",
      }),
    ),
  ).toBe("REQUEST_NON_STANFORD_INDIVIDUAL_ONLY");
  const groups = await t.run(async (ctx) => await ctx.db.query("invoiceGroups").collect());
  expect(groups).toEqual([]);
});

test.each(["Stanford Department", "Individual Stanford Affiliate", "Other: Friends"])(
  "a non-Stanford email cannot use %s",
  async (sponsorType) => {
    const t = makeTest();

    expect(
      await errorCode(
        submit(t, { email: "ada@gmail.com", sponsorType, organization: "Friends" }),
      ),
    ).toBe("REQUEST_NON_STANFORD_INDIVIDUAL_ONLY");
  },
);

test("a Stanford email cannot use the non-Stanford sponsor type", async () => {
  const t = makeTest();

  expect(
    await errorCode(submit(t, { email: "ada@stanford.edu", sponsorType: " Individual (non-Stanford) " })),
  ).toBe("REQUEST_SPONSOR_TYPE_NON_STANFORD_ONLY");
});

test("an address that is not an email is rejected", async () => {
  const t = makeTest();

  expect(
    await errorCode(submit(t, { email: "ada", sponsorType: "Individual (non-Stanford)" })),
  ).toBe("REQUEST_EMAIL_INVALID");
});

test("Stanford requesters can still bill a group", async () => {
  const t = makeTest();
  const invoiceGroupId = await createStanfordGroup(t);

  const { id } = await submit(t, {
    email: "ada@alumni.stanford.edu",
    sponsorType: "Stanford Department",
    invoiceGroupId,
  });

  const row = await t.run(async (ctx) => await ctx.db.get(id));
  expect(row?.invoiceGroupId).toBe(invoiceGroupId);
});

test("lookupContactByEmail stays Stanford-only", async () => {
  const t = makeTest();
  await submit(t, { email: "ada@gmail.com", sponsorType: "Individual (non-Stanford)" });
  await submit(t, { email: "grace@stanford.edu", sponsorType: "Individual Stanford Affiliate" });

  expect(await t.query(api.eventRequests.lookupContactByEmail, { email: "ada@gmail.com" })).toEqual({
    found: false,
  });
  expect(
    await t.query(api.eventRequests.lookupContactByEmail, { email: "grace@stanford.edu" }),
  ).toMatchObject({ found: true, firstName: "Ada", lastName: "Lovelace", phone: "6505550100" });
});
