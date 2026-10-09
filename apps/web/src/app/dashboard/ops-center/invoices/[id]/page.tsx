import type { Metadata } from "next";
import { InvoiceEditor } from "@/components/financial/invoice-editor";
import { api, type Id } from "@/lib/convex-api";
import { fetchAuthQuery } from "@/lib/auth-server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await fetchAuthQuery(api.invoices.get, { id: id as Id<"invoices"> });
  const number = data?.invoice.invoiceNumber?.trim();
  return { title: number ? `Invoice ${number}` : "Invoice" };
}

export default async function InvoiceEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvoiceEditor invoiceId={id as Id<"invoices">} />;
}
