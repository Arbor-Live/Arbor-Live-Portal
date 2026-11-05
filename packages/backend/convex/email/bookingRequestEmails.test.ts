// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import { createUser, makeTest, type Test } from "../test/setup.helpers";
import { scheduleBookingRequestReceivedEmail } from "./bookingRequestEmails";

async function receivedEmailFor(t: Test, assigneeUserId?: string) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const requestId = await ctx.db.insert("eventRequests", {
      status: "submitted",
      requestNumber: "ALREQ-TEST",
      publicToken: "request-token",
      firstName: "Ada",
      lastName: "Requester",
      email: "ada@stanford.edu",
      phone: "6505550100",
      sponsorType: "Large Voluntary Student Organization",
      eventDateText: "2026-11-10",
      eventStartTimeText: "18:00",
      eventEndTimeText: "22:00",
      earliestSetupText: "2 hours before",
      eventName: "Fall Showcase",
      eventCategory: "Concert / Showcase",
      crewOrRental: "Crewed",
      servicesNeeded: ["Sound"],
      expectedTurnout: 80,
      assigneeUserId,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await scheduleBookingRequestReceivedEmail(ctx, (await ctx.db.get(requestId))!);
    const rows = await ctx.db.query("emailNotifications").collect();
    return rows.find((row) => row.template === "booking_request_received")!;
  });
}

test("the received email names no manager, even with a round-robin assignee", async () => {
  const t = makeTest();
  const assignee = await createUser(t, { name: "Rory Assignee", email: "rory@arbor.test" });

  const email = await receivedEmailFor(t, assignee._id);

  expect(email.payload.managerName).toBeUndefined();
  expect(email.payload.managerEmail).toBeUndefined();
  expect(email.booking?.from).toBe('"Arbor Live" <bookings@arbor.st>');
  expect(email.replyTo).toEqual(["alreq-test@arbor.st"]);
  expect(email.subject).toBe("Arbor Live booking: Fall Showcase (ALREQ-TEST)");
  expect(email.booking?.threadId).toBeDefined();
});

test("without an assignee the received email names no manager", async () => {
  const t = makeTest();

  const email = await receivedEmailFor(t);

  expect(email.payload.managerName).toBeUndefined();
  expect(email.payload.managerEmail).toBeUndefined();
  expect(email.booking?.from).toBe('"Arbor Live" <bookings@arbor.st>');
  expect(email.replyTo).toEqual(["alreq-test@arbor.st"]);
});
