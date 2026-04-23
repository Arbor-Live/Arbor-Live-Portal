import { InvoiceEditor } from "@/components/financial/invoice-editor";
import type { Id } from "@/lib/convex-api";

export default async function InvoiceEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvoiceEditor invoiceId={id as Id<"invoices">} />;
}
