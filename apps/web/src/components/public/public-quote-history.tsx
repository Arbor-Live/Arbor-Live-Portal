"use client";

import { WarningIcon } from "@phosphor-icons/react";
import { QuoteChangeList } from "@/components/financial/quote-change-list";
import { QuoteVersionHistory, type QuoteRevision } from "@/components/financial/quote-version-history";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/format";
import { diffQuoteLines, formatUsdDelta } from "@/lib/quote-diff";

/**
 * Shown when we changed a quote the client had approved and sent it back:
 * what they approved, what it is now, and the lines that changed.
 */
export function PublicQuoteUpdatedBanner({
  approvalStatus,
  revisions,
}: {
  approvalStatus: string;
  revisions: QuoteRevision[];
}) {
  const latest = revisions[0];
  if (approvalStatus !== "pending" || latest?.kind !== "reapproval_requested") return null;
  const lastApproved = revisions.find((revision) => revision.kind === "approved");
  if (!lastApproved) return null;

  return (
    <Alert
      className="border-status-amber-500/40 bg-status-amber-500/10 text-status-amber-700"
      data-testid="public-quote-updated"
    >
      <WarningIcon aria-hidden />
      <AlertTitle>We updated your quote after you approved it</AlertTitle>
      <AlertDescription className="space-y-3 text-status-amber-700">
        <p>
          You approved {formatUsd(lastApproved.totalUsd)}. It&apos;s now {formatUsd(latest.totalUsd)} (
          {formatUsdDelta(latest.totalUsd - lastApproved.totalUsd, formatUsd)}). Review the changes and approve
          again below.
        </p>
        {latest.note ? <p>&ldquo;{latest.note}&rdquo;</p> : null}
        <div className="bg-background text-foreground">
          <QuoteChangeList changes={diffQuoteLines(lastApproved.lines, latest.lines)} />
        </div>
      </AlertDescription>
    </Alert>
  );
}

/** Every version since the first approval. Hidden until there is one. */
export function PublicQuoteHistory({ revisions }: { revisions: QuoteRevision[] }) {
  if (revisions.length === 0) return null;
  return (
    <Card data-testid="public-quote-history">
      <CardHeader>
        <CardTitle>Quote history</CardTitle>
      </CardHeader>
      <CardContent>
        <QuoteVersionHistory audience="client" revisions={revisions} />
      </CardContent>
    </Card>
  );
}
