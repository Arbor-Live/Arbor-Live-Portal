"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { PackageIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTimeRange } from "@/lib/format";

const STATUS_LABELS: Record<string, string> = {
  submitted: "Pending review",
  approved: "Approved",
  rejected: "Not approved",
  cancelled: "Cancelled",
};

export function BorrowRequestsWidget() {
  const requests = useQuery(api.equipmentBorrowRequests.listMine);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageIcon className="size-4" />
          Equipment requests
        </CardTitle>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/inventory/borrow-requests">View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {requests === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No equipment requests yet.</p>
        ) : (
          requests.slice(0, 5).map((request) => (
            <div key={request._id} className="rounded-md border px-3 py-2 text-sm">
              <p className="font-medium">{request.purpose}</p>
              <p className="text-xs text-muted-foreground">
                {STATUS_LABELS[request.status] ?? request.status} ·{" "}
                {formatDateTimeRange(request.startAt, request.endAt)}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
