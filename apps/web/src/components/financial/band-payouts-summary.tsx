"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { TONE_DOT } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  PAYOUT_GROUPS,
  PAYOUT_STAGE_LABELS,
  payoutStageTone,
  type PayoutStage,
} from "@/lib/band-payout-stages";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The payouts pipeline's stage counts and totals: what needs Arbor, then everything else. */
export function BandPayoutsSummary() {
  const counts = useQuery(api.bandPayments.getQueueCounts, {});

  if (counts === undefined) {
    return <p className="text-sm text-muted-foreground">Loading payouts…</p>;
  }

  const byStage: Record<PayoutStage, { count: number; totalUsd: number }> = {
    upcoming: { count: counts.upcoming, totalUsd: counts.totalsUsd.upcoming },
    waiting_on_artist: {
      count: counts.needs_onboarding + counts.needs_payee,
      totalUsd: counts.totalsUsd.needs_onboarding + counts.totalsUsd.needs_payee,
    },
    ready_to_send: { count: counts.needs_email, totalUsd: counts.totalsUsd.needs_email },
    waiting_on_signature: { count: counts.awaiting_reply, totalUsd: counts.totalsUsd.awaiting_reply },
    ready_to_pay: { count: counts.ready_to_pay, totalUsd: counts.totalsUsd.ready_to_pay },
    paid: { count: counts.paid, totalUsd: counts.totalsUsd.paid },
  };

  return (
    <div className="space-y-3">
      <div className="space-y-3" data-testid="payouts-hub-summary">
        {PAYOUT_GROUPS.map((group) => (
          <div key={group.id} className="space-y-1">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</p>
            <ul className="divide-y border text-sm">
              {group.stages.map((stage) => (
                <li key={stage}>
                  <Link
                    href={`/dashboard/financial-hub/artist-payouts#payout-stage-${stage}`}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30"
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[payoutStageTone(stage)])} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{PAYOUT_STAGE_LABELS[stage]}</span>
                    <span className="w-8 text-right text-muted-foreground tabular-nums">{byStage[stage].count}</span>
                    <span className="w-20 text-right tabular-nums">{formatUsd(byStage[stage].totalUsd)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/financial-hub/artist-payouts">Open artist payouts</Link>
      </Button>
    </div>
  );
}
