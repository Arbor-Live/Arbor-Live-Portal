"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function currency(value: number) {
  return `$${value.toFixed(2)}`;
}

export function InvoicePrintView({ invoiceId }: { invoiceId: Id<"invoices"> }) {
  const data = useQuery(api.invoices.get, { id: invoiceId });
  const createExport = useMutation(api.invoicePdf.createExportRecord);

  const sections = useMemo(() => {
    if (!data) return null;
    return {
      equipment: data.lineItems.filter((line) => line.section === "equipment_package" || line.section === "equipment_type"),
      external: data.lineItems.filter((line) => line.section === "external_rental"),
      artists: data.lineItems.filter((line) => line.section === "artist"),
      crew: data.lineItems.filter((line) => line.section === "crew"),
      fees: data.lineItems.filter((line) => line.section === "fee"),
    };
  }, [data]);

  if (data === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data || !sections) return <p className="text-sm text-muted-foreground">Invoice not found.</p>;
  const invoice = data.invoice;

  async function onPrint() {
    await createExport({
      invoiceId,
      generatedByUserId: invoice.managerUserId,
      generatedByName: invoice.managerName,
      fileName: `${invoice.invoiceNumber}.pdf`,
      downloadUrl: undefined,
    });
    window.print();
  }

  return (
    <div className="invoice-print-root space-y-4 print:space-y-2">
      <style jsx global>{`
        @media print {
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
        }
      `}</style>

      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">Invoice {data.invoice.invoiceNumber}</h1>
        <Button onClick={() => void onPrint()}>Print / Save PDF</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-start">
            <img
              src="/logo.svg"
              alt="Arbor Live logo"
              className="h-12 w-auto brightness-0 dark:invert"
            />
            <div className="space-y-1 text-sm">
              <CardTitle className="text-xl">Arbor Live</CardTitle>
              <p>Office of Student Engagement</p>
              <p>
                <a className="underline" href="mailto:arborlive@stanford.edu">
                  arborlive@stanford.edu
                </a>
              </p>
              <p>
                <a className="underline" href="http://arborlive.stanford.edu" target="_blank" rel="noreferrer">
                  arborlive.stanford.edu
                </a>
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-6 text-sm">
          <div className="space-y-1 print:space-y-0.5">
            <p className="font-medium">Invoice Details</p>
            <p><span className="font-medium">Issue date:</span> {data.invoice.issueDate}</p>
            {data.invoice.dueDate ? <p><span className="font-medium">Due date:</span> {data.invoice.dueDate}</p> : null}
            <p><span className="font-medium">Manager:</span> {data.invoice.managerName}</p>
            {data.invoice.managerEmail ? <p><span className="font-medium">Manager email:</span> {data.invoice.managerEmail}</p> : null}
          </div>
          <div className="space-y-1 print:space-y-0.5">
            <p className="font-medium">Contact Details</p>
            {data.invoice.clientGroupName ? <p><span className="font-medium">Group:</span> {data.invoice.clientGroupName}</p> : null}
            {data.invoice.clientContactName ? <p><span className="font-medium">Contact:</span> {data.invoice.clientContactName}</p> : null}
            {data.invoice.clientEmail ? <p><span className="font-medium">Client email:</span> {data.invoice.clientEmail}</p> : null}
            {data.invoice.clientPhone ? <p><span className="font-medium">Client phone:</span> {data.invoice.clientPhone}</p> : null}
          </div>
        </CardContent>
      </Card>

      {sections.equipment.length ? <SectionTable title="Equipment" rows={sections.equipment} /> : null}
      {sections.external.length ? <SectionTable title="External Rentals" rows={sections.external} showProvider /> : null}
      {sections.artists.length ? <SectionTable title="Artists" rows={sections.artists} /> : null}
      {sections.crew.length ? <SectionTable title="Crew" rows={sections.crew} /> : null}
      {sections.fees.length ? <SectionTable title="Fees" rows={sections.fees} /> : null}

      <Card>
        <CardHeader><CardTitle>Payment Methods</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <a className="underline" href="https://assuepay.stanford.edu/" target="_blank" rel="noreferrer">
              ASSU ePay
            </a>{" "}
            or <span className="font-medium">GrantEd Group Transfer</span>
          </p>
          <p>VSO: <span className="font-medium">Arbor Live (5001)</span></p>
          <div className="my-2 border-t" />
          <p className="font-medium">iJournal PTA</p>
          <p>PTA: <span className="font-medium">1056598-1-ZBABS</span></p>
          <p>Approver: <span className="font-medium">O’Niel Patrick</span></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Totals</CardTitle></CardHeader>
        <CardContent className="grid gap-1 text-sm md:grid-cols-2">
          <p>Equipment: {currency(data.invoice.equipmentSubtotalUsd)}</p>
          <p>External rentals: {currency(data.invoice.externalRentalsSubtotalUsd)}</p>
          <p>Artists: {currency(data.invoice.artistsSubtotalUsd)}</p>
          <p>Crew: {currency(data.invoice.crewSubtotalUsd)}</p>
          <p>Fees: {currency(data.invoice.feesSubtotalUsd)}</p>
          <p>Subtotal: {currency(data.invoice.subtotalUsd)}</p>
          <p>Discount: -{currency(data.invoice.discountAmountUsd)}</p>
          <p className="font-semibold">Total: {currency(data.invoice.totalUsd)}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function SectionTable({
  title,
  rows,
  showProvider,
}: {
  title: string;
  rows: Array<{ _id: string; provider?: string; label: string; quantity: number; rateUsd: number; amountUsd: number }>;
  showProvider?: boolean;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              {showProvider ? <th className="p-2 text-left">Provider</th> : null}
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-left">Qty</th>
              <th className="p-2 text-left">Rate</th>
              <th className="p-2 text-left">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row._id} className="border-b align-top">
                {showProvider ? <td className="p-2">{row.provider || "—"}</td> : null}
                <td className="p-2">{row.label}</td>
                <td className="p-2">{row.quantity}</td>
                <td className="p-2">{currency(row.rateUsd)}</td>
                <td className="p-2">{currency(row.amountUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
