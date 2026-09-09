import { z } from "zod";

const paymentMethodSchema = z.enum(["assu_epay", "ijournal", "granted_transfer"]);

const PAYMENT_PROOF_HELP =
  "If you have any questions, contact your event manager or arborlive@stanford.edu.";

function normalizeIjournalReference(raw: string) {
  // Accept the Unicode ij ligature some systems display (ĳ / Ĳ).
  return raw.trim().replace(/^[ĳĲ]/u, "ij");
}

function paymentProofReferenceIssue(message: string) {
  return {
    code: z.ZodIssueCode.custom,
    message: `${message} ${PAYMENT_PROOF_HELP}`,
    path: ["paymentReference"] as const,
  };
}

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
        ctx.addIssue(
          paymentProofReferenceIssue(
            "Enter the ASSU ePay payment number as shown in the example (e.g. 24278).",
          ),
        );
      }
      return;
    }
    if (values.paymentMethod === "granted_transfer") {
      if (/^GT-[A-Za-z0-9]+$/i.test(reference)) return;
      if (/^[A-Za-z]+-/i.test(reference)) {
        ctx.addIssue(
          paymentProofReferenceIssue(
            'You submitted the incorrect payment type in GrantEd. Resubmit using the "Group Transfer" option under the "Transfers" tab (codes look like GT-XXXXXX).',
          ),
        );
        return;
      }
      ctx.addIssue(
        paymentProofReferenceIssue(
          "Enter the GrantEd Group Transfer code as shown in the example (e.g. GT-XXXXXX).",
        ),
      );
      return;
    }
    const ijournal = normalizeIjournalReference(reference);
    if (/^ij\d+$/i.test(ijournal)) return;
    if (ijournal.includes("-")) {
      ctx.addIssue(
        paymentProofReferenceIssue(
          "We do not accept PTAs as proof of payment. Payment must be submitted, and you must provide an iJournal number (e.g. ij2251454).",
        ),
      );
      return;
    }
    ctx.addIssue(
      paymentProofReferenceIssue(
        "Enter an iJournal number in the form ij followed by digits (e.g. ij2251454).",
      ),
    );
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
    description: "Transfer number (e.g. ij2251454)",
    placeholder: "ij2251454",
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
