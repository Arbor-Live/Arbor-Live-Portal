"use client";

import { useQuery } from "convex/react";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/convex-api";
import { QuoteVersionHistory } from "../quote-version-history";
import type { InvoiceDraft } from "./use-invoice-draft";

/** What the client approved, and every change since. Hidden until the first approval. */
export function InvoiceVersionsCard({ draft }: { draft: InvoiceDraft }) {
  const { activeInvoiceId, invoice } = draft;
  const revisions = useQuery(api.invoices.listRevisions, activeInvoiceId ? { id: activeInvoiceId } : "skip");
  if (!invoice || !revisions || revisions.length === 0) return null;

  return (
    <Card data-testid="invoice-versions-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClockCounterClockwiseIcon className="size-4 text-muted-foreground" aria-hidden />
          Versions
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          What the client approved, and each change since. The client sees this history too.
        </p>
      </CardHeader>
      <CardContent>
        <QuoteVersionHistory
          audience="staff"
          revisions={revisions}
          pending={
            draft.isDraftDirty ? { label: "Unsaved draft", totalUsd: draft.draftTotals.totalUsd } : null
          }
        />
      </CardContent>
    </Card>
  );
}
