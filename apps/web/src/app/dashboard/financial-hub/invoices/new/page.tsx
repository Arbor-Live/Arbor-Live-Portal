import { InvoiceEditor } from "@/components/financial/invoice-editor";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New invoice",
};

export default function NewInvoicePage() {
  const today = new Date().toISOString().slice(0, 10);
  return <InvoiceEditor initialIssueDate={today} />;
}
