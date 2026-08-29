import type { FieldErrors } from "react-hook-form";
import type {
  BookingRequestFormValues,
  BookingRequestStepConfig,
  BookingRequestStepId,
} from "@/lib/validations/booking-request";

function showSlotsFieldError(errors: FieldErrors<BookingRequestFormValues>): string | undefined {
  const showSlots = errors.showSlots;
  if (showSlots && typeof showSlots === "object" && "message" in showSlots && showSlots.message) {
    return String(showSlots.message);
  }
  if (errors.setupTime?.message) {
    return errors.setupTime.message;
  }
  if (errors.flexibleSetupTime?.message) {
    return errors.flexibleSetupTime.message;
  }
  if (Array.isArray(showSlots)) {
    for (const slot of showSlots) {
      if (!slot || typeof slot !== "object") continue;
      const row = slot as {
        date?: { message?: string };
        startTime?: { message?: string };
        endTime?: { message?: string };
      };
      if (row.date?.message) return row.date.message;
      if (row.startTime?.message) return row.startTime.message;
      if (row.endTime?.message) return row.endTime.message;
    }
  }
  return undefined;
}

export function getBookingRequestStepFieldError(
  errors: FieldErrors<BookingRequestFormValues>,
  stepId: BookingRequestStepId,
): string | undefined {
  switch (stepId) {
    case "email":
      return errors.email?.message;
    case "returningUser":
      return errors.requestContext?.message;
    case "contact":
      return errors.firstName?.message ?? errors.lastName?.message ?? errors.phone?.message;
    case "sponsorType":
      return (
        errors.sponsorType?.message ??
        errors.sponsorTypeOther?.message ??
        errors.organization?.message
      );
    case "venue":
      return errors.venueName?.message ?? errors.venueAddress?.message;
    case "eventSchedule":
      return showSlotsFieldError(errors);
    case "eventName":
      return errors.eventName?.message;
    case "eventCategory":
      return errors.eventCategory?.message ?? errors.eventCategoryOther?.message;
    case "services":
      return errors.crewOrRental?.message ?? errors.servicesNeeded?.message;
    case "productionTier":
      return errors.productionTier?.message;
    case "lighting":
      return errors.lightingPreference?.message;
    case "eventDescription":
      return errors.eventDescription?.message;
    case "expectedTurnout":
      return errors.expectedTurnout?.message;
    case "existingEquipment":
      return errors.existingEquipment?.message;
    case "additionalNotes":
      return errors.additionalNotes?.message;
    default:
      return undefined;
  }
}

export function firstBookingRequestStepWithError(
  steps: readonly BookingRequestStepConfig[],
  errors: FieldErrors<BookingRequestFormValues>,
): BookingRequestStepId | null {
  for (const step of steps) {
    if (getBookingRequestStepFieldError(errors, step.id)) {
      return step.id;
    }
  }
  return null;
}

export function firstBookingRequestStepForField(
  steps: readonly BookingRequestStepConfig[],
  field: string,
): BookingRequestStepId | null {
  const root = field.split(".")[0] as keyof BookingRequestFormValues;
  for (const step of steps) {
    if (step.fields.includes(root)) {
      return step.id;
    }
  }
  return null;
}
