import { describe, expect, it } from "vitest";
import { BOOKING_REQUEST_STEP_WATCH_FIELDS } from "./booking-request-wizard-subscriptions";

describe("booking request wizard subscriptions", () => {
  it("scopes email typing to the email field only", () => {
    expect(BOOKING_REQUEST_STEP_WATCH_FIELDS.email).toEqual(["email"]);
  });

  it("keeps the schedule step off form watch subscriptions", () => {
    expect(BOOKING_REQUEST_STEP_WATCH_FIELDS.eventSchedule).toEqual([]);
  });

  it("keeps schedule fields off the email step subscription", () => {
    expect(BOOKING_REQUEST_STEP_WATCH_FIELDS.email).not.toContain("showSlots");
    expect(BOOKING_REQUEST_STEP_WATCH_FIELDS.email).not.toContain("setupTime");
  });
});
