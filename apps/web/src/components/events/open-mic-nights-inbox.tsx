"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, RowFlag, RowList, RowMenu, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { formatDateTime } from "@/lib/format";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { optimisticSetOpenMicStatus } from "@/lib/open-mic-optimistic";

function statusLabel(status: string) {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "live":
      return "Live";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function OpenMicEventsInbox() {
  const { confirm, alert } = useAppDialog();
  const events = useQuery(api.openMic.listEvents, {});
  const setOpenMicStatus = useMutation(api.openMic.setOpenMicStatus).withOptimisticUpdate(
    optimisticSetOpenMicStatus,
  );
  const updateEvent = useMutation(api.events.update);
  const [now] = useState(() => Date.now());

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild className="ml-auto">
          <Link href="/open-mic" target="_blank">
            Open public form
          </Link>
        </Button>
      </div>

      <p className="border border-dashed px-3 py-2 text-sm text-muted-foreground">
        Open Mic is an add-on on events. Enable it from an event&rsquo;s
        <span className="px-1 text-foreground">Add-ons</span> section to list it here.
      </p>

      {events === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : events.length === 0 ? (
        <EmptyState>No events with Open Mic enabled. Turn it on from an event&rsquo;s Add-ons section.</EmptyState>
      ) : (
        <RowList testId="open-mic-inbox-list">
          {events.map((event) => {
            const past = event.startAt < now;
            return (
              <ListRow
                key={event._id}
                href={`/dashboard/events/${event._id}`}
                data-testid={`open-mic-event-${event._id}`}
                actions={
                  <RowMenu label={`More for ${event.title}`}>
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/events/${event._id}`}>Open event</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/events/open-mic/${event._id}`}>Runner</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {event.status === "scheduled" && !past ? (
                      <DropdownMenuItem
                        disabled={!event.runnerWindowOpen}
                        title={
                          event.runnerWindowOpen
                            ? "Open the runner queue"
                            : `Runner opens ${formatDateTime(event.runnerOpensAt)} (1h before start)`
                        }
                        onSelect={() =>
                          void setOpenMicStatus({ eventId: event._id, status: "live" }).catch((err) => {
                            void alert(getConvexErrorMessage(err));
                          })
                        }
                      >
                        Go live
                      </DropdownMenuItem>
                    ) : null}
                    {event.status === "live" ? (
                      <DropdownMenuItem
                        onSelect={() =>
                          void setOpenMicStatus({ eventId: event._id, status: "completed" })
                        }
                      >
                        Mark completed
                      </DropdownMenuItem>
                    ) : null}
                    {event.status !== "cancelled" && event.status !== "completed" ? (
                      <DropdownMenuItem
                        onSelect={() =>
                          void setOpenMicStatus({ eventId: event._id, status: "cancelled" })
                        }
                      >
                        Cancel
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => {
                        void (async () => {
                          if (
                            !(await confirm({
                              title: "Disable Open Mic on this event?",
                              description: "Queues stay archived in the runner.",
                              confirmLabel: "Disable",
                            }))
                          ) {
                            return;
                          }
                          await updateEvent({ id: event._id, openMicEnabled: false }).catch((err) => {
                            void alert(getConvexErrorMessage(err));
                          });
                        })();
                      }}
                    >
                      Disable
                    </DropdownMenuItem>
                  </RowMenu>
                }
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <RowText
                    eyebrow={statusLabel(event.status)}
                    title={event.title}
                    detail={formatDateTime(event.startAt)}
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    {event.eventStatus ? (
                      <RowFlag tone="neutral">Event: {event.eventStatus}</RowFlag>
                    ) : null}
                    <RowFlag tone={event.runnerWindowOpen ? "emerald" : "neutral"}>
                      Runner: {event.runnerWindowOpen ? "Open" : "Closed"}
                    </RowFlag>
                    <RowFlag tone="neutral">Queued: {event.queuedCount}</RowFlag>
                    <RowFlag tone="neutral">Performed: {event.performedCount}</RowFlag>
                    {event.hasCurrent ? <RowFlag tone="emerald">Performer on stage</RowFlag> : null}
                  </div>
                </div>
              </ListRow>
            );
          })}
        </RowList>
      )}
    </div>
  );
}
