"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  in_review: "In review",
  converted: "Converted to event",
  declined: "Declined",
};

const LIFECYCLE_STEPS = [
  { key: "submitted", label: "Request received" },
  { key: "in_review", label: "Under review" },
  { key: "converted", label: "Event planning" },
] as const;

function statusIndex(status: string) {
  if (status === "declined") return 0;
  if (status === "submitted") return 0;
  if (status === "in_review") return 1;
  return 2;
}

export function PublicRequestLifecycleClient({ token }: { token: string }) {
  const request = useQuery(api.eventRequests.getPublicRequestByToken, { token });

  if (request === undefined) {
    return <p className="text-sm text-muted-foreground">Loading your request...</p>;
  }
  if (!request) {
    return <p className="text-sm text-muted-foreground">This request link is invalid or expired.</p>;
  }

  const activeIndex = statusIndex(request.status);
  const isDeclined = request.status === "declined";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Request {request.requestNumber}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Status: <span className="font-medium">{STATUS_LABELS[request.status] ?? request.status}</span>
          </p>
          <p className="text-muted-foreground">
            Submitted {new Date(request.submittedAt).toLocaleString()}
          </p>
          <p>
            {request.firstName} {request.lastName} · {request.email}
          </p>
          {request.organization ? <p>Organization: {request.organization}</p> : null}
          <p>
            {request.eventCategory} · {request.eventDateText}
          </p>
          <p>
            {request.eventStartTimeText} – {request.eventEndTimeText}
          </p>
          {request.expectedTurnout >= 200 ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-amber-800">
              Major event ({request.expectedTurnout} guests) — our team will follow up with additional
              coordination steps.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Request lifecycle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isDeclined ? (
            <p className="text-sm text-muted-foreground">
              This request was declined. Contact arborlive@stanford.edu if you have questions.
            </p>
          ) : (
            LIFECYCLE_STEPS.map((step, index) => (
              <div key={step.key} className="flex items-center gap-3 text-sm">
                <span
                  className={`flex size-6 items-center justify-center rounded-full border text-xs ${
                    index <= activeIndex ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {index + 1}
                </span>
                <span className={index <= activeIndex ? "font-medium" : "text-muted-foreground"}>{step.label}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {request.convertedEventId ? (
        <Button asChild>
          <Link href={`/dashboard/events/${request.convertedEventId}`}>View event (staff)</Link>
        </Button>
      ) : null}
    </div>
  );
}
