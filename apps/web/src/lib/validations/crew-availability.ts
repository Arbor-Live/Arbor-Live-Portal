import { z } from "zod";

export const crewAvailabilityResponseSchema = z.object({
  responseStatus: z.enum(["yes", "partial", "only_if_necessary", "no"]),
  notes: z.string().optional(),
});

export type CrewAvailabilityResponseFormValues = z.infer<typeof crewAvailabilityResponseSchema>;

export const publicQuoteApprovalSchema = z.object({
  termsAccepted: z.boolean().refine((val) => val, { message: "You must accept the terms" }),
  note: z.string().optional(),
});

export type PublicQuoteApprovalFormValues = z.infer<typeof publicQuoteApprovalSchema>;

export const publicQuoteChangeRequestSchema = z.object({
  note: z.string().min(1, "Please describe the changes you need"),
});

export type PublicQuoteChangeRequestFormValues = z.infer<typeof publicQuoteChangeRequestSchema>;
