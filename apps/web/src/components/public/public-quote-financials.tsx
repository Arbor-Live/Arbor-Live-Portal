"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/format";

function QuoteSection({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ _id: string; label: string; quantity: number; quantityDetail?: string; rateUsd: number; amountUsd: number; notes?: string }>;
}) {
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((line) => (
          <div key={line._id} className="rounded-md border px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span>{line.label}</span>
              <span>
                {line.quantity}
                {line.quantityDetail ? ` (${line.quantityDetail})` : ""} x {formatUsd(line.rateUsd)} = {formatUsd(line.amountUsd)}
              </span>
            </div>
            {line.notes ? <p className="mt-1 text-xs text-muted-foreground">{line.notes}</p> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function PublicQuoteFinancials({
  lineItems,
  totals,
}: {
  lineItems: Array<{ _id: string; section: string; label: string; quantity: number; quantityDetail?: string; rateUsd: number; amountUsd: number; notes?: string }>;
  totals: {
    equipmentSubtotalUsd: number;
    externalRentalsSubtotalUsd: number;
    artistsSubtotalUsd: number;
    crewSubtotalUsd: number;
    feesSubtotalUsd: number;
    subtotalUsd: number;
    discountAmountUsd: number;
    totalUsd: number;
  };
}) {
  const grouped = {
    equipment: lineItems.filter((line) => line.section === "equipment_package" || line.section === "equipment_type"),
    external: lineItems.filter((line) => line.section === "external_rental"),
    artists: lineItems.filter((line) => line.section === "artist"),
    crew: lineItems.filter((line) => line.section === "crew"),
    fees: lineItems.filter((line) => line.section === "fee"),
  };
  return (
    <div className="space-y-4">
      <QuoteSection title="Equipment" rows={grouped.equipment} />
      <QuoteSection title="External Rentals" rows={grouped.external} />
      <QuoteSection title="Artists" rows={grouped.artists} />
      <QuoteSection title="Crew" rows={grouped.crew} />
      <QuoteSection title="Fees" rows={grouped.fees} />
      <Card>
        <CardHeader>
          <CardTitle>Totals</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-2">
          <p>Equipment: {formatUsd(totals.equipmentSubtotalUsd)}</p>
          <p>External rentals: {formatUsd(totals.externalRentalsSubtotalUsd)}</p>
          <p>Artists: {formatUsd(totals.artistsSubtotalUsd)}</p>
          <p>Crew: {formatUsd(totals.crewSubtotalUsd)}</p>
          <p>Fees: {formatUsd(totals.feesSubtotalUsd)}</p>
          <p>Subtotal: {formatUsd(totals.subtotalUsd)}</p>
          <p>Discount: -{formatUsd(totals.discountAmountUsd)}</p>
          <p className="text-base font-semibold">Total: {formatUsd(totals.totalUsd)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
