"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ClipboardTextIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";

export function AdminBookingRequestsWidget() {
  const requests = useQuery(api.dashboardHome.listOpenBookingRequests, {
    limit: 5,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardTextIcon className="size-4" />
          Booking requests
        </CardTitle>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/events/requests">Open queue</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {requests === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open booking requests right now.</p>
        ) : (
          requests.map((request) => (
            <Link
              key={request._id}
              href={`/dashboard/events/requests/${request._id}`}
              className="block rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {request.eventName?.trim() || request.organization?.trim() || request.requestNumber}
                </p>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {request.status === "in_review" ? "In review" : "Submitted"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {request.requestNumber}
                {request.venueName ? ` · ${request.venueName}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Submitted {formatDateTime(request.submittedAt)}
              </p>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
