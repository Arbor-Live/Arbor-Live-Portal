import { z } from "zod";

const paymentMethodSchema = z.enum(["assu_epay", "ijournal", "granted_transfer"]);

export const paymentProofSubmissionSchema = z
  .object({
    paymentMethod: paymentMethodSchema,
    paymentReference: z.string().trim().min(1, "Payment reference is required"),
  })
  .superRefine((values, ctx) => {
    const reference = values.paymentReference.trim();
    if (values.paymentMethod === "assu_epay") {
      const digits = reference.replace(/^#/, "");
      if (!/^\d+$/.test(digits)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter the ASSU ePay payment number (digits only)",
          path: ["paymentReference"],
        });
      }
    }
    if (values.paymentMethod === "granted_transfer") {
      if (!/^GT-[A-Za-z0-9]+$/i.test(reference)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "GrantEd codes look like GT-XXXXXX",
          path: ["paymentReference"],
        });
      }
    }
    if (values.paymentMethod === "ijournal" && reference.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter the iJournal transfer number",
        path: ["paymentReference"],
      });
    }
  });

export type PaymentProofSubmissionFormValues = z.infer<typeof paymentProofSubmissionSchema>;

export const PAYMENT_PROOF_METHOD_OPTIONS = [
  {
    value: "assu_epay" as const,
    label: "ASSU ePay",
    description: "Payment number from your confirmation email (e.g. 24278)",
    placeholder: "24278",
  },
  {
    value: "ijournal" as const,
    label: "iJournal transfer",
    description: "Transfer number (e.g. ĳ2251454)",
    placeholder: "ĳ2251454",
  },
  {
    value: "granted_transfer" as const,
    label: "GrantEd Group Transfer to VSO #5001",
    description: "Transfer code (e.g. GT-XXXXXX)",
    placeholder: "GT-XXXXXX",
  },
];

export function paymentProofReferenceLabel(method: PaymentProofSubmissionFormValues["paymentMethod"]) {
  switch (method) {
    case "assu_epay":
      return "ASSU ePay payment number";
    case "ijournal":
      return "iJournal transfer number";
    case "granted_transfer":
      return "GrantEd transfer code";
  }
}
