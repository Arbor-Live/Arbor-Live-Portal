"use client";

import { useState } from "react";
import { StatusPill, type Tone } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatDate, formatUsd } from "@/lib/format";
import { diffQuoteLines, formatUsdDelta, type QuoteLine } from "@/lib/quote-diff";
import { QuoteChangeList } from "./quote-change-list";

export type QuoteRevisionKind =
  | "approved"
  | "reapproval_requested"
  | "change_kept_approval"
  | "matched_approval"
  | "final";

export type QuoteRevision = {
  number: number;
  kind: QuoteRevisionKind;
  totalUsd: number;
  lines: QuoteLine[];
  note?: string;
  actorName?: string;
  recordedLate?: boolean;
  createdAt: number;
};

const KIND_LABELS: Record<QuoteRevisionKind, string> = {
  approved: "Approved",
  reapproval_requested: "Sent for re-approval",
  change_kept_approval: "Changed, approval kept",
  matched_approval: "Changed, discounted to approved total",
  final: "Final invoice",
};

const KIND_TONES: Record<QuoteRevisionKind, Tone> = {
  approved: "emerald",
  reapproval_requested: "amber",
  change_kept_approval: "blue",
  matched_approval: "blue",
  final: "emerald",
};

/**
 * A quote's versions, newest first: each approval and every change after one,
 * with its total, the difference from the version before, and what changed.
 * `pending` adds an unsaved (staff) or not-yet-approved (client) row on top.
 */
export function QuoteVersionHistory({
  revisions,
  pending,
  audience,
}: {
  revisions: QuoteRevision[];
  pending?: { label: string; totalUsd: number } | null;
  audience: "staff" | "client";
}) {
  const [openNumber, setOpenNumber] = useState<number | null>(null);
  const ordered = [...revisions].sort((a, b) => b.number - a.number);

  return (
    <ol className="divide-y border" data-testid="quote-version-history">
      {pending ? (
        <li className="flex items-center gap-3 px-3 py-2 text-sm">
          <span className="w-8 shrink-0 text-xs text-muted-foreground">Now</span>
          <span className="min-w-0 flex-1 text-muted-foreground">{pending.label}</span>
          <span className="shrink-0 font-medium tabular-nums">{formatUsd(pending.totalUsd)}</span>
        </li>
      ) : null}
      {ordered.map((revision, index) => {
        const previous = ordered[index + 1];
        const open = openNumber === revision.number;
        const who =
          revision.kind === "approved"
            ? revision.actorName
              ? `by ${revision.actorName}`
              : ""
            : audience === "staff" && revision.actorName
              ? `by ${revision.actorName}`
              : "by Arbor Live";
        return (
          <li key={revision.number} className="px-3 py-2 text-sm" data-testid={`quote-version-${revision.number}`}>
            <div className="flex items-center gap-3">
              <span className="w-8 shrink-0 text-xs text-muted-foreground tabular-nums">v{revision.number}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={KIND_TONES[revision.kind]} className="h-5">
                    {KIND_LABELS[revision.kind]}
                  </StatusPill>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(revision.createdAt)} {who}
                  </span>
                </div>
                {revision.note ? <p className="mt-1 text-xs wrap-anywhere">“{revision.note}”</p> : null}
                {revision.recordedLate ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Approved before versions were kept; shows the quote as it stood before the next change.
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-medium tabular-nums">{formatUsd(revision.totalUsd)}</p>
                {previous ? (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatUsdDelta(revision.totalUsd - previous.totalUsd, formatUsd)}
                  </p>
                ) : null}
              </div>
            </div>
            {previous ? (
              <div className="mt-1 pl-11">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  aria-expanded={open}
                  onClick={() => setOpenNumber(open ? null : revision.number)}
                >
                  {open ? "Hide changes" : `What changed from v${previous.number}`}
                </Button>
                {open ? (
                  <div className="mt-2">
                    <QuoteChangeList changes={diffQuoteLines(previous.lines, revision.lines)} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
