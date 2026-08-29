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
  sponsorType: ["requestContext", "sponsorType", "invoiceGroupId", "sponsorTypeOther"],
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

/** Maps a useWatch result to step-local values (scalar name → scalar, array name → array). */
export function buildStepFieldValuesFromWatch<T extends Record<string, unknown>>(
  fieldNames: readonly (keyof T & string)[],
  watched: unknown,
): Partial<T> {
  if (fieldNames.length === 0) {
    return {};
  }
  if (fieldNames.length === 1) {
    const value = Array.isArray(watched) ? watched[0] : watched;
    return { [fieldNames[0]!]: value } as Partial<T>;
  }
  const row = (Array.isArray(watched) ? watched : [watched]) as T[keyof T][];
  return Object.fromEntries(fieldNames.map((name, index) => [name, row[index]])) as Partial<T>;
}
