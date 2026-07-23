"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";

export function BandPayoutsSummary() {
  const counts = useQuery(api.bandPayments.getQueueCounts, {});

  if (counts === undefined) {
    return <p className="text-sm text-muted-foreground">Loading payout queue…</p>;
  }

  const pendingTotal =
    counts.needs_payee + counts.needs_email + counts.awaiting_reply + counts.ready_to_pay;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p>
          <span className="font-medium">Needs payee:</span> {counts.needs_payee}
        </p>
        <p>
          <span className="font-medium">Needs signature request:</span> {counts.needs_email}
        </p>
        <p>
          <span className="font-medium">Awaiting signature:</span> {counts.awaiting_reply}
        </p>
        <p>
          <span className="font-medium">Ready to pay:</span> {counts.ready_to_pay}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        {pendingTotal} pending payout{pendingTotal === 1 ? "" : "s"} · {counts.paid} paid
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/financial-hub/band-payouts">Open band payouts</Link>
      </Button>
    </div>
  );
}
