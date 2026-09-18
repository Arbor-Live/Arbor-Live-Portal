"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { notify } from "@/lib/notify";
import { formatDate } from "@/lib/format";

type StatusFilter = "all" | "subscribed" | "unsubscribed";

export function NewsletterSubscribersManager() {
  const config = useQuery(api.newsletter.getBroadcastConfig, {});
  const [filter, setFilter] = useState<StatusFilter>("all");
  const listing = useQuery(api.newsletter.listSubscribers, {
    status: filter === "all" ? undefined : filter,
    limit: 200,
  });
  const sendNow = useMutation(api.newsletter.sendNow);

  const counts = listing?.counts;

  const rows = useMemo(() => listing?.subscribers ?? [], [listing]);

  if (config === undefined || listing === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>This Week at Arbor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Sending from</span>
            <code className="rounded bg-muted px-1.5 py-0.5">{config.from}</code>
            {config.segmentConfigured ? (
              <Badge variant="secondary">Resend segment configured</Badge>
            ) : (
              <Badge variant="destructive">No Resend segment</Badge>
            )}
            {config.testMode ? <Badge variant="outline">Test mode</Badge> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {(["all", "subscribed", "unsubscribed"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? "default" : "outline"}
                onClick={() => setFilter(value)}
              >
                {value === "all" ? "All" : value}
                {counts
                  ? ` (${
                      value === "all"
                        ? counts.subscribed + counts.unsubscribed
                        : counts[value]
                    })`
                  : ""}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void sendNow()
                  .then(() => notify.success("Newsletter send queued."))
                  .catch((error: unknown) =>
                    notify.error(
                      error instanceof Error ? error.message : "Could not queue the send.",
                    ),
                  );
              }}
            >
              Send now
            </Button>
          </div>

          <div className="divide-y rounded-md border">
            {rows.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No subscribers yet.</p>
            ) : (
              rows.map((row) => (
                <div
                  key={row.subscriberId}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.name ? `${row.name} · ` : ""}
                      {row.source}
                      {row.createdAt ? ` · joined ${formatDate(row.createdAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {row.syncError ? (
                      <SyncedBadge
                        subscriberId={row.subscriberId}
                        error={row.syncError}
                      />
                    ) : null}
                    <Badge
                      variant={row.status === "subscribed" ? "secondary" : "destructive"}
                    >
                      {row.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SyncedBadge({
  subscriberId,
  error,
}: {
  subscriberId: string;
  error: string;
}) {
  const retrySync = useMutation(api.newsletter.retrySync);
  return (
    <button
      type="button"
      title={error}
      className="text-xs font-medium text-destructive underline-offset-2 hover:underline"
      onClick={() => {
        void retrySync({ subscriberId: subscriberId as never })
          .then(() => notify.success("Sync retried."))
          .catch((retryError: unknown) =>
            notify.error(
              retryError instanceof Error ? retryError.message : "Retry failed.",
            ),
          );
      }}
    >
      Sync failed — retry
    </button>
  );
}
