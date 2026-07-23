"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
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

      <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        Open Mic is an add-on on events. Enable it from an event&rsquo;s
        <span className="px-1 text-foreground">Add-ons</span> section to list it here.
      </p>

      <div className="space-y-2">
        {(events ?? []).map((event) => {
          const past = event.startAt < now;
          return (
            <div key={event._id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{event.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(event.startAt)}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded bg-muted px-2 py-0.5">{statusLabel(event.status)}</span>
                    {event.eventStatus ? (
                      <span className="rounded bg-muted px-2 py-0.5">
                        Event: {event.eventStatus}
                      </span>
                    ) : null}
                    <span
                      className={`rounded px-2 py-0.5 ${event.runnerWindowOpen ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground"}`}
                    >
                      Runner: {event.runnerWindowOpen ? "Open" : "Closed"}
                    </span>
                    <span className="rounded bg-muted px-2 py-0.5">Queued: {event.queuedCount}</span>
                    <span className="rounded bg-muted px-2 py-0.5">
                      Performed: {event.performedCount}
                    </span>
                    {event.hasCurrent ? (
                      <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-700">
                        Performer on stage
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild type="button" variant="outline" size="sm">
                    <Link href={`/dashboard/events/${event._id}`}>Open event</Link>
                  </Button>
                  <Button asChild type="button" variant="outline" size="sm">
                    <Link href={`/dashboard/events/open-mic/${event._id}`}>Runner</Link>
                  </Button>
                  {event.status === "scheduled" && !past ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!event.runnerWindowOpen}
                      title={
                        event.runnerWindowOpen
                          ? "Open the runner queue"
                          : `Runner opens ${formatDateTime(event.runnerOpensAt)} (1h before start)`
                      }
                      onClick={() =>
                        void setOpenMicStatus({ eventId: event._id, status: "live" }).catch(
                          (err) => {
                            window.alert(getConvexErrorMessage(err));
                          },
                        )
                      }
                    >
                      Go live
                    </Button>
                  ) : null}
                  {event.status === "live" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void setOpenMicStatus({ eventId: event._id, status: "completed" })
                      }
                    >
                      Mark completed
                    </Button>
                  ) : null}
                  {event.status !== "cancelled" && event.status !== "completed" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void setOpenMicStatus({ eventId: event._id, status: "cancelled" })
                      }
                    >
                      Cancel
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Disable Open Mic on this event? Queues stay archived in the runner.",
                        )
                      ) {
                        void updateEvent({ id: event._id, openMicEnabled: false }).catch((err) => {
                          window.alert(getConvexErrorMessage(err));
                        });
                      }
                    }}
                  >
                    Disable
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        {events && events.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No events with Open Mic enabled. Turn it on from an event&rsquo;s Add-ons section.
          </p>
        ) : null}
        {events === undefined ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      </div>
    </div>
  );
}