"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { InvoicePdfDownloadButton } from "@/components/financial/invoice-pdf-download-button";
import { Button } from "@/components/ui/button";

export function InvoicePrintView({ invoiceId }: { invoiceId: Id<"invoices"> }) {
  const data = useQuery(api.invoices.get, { id: invoiceId });

  if (data === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Invoice not found.</p>;

  const invoiceNumber = data.invoice.invoiceNumber;

  return (
    <div className="mx-auto max-w-lg space-y-4 py-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Invoice {invoiceNumber}</h1>
        <p className="text-sm text-muted-foreground">
          Download a PDF copy generated with the same document renderer used for client emails and
          portal downloads.
        </p>
      </div>
      <InvoicePdfDownloadButton
        invoiceId={invoiceId}
        invoiceNumber={invoiceNumber}
        label="Download invoice PDF"
      />
      <Button type="button" variant="ghost" asChild>
        <Link href={`/dashboard/financial-hub/invoices/${invoiceId}`}>Back to invoice editor</Link>
      </Button>
    </div>
  );
}
