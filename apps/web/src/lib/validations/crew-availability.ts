import { z } from "zod";

export const crewAvailabilityResponseSchema = z.object({
  responseStatus: z.enum(["yes", "partial", "only_if_necessary", "no"]),
  notes: z.string().optional(),
});

export type CrewAvailabilityResponseFormValues = z.infer<typeof crewAvailabilityResponseSchema>;

const paymentSubmitterFields = {
  clientIsPaymentSubmitter: z.boolean(),
  paymentSubmitterName: z.string().optional(),
  paymentSubmitterEmail: z.union([z.string().trim().email("Enter a valid email"), z.literal("")]).optional(),
};

function refinePaymentSubmitter(
  values: z.infer<z.ZodObject<typeof paymentSubmitterFields>>,
  ctx: z.RefinementCtx,
) {
  if (!values.clientIsPaymentSubmitter) {
    if (!values.paymentSubmitterName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter the Financial Officer or Paying party name",
        path: ["paymentSubmitterName"],
      });
    }
    if (!values.paymentSubmitterEmail?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter the Financial Officer or Paying party email",
        path: ["paymentSubmitterEmail"],
      });
    }
  }
}

export const publicQuoteApprovalSchema = z
  .object({
    signedName: z.string().trim().min(2, "Type your full name to electronically sign"),
    ...paymentSubmitterFields,
  })
  .superRefine(refinePaymentSubmitter);

export type PublicQuoteApprovalFormValues = z.infer<typeof publicQuoteApprovalSchema>;

export const publicPaymentContactsSchema = z
  .object(paymentSubmitterFields)
  .superRefine(refinePaymentSubmitter);

export type PublicPaymentContactsFormValues = z.infer<typeof publicPaymentContactsSchema>;

export const publicQuoteChangeRequestSchema = z.object({
  note: z.string().min(1, "Please describe the changes you need"),
});

export type PublicQuoteChangeRequestFormValues = z.infer<typeof publicQuoteChangeRequestSchema>;
