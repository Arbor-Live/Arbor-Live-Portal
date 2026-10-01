import type { Tone } from "@/components/page-header";

/**
 * Where an invoice sits, from draft to paid, as one value. Derived from the
 * invoice status, the client's approval and the payment status the list query
 * resolves, so every surface (list, side panel, filter chips) agrees.
 */
export type InvoiceLifecycle =
  | "draft"
  | "awaiting_approval"
  | "changes_requested"
  | "estimate"
  | "ready_to_finalize"
  | "payment_pending"
  | "proof_received"
  | "overdue"
  | "paid"
  | "void";

export const LIFECYCLE_OPTIONS: { value: InvoiceLifecycle; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "awaiting_approval", label: "Awaiting approval" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "estimate", label: "Approved estimate" },
  { value: "ready_to_finalize", label: "Ready to finalize" },
  { value: "payment_pending", label: "Payment pending" },
  { value: "proof_received", label: "Payment proof received" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

const LIFECYCLE_TONES: Record<InvoiceLifecycle, Tone> = {
  draft: "neutral",
  awaiting_approval: "blue",
  changes_requested: "amber",
  estimate: "emerald",
  ready_to_finalize: "amber",
  payment_pending: "blue",
  proof_received: "amber",
  overdue: "rose",
  paid: "emerald",
  void: "neutral",
};

export function invoiceLifecycle(invoice: {
  status: string;
  clientApprovalStatus?: string;
  paymentStatus?: InvoiceLifecycle | null;
}): InvoiceLifecycle {
  if (invoice.status === "void") return "void";
  if (invoice.status === "draft") return "draft";
  if (invoice.paymentStatus) return invoice.paymentStatus;
  if (invoice.clientApprovalStatus === "changes_requested") return "changes_requested";
  return "awaiting_approval";
}

export function lifecycleLabel(lifecycle: InvoiceLifecycle) {
  return LIFECYCLE_OPTIONS.find((option) => option.value === lifecycle)?.label ?? lifecycle;
}

export function lifecycleTone(lifecycle: InvoiceLifecycle): Tone {
  return LIFECYCLE_TONES[lifecycle];
}

export type InvoiceGroupId = "needs_you" | "waiting" | "closed";

/** The list's groups, in workflow order: what Arbor has to do first. */
export const INVOICE_GROUPS: {
  id: InvoiceGroupId;
  label: string;
  description: string;
  stages: InvoiceLifecycle[];
}[] = [
  {
    id: "needs_you",
    label: "Needs you",
    description:
      "Drafts to finish, changes to make, final invoices to send after events, proof to verify, and overdue payments to chase.",
    stages: ["draft", "changes_requested", "ready_to_finalize", "proof_received", "overdue"],
  },
  {
    id: "waiting",
    label: "Waiting on the client",
    description:
      "Sent for approval, approved and waiting for the event (payment opens with the final invoice), or waiting on payment.",
    stages: ["awaiting_approval", "estimate", "payment_pending"],
  },
  {
    id: "closed",
    label: "Closed",
    description: "Paid or void.",
    stages: ["paid", "void"],
  },
];
