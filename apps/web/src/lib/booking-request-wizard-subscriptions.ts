import type { FieldPath } from "react-hook-form";
import type {
  BookingRequestFormValues,
  BookingRequestStepId,
} from "@/lib/validations/booking-request";

/**
 * Fields each booking-request step reads via useWatch.
 * Keeps inactive steps from subscribing to unrelated form updates.
 */
export const BOOKING_REQUEST_STEP_WATCH_FIELDS: Record<
  BookingRequestStepId,
  Array<FieldPath<BookingRequestFormValues>>
> = {
  welcome: [],
  email: ["email"],
  returningUser: ["requestContext", "invoiceGroupId"],
  contact: [],
  sponsorType: [],
  venue: [],
  eventSchedule: [],
  eventName: ["eventName"],
  eventCategory: ["eventCategory", "eventCategoryOther"],
  services: [],
  productionTier: ["productionTier"],
  lighting: ["lightingPreference"],
  eventDescription: [],
  expectedTurnout: [],
  existingEquipment: [],
  additionalNotes: [],
  thankYou: [],
};
