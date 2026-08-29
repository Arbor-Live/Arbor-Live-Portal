import { describe, expect, it } from "vitest";
import type { FieldErrors } from "react-hook-form";
import type { BookingRequestFormValues } from "@/lib/validations/booking-request";
import {
  firstBookingRequestStepForField,
  firstBookingRequestStepWithError,
  getBookingRequestStepFieldError,
} from "./booking-request-wizard-validation";

const ACTIVE_STEPS = [
  { id: "email" as const, headline: "", fields: ["email"] as Array<keyof BookingRequestFormValues> },
  {
    id: "eventSchedule" as const,
    headline: "",
    fields: ["showSlots", "setupTime", "flexibleSetupTime"] as Array<keyof BookingRequestFormValues>,
  },
  { id: "eventName" as const, headline: "", fields: ["eventName"] as Array<keyof BookingRequestFormValues> },
];

describe("booking request wizard validation", () => {
  it("finds nested show slot errors on the schedule step", () => {
    const errors = {
      showSlots: [{ startTime: { type: "custom", message: "Invalid show time" } }],
    } as FieldErrors<BookingRequestFormValues>;

    expect(getBookingRequestStepFieldError(errors, "eventSchedule")).toBe("Invalid show time");
  });

  it("surfaces flexible setup time errors on the schedule step", () => {
    const errors = {
      flexibleSetupTime: { type: "custom", message: "Select whether setup time is flexible" },
    } as FieldErrors<BookingRequestFormValues>;

    expect(getBookingRequestStepFieldError(errors, "eventSchedule")).toBe(
      "Select whether setup time is flexible",
    );
    expect(firstBookingRequestStepWithError(ACTIVE_STEPS, errors)).toBe("eventSchedule");
  });

  it("returns the first active step with an error", () => {
    const errors = {
      email: { type: "custom", message: "Use your @stanford.edu email address" },
      eventName: { type: "custom", message: "Event name is required" },
    } as FieldErrors<BookingRequestFormValues>;

    expect(firstBookingRequestStepWithError(ACTIVE_STEPS, errors)).toBe("email");
  });

  it("maps a server field key back to its step", () => {
    expect(firstBookingRequestStepForField(ACTIVE_STEPS, "eventName")).toBe("eventName");
    expect(firstBookingRequestStepForField(ACTIVE_STEPS, "showSlots.0.date")).toBe("eventSchedule");
  });
});
