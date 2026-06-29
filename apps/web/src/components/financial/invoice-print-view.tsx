"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { buildInvoiceDocumentData, InvoiceDocumentWeb } from "@arbor/invoice-document/web";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";

export function InvoicePrintView({ invoiceId }: { invoiceId: Id<"invoices"> }) {
  const data = useQuery(api.invoices.get, { id: invoiceId });
  const createExport = useMutation(api.invoicePdf.createExportRecord);

  const documentData = useMemo(() => {
    if (!data) return null;
    const invoice = data.invoice;
    const digitalQuoteUrl =
      invoice.publicApprovalToken && typeof window !== "undefined"
        ? `${window.location.origin}/public/quote/${invoice.publicApprovalToken}`
        : invoice.publicApprovalToken
          ? `/public/quote/${invoice.publicApprovalToken}`
          : undefined;

    return buildInvoiceDocumentData({
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        managerName: invoice.managerName,
        managerEmail: invoice.managerEmail,
        clientGroupName: invoice.clientGroupName,
        clientContactName: invoice.clientContactName,
        clientEmail: invoice.clientEmail,
        clientPhone: invoice.clientPhone,
        clientApprovalStatus: invoice.clientApprovalStatus,
        digitalQuoteUrl,
        equipmentSubtotalUsd: invoice.equipmentSubtotalUsd,
        externalRentalsSubtotalUsd: invoice.externalRentalsSubtotalUsd,
        artistsSubtotalUsd: invoice.artistsSubtotalUsd,
        crewSubtotalUsd: invoice.crewSubtotalUsd,
        feesSubtotalUsd: invoice.feesSubtotalUsd,
        subtotalUsd: invoice.subtotalUsd,
        discountAmountUsd: invoice.discountAmountUsd,
        totalUsd: invoice.totalUsd,
        notes: invoice.notes,
      },
      lineItems: data.lineItems.map((line) => ({
        id: line._id,
        section: line.section,
        provider: line.provider,
        label: line.label,
        quantity: line.quantity,
        rateUsd: line.rateUsd,
        amountUsd: line.amountUsd,
      })),
    });
  }, [data]);

  if (data === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data || !documentData) return <p className="text-sm text-muted-foreground">Invoice not found.</p>;

  async function onPrint() {
    if (!data) return;
    await createExport({
      invoiceId,
      fileName: `${data.invoice.invoiceNumber}.pdf`,
      downloadUrl: undefined,
    });
    window.print();
  }

  return (
    <div className="invoice-print-root space-y-4 print:space-y-2">
      <style jsx global>{`
        @media print {
          @page {
            size: auto;
            margin: 0.4in;
          }
          body * {
            visibility: hidden;
          }
          .invoice-print-root,
          .invoice-print-root * {
            visibility: visible;
          }
          .invoice-print-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .invoice-print-root {
            gap: 0.4rem !important;
          }
        }
      `}</style>

      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">Invoice {data.invoice.invoiceNumber}</h1>
        <Button onClick={() => void onPrint()}>Print / Save PDF</Button>
      </div>

      <InvoiceDocumentWeb data={documentData} logoSrc="/logo.svg" />
    </div>
  );
}
