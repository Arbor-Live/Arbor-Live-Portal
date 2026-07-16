"use server";

import { fetchMutation } from "convex/nextjs";
import { api, type Id } from "@/lib/convex-api";
import {
  bookingRequestSchema,
  toSubmitPayload,
  type BookingRequestFormValues,
} from "@/lib/validations/booking-request";

export type SubmitBookingRequestResult =
  | { ok: true; publicToken: string; requestNumber: string }
  | { ok: false; message: string; fieldErrors?: Partial<Record<keyof BookingRequestFormValues, string>> };

export async function submitBookingRequest(
  raw: BookingRequestFormValues,
): Promise<SubmitBookingRequestResult> {
  const parsed = bookingRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof BookingRequestFormValues, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key as keyof BookingRequestFormValues]) {
        fieldErrors[key as keyof BookingRequestFormValues] = issue.message;
      }
    }
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  const payload = toSubmitPayload(parsed.data);

  try {
    const result = await fetchMutation(api.eventRequests.submitPublic, {
      ...payload,
      venueId: payload.venueId ? (payload.venueId as Id<"venues">) : undefined,
      invoiceGroupId: payload.invoiceGroupId
        ? (payload.invoiceGroupId as Id<"invoiceGroups">)
        : undefined,
    });
    return { ok: true, publicToken: result.publicToken, requestNumber: result.requestNumber };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to submit your request. Please try again.",
    };
  }
}
