import { InvoicePrintView } from "@/components/financial/invoice-print-view";
import type { Id } from "@/lib/convex-api";

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvoicePrintView invoiceId={id as Id<"invoices">} />;
}
