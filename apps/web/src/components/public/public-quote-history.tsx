"use client";

import { ChatTextIcon, WarningIcon } from "@phosphor-icons/react";
import { QuoteChangeList } from "@/components/financial/quote-change-list";
import { QuoteVersionHistory, type QuoteRevision } from "@/components/financial/quote-version-history";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/format";
import { diffQuoteLines, formatUsdDelta } from "@/lib/quote-diff";

/**
 * Shown when the quote is back with the client: we changed one they had
 * approved, or answered the changes they asked for. What it was, what it is
 * now, and the lines that changed.
 */
export function PublicQuoteUpdatedBanner({
  approvalStatus,
  revisions,
}: {
  approvalStatus: string;
  revisions: QuoteRevision[];
}) {
  const latest = revisions[0];
  if (approvalStatus !== "pending" || !latest) return null;
  const request = latest.kind === "sent" && revisions[1]?.kind === "changes_requested" ? revisions[1] : null;
  if (request) return <PublicQuoteRevisedBanner request={request} reply={latest} />;
  if (latest.kind !== "reapproval_requested") return null;
  const lastApproved = revisions.find((revision) => revision.kind === "approved");
  if (!lastApproved) return null;

  return (
    <Alert
      className="border-status-amber-500/40 bg-status-amber-500/10 text-status-amber-700 dark:text-status-amber-300"
      data-testid="public-quote-updated"
    >
      <WarningIcon aria-hidden />
      <AlertTitle>We updated your quote after you approved it</AlertTitle>
      <AlertDescription className="space-y-3 text-status-amber-700 dark:text-status-amber-300">
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

/** Our reply to the changes they asked for: their request, our note, and what changed. */
function PublicQuoteRevisedBanner({ request, reply }: { request: QuoteRevision; reply: QuoteRevision }) {
  const changes = diffQuoteLines(request.lines, reply.lines);
  const delta = reply.totalUsd - request.totalUsd;
  return (
    <Alert
      className="border-status-blue-500/40 bg-status-blue-500/10 text-status-blue-700 dark:text-status-blue-200"
      data-testid="public-quote-revised"
    >
      <ChatTextIcon aria-hidden />
      <AlertTitle>We answered your change request</AlertTitle>
      <AlertDescription className="space-y-3 text-status-blue-700 dark:text-status-blue-200">
        {request.note ? <p className="whitespace-pre-line">You asked: &ldquo;{request.note}&rdquo;</p> : null}
        {reply.note ? <p className="whitespace-pre-line">&ldquo;{reply.note}&rdquo;</p> : null}
        <p>
          {Math.abs(delta) < 0.005 && changes.length === 0
            ? `The quote is unchanged at ${formatUsd(reply.totalUsd)}.`
            : `It was ${formatUsd(request.totalUsd)}; it's now ${formatUsd(reply.totalUsd)} (${formatUsdDelta(delta, formatUsd)}).`}{" "}
          Approve it below, or ask for more changes.
        </p>
        {changes.length > 0 ? (
          <div className="bg-background text-foreground">
            <QuoteChangeList changes={changes} />
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

/** Every version sent, asked about, or approved. Hidden until there is one. */
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
