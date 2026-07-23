"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { CurrencyDollarIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function QueueStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

export function AdminPayoutQueueWidget() {
  const counts = useQuery(api.bandPayments.getQueueCounts, {});

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <CurrencyDollarIcon className="size-4" />
          Band payout queue
        </CardTitle>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/financial-hub/band-payouts">Payouts</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {counts === undefined ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <QueueStat label="Needs payee" value={counts.needs_payee} />
              <QueueStat label="Needs signature request" value={counts.needs_email} />
              <QueueStat label="Awaiting signature" value={counts.awaiting_reply} />
              <QueueStat label="Ready to pay" value={counts.ready_to_pay} />
            </div>
            <p className="text-xs text-muted-foreground">
              {counts.paid} payout{counts.paid === 1 ? "" : "s"} already marked paid.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
