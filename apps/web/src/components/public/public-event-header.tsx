"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function PublicEventHeader({
  title,
  eventType,
  venueName,
  host,
  startAt,
  endAt,
  status,
}: {
  title: string;
  eventType?: string;
  venueName?: string;
  host?: string;
  startAt: number;
  endAt: number;
  status: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>
          {formatDateTime(startAt)} {"->"} {formatDateTime(endAt)}
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          {eventType ? <span className="rounded bg-muted px-2 py-0.5">{eventType}</span> : null}
          {venueName ? <span className="rounded bg-muted px-2 py-0.5">{venueName}</span> : null}
          {host ? <span className="rounded bg-muted px-2 py-0.5">Host: {host}</span> : null}
          <span className="rounded bg-muted px-2 py-0.5">Status: {status}</span>
        </div>
      </CardContent>
    </Card>
  );
}
