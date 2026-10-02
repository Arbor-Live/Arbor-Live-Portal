"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { EmptyState, ListSummary, RowList, RowText } from "@/components/list-page";
import { StatusPill } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAppDialog } from "@/components/ui/app-dialog";
import { getConvexErrorMessage } from "@/lib/convex-error";
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
  const retrySync = useMutation(api.newsletter.retrySync);
  const { confirm } = useAppDialog();
  const [sending, setSending] = useState(false);

  const counts = listing?.counts;
  const rows = listing?.subscribers ?? [];
  const total = counts ? counts.subscribed + counts.unsubscribed : 0;
  const syncErrors = rows.filter((row) => row.syncError).length;

  async function handleSendNow() {
    const ok = await confirm({
      title: "Send This Week at Arbor now?",
      description: `It goes to all ${counts?.subscribed ?? 0} subscribers straight away, outside the weekly schedule. This can't be undone.`,
      confirmLabel: "Send newsletter",
      destructive: true,
    });
    if (!ok) return;
    setSending(true);
    try {
      await sendNow();
      notify.success("Newsletter send queued.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  async function handleRetry(subscriberId: Id<"newsletterSubscribers">) {
    try {
      await retrySync({ subscriberId });
      notify.success("Sync retried.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  return (
    <Card data-testid="newsletter-settings">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2">
            <EnvelopeSimpleIcon className="size-4 text-muted-foreground" aria-hidden />
            This Week at Arbor
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            The weekly newsletter of upcoming public events. People sign up from the public site.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={sending || !config || !counts?.subscribed}
          onClick={() => void handleSendNow()}
        >
          {sending ? "Sending…" : "Send now"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {config === undefined || listing === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Sends from</span>
              <code className="bg-muted px-1.5 py-0.5 text-xs">{config.from}</code>
              {config.segmentConfigured ? (
                <StatusPill tone="emerald" className="h-6">
                  Resend segment set up
                </StatusPill>
              ) : (
                <StatusPill tone="rose" className="h-6">
                  No Resend segment
                </StatusPill>
              )}
              {config.testMode ? (
                <StatusPill tone="amber" className="h-6">
                  Test mode
                </StatusPill>
              ) : null}
            </div>
            {!config.segmentConfigured ? (
              <p className="text-sm text-muted-foreground">
                Without a Resend segment, sign-ups are saved here but the newsletter can&apos;t go out.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <ListSummary testId="newsletter-summary">
                {total} {total === 1 ? "subscriber" : "subscribers"} · {counts?.subscribed ?? 0} subscribed ·{" "}
                {counts?.unsubscribed ?? 0} unsubscribed
                {syncErrors ? ` · ${syncErrors} failed to sync` : ""}
              </ListSummary>
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={filter}
                onValueChange={(value) => {
                  if (value) setFilter(value as StatusFilter);
                }}
                aria-label="Show subscribers"
              >
                <ToggleGroupItem value="all">All</ToggleGroupItem>
                <ToggleGroupItem value="subscribed">Subscribed</ToggleGroupItem>
                <ToggleGroupItem value="unsubscribed">Unsubscribed</ToggleGroupItem>
              </ToggleGroup>
            </div>

            {rows.length === 0 ? (
              <EmptyState>
                {filter === "all"
                  ? "No subscribers yet. Sign-ups from the public site show up here."
                  : `No ${filter} people.`}
              </EmptyState>
            ) : (
              <RowList joined testId="newsletter-subscribers">
                {/* Subscribers have nothing to open, so these are plain rows, not ListRow buttons. */}
                {rows.map((row) => (
                  <li key={row.subscriberId} className="flex items-center gap-3 py-2.5 pr-1 pl-3 text-sm">
                    <RowText
                      title={row.email}
                      detail={[row.name, row.source, row.createdAt ? `joined ${formatDate(row.createdAt)}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                    {row.syncError ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        title={row.syncError}
                        onClick={() => void handleRetry(row.subscriberId)}
                      >
                        Retry sync
                      </Button>
                    ) : null}
                    <StatusPill
                      tone={row.status === "subscribed" ? "emerald" : "neutral"}
                      className="h-6 w-28 shrink-0 justify-center"
                    >
                      {row.status === "subscribed" ? "Subscribed" : "Unsubscribed"}
                    </StatusPill>
                  </li>
                ))}
              </RowList>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
