import { describe, expect, it } from "vitest";
import {
  NON_STANFORD_INDIVIDUAL_SPONSOR_TYPE,
  bookingRequestDefaultValues,
  bookingRequestSchema,
  getActiveSteps,
  requiresOrganizationName,
  sponsorTypeOptionsForContext,
  type BookingRequestFormValues,
} from "./booking-request";

function request(overrides: Partial<BookingRequestFormValues>) {
  return {
    ...bookingRequestDefaultValues,
    firstName: "Ada",
    lastName: "Lovelace",
    phone: "6505550100",
    eventName: "Garden Party",
    showSlots: [{ date: "2030-05-10", startTime: "18:00", endTime: "20:00" }],
    flexibleSetupTime: true,
    ...overrides,
  };
}

function sponsorErrors(values: Partial<BookingRequestFormValues>) {
  const result = bookingRequestSchema.safeParse(request(values));
  if (result.success) return [];
  return result.error.issues
    .filter((issue) => issue.path[0] === "sponsorType")
    .map((issue) => issue.message);
}

describe("booking request sponsor rules by email", () => {
  it("pins the sponsor value the backend compares against", () => {
    expect(NON_STANFORD_INDIVIDUAL_SPONSOR_TYPE).toBe("Individual (non-Stanford)");
  });

  it("accepts a non-Stanford email requesting as a non-Stanford individual", () => {
    const result = bookingRequestSchema.safeParse(
      request({ email: "ada@gmail.com", sponsorType: "Individual (non-Stanford)" }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects a non-Stanford email with a Stanford sponsor type", () => {
    expect(
      sponsorErrors({
        email: "ada@gmail.com",
        sponsorType: "Stanford Department",
        organization: "Music",
      }),
    ).toEqual(["Non-Stanford emails can only request as an individual"]);
  });

  it("rejects a non-Stanford email billing a group", () => {
    expect(
      sponsorErrors({
        email: "ada@gmail.com",
        sponsorType: "Individual (non-Stanford)",
        invoiceGroupId: "group123",
      }),
    ).toEqual(["Non-Stanford emails can only request as an individual"]);
  });

  it("rejects a non-Stanford email naming an organization", () => {
    expect(
      sponsorErrors({
        email: "ada@gmail.com",
        sponsorType: "Individual (non-Stanford)",
        organization: "Music",
      }),
    ).toEqual(["Non-Stanford emails can only request as an individual"]);
  });

  it("rejects a Stanford email with the non-Stanford sponsor type", () => {
    expect(
      sponsorErrors({ email: "ada@stanford.edu", sponsorType: "Individual (non-Stanford)" }),
    ).toEqual(["This option is only for non-Stanford emails"]);
  });

  it("rejects an address that is not an email", () => {
    const result = bookingRequestSchema.safeParse(
      request({ email: "ada", sponsorType: "Individual (non-Stanford)" }),
    );
    expect(result.success).toBe(false);
  });

  it.each(["ada@stanford.edu", "ada@alumni.stanford.edu"])("keeps %s flows valid", (email) => {
    expect(
      bookingRequestSchema.safeParse(
        request({ email, sponsorType: "Individual Stanford Affiliate" }),
      ).success,
    ).toBe(true);
    expect(
      bookingRequestSchema.safeParse(
        request({ email, sponsorType: "Stanford Department", organization: "Music" }),
      ).success,
    ).toBe(true);
  });

  it("offers a non-Stanford email only the non-Stanford individual option", () => {
    expect(sponsorTypeOptionsForContext("ada@gmail.com")).toEqual(["Individual (non-Stanford)"]);
  });

  it("offers a Stanford email the same options as before", () => {
    expect(sponsorTypeOptionsForContext("ada@stanford.edu")).toEqual([
      "Stanford Department",
      "Large Voluntary Student Organization",
      "Small Voluntary Student Organization",
      "Stanford House / Greek Life",
      "Individual Stanford Affiliate",
      "Other",
    ]);
  });

  it("needs no organization name for the non-Stanford individual", () => {
    expect(requiresOrganizationName("Individual (non-Stanford)")).toBe(false);
  });

  it("uses generic copy on the email step", () => {
    const steps = getActiveSteps({
      showReturningUser: false,
      skipContact: false,
      skipSponsor: false,
      includeLighting: false,
    });
    const email = steps.find((step) => step.id === "email");
    expect(email?.headline).toBe("What's your email?");
    expect(email?.subheader).toBe(
      "Use your Stanford email if you have one. Other addresses can only request as an individual.",
    );
  });
});
