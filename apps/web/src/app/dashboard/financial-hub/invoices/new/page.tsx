import { InvoiceEditor } from "@/components/financial/invoice-editor";

export default function NewInvoicePage() {
  const today = new Date().toISOString().slice(0, 10);
  return <InvoiceEditor initialIssueDate={today} />;
}
