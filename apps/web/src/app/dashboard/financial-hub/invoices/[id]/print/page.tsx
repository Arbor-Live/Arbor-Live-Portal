import { redirect } from "next/navigation";

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/financial-hub/invoices/${id}`);
}
