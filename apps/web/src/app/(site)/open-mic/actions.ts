"use server";

import { fetchMutation } from "convex/nextjs";
import { api, type Id } from "@/lib/convex-api";
import {
  openMicSignupSchema,
  toSubmitPayload,
  type OpenMicSignupFormValues,
} from "@/lib/validations/open-mic";

export type SubmitOpenMicSignupResult =
  | { ok: true; nightTitle: string; nightStartAt: number }
  | { ok: false; message: string; fieldErrors?: Partial<Record<keyof OpenMicSignupFormValues, string>> };

export async function submitOpenMicSignup(
  eventId: string,
  raw: OpenMicSignupFormValues,
): Promise<SubmitOpenMicSignupResult> {
  const parsed = openMicSignupSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof OpenMicSignupFormValues, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key as keyof OpenMicSignupFormValues]) {
        fieldErrors[key as keyof OpenMicSignupFormValues] = issue.message;
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
    const result = await fetchMutation(api.openMic.submitPublic, {
      ...payload,
      eventId: eventId as Id<"events">,
    });
    return { ok: true, nightTitle: result.nightTitle, nightStartAt: result.nightStartAt };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to submit your sign-up. Please try again.",
    };
  }
}