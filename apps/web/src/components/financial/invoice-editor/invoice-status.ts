import type { Tone } from "@/components/page-header";

export type InvoiceStatus = "draft" | "finalized" | "void";
export type ClientApprovalStatus = "pending" | "approved" | "changes_requested";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  finalized: "Finalized",
  void: "Void",
};

export function invoiceStatusTone(status: InvoiceStatus): Tone {
  if (status === "finalized") return "blue";
  if (status === "void") return "rose";
  return "neutral";
}

export const CLIENT_APPROVAL_LABELS: Record<ClientApprovalStatus, string> = {
  pending: "Awaiting approval",
  approved: "Approved",
  changes_requested: "Changes requested",
};

export function clientApprovalTone(status: ClientApprovalStatus): Tone {
  if (status === "approved") return "emerald";
  if (status === "changes_requested") return "amber";
  return "neutral";
}
