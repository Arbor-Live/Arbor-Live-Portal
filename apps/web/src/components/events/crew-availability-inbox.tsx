"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { EventStateBadges } from "@/components/events/event-state-badges";
import { CrewAvailabilityResponseForm } from "@/components/events/crew-availability-response-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { notify } from "@/lib/notify";
import {
  DEFAULT_AVAILABILITY_WEEKS,
  EXTENDED_AVAILABILITY_WEEKS,
  crewResponseBadgeClass,
  formatCrewResponseLabel,
  formatEventDateTime,
} from "@/lib/crew-availability";
import { cn } from "@/lib/utils";

type InboxEvent = NonNullable<
  ReturnType<typeof useQuery<typeof api.eventCrewAvailability.listForCrewMember>>
>[number];

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function CrewAvailabilityEventDetails({
  event,
  onSaved,
}: {
  event: InboxEvent;
  onSaved: (message: string) => void;
}) {
  return (
    <>
      {event.scheduleBlocks.length > 0 ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">Schedule</p>
          <div className="space-y-1">
            {event.scheduleBlocks.map((block) => (
              <div key={block._id} className="rounded-md border px-2 py-1 text-xs">
                <span className="font-medium">{block.label}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {formatEventDateTime(block.startsAt)} – {formatEventDateTime(block.endsAt)}
                </span>
                {block.notes ? <span className="block text-muted-foreground italic">{block.notes}</span> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-medium">Assigned crew</p>
          {event.assignedCrew.length === 0 ? (
            <p className="text-xs text-muted-foreground">No crew assigned yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {event.assignedCrew.map((member) => (
                <div key={member.userId} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
                  <Avatar size="sm">
                    <AvatarImage src={member.image} alt={member.name} />
                    <AvatarFallback>{initials(member.name)}</AvatarFallback>
                  </Avatar>
                  <span>{member.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Interested crew</p>
          {event.interestedCrew.length === 0 ? (
            <p className="text-xs text-muted-foreground">No Yes/Partial responses yet.</p>
          ) : (
            <div className="space-y-1">
              {event.interestedCrew.map((member) => (
                <div key={member.userId} className="flex flex-wrap items-center gap-2 text-sm">
                  <Avatar size="sm">
                    <AvatarImage src={member.image} alt={member.name} />
                    <AvatarFallback>{initials(member.name)}</AvatarFallback>
                  </Avatar>
                  <span>{member.name}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${crewResponseBadgeClass(member.responseStatus)}`}
                  >
                    {formatCrewResponseLabel(member.responseStatus)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {(event.unavailableCounts.no > 0 || event.unavailableCounts.onlyIfNecessary > 0) ? (
            <p className="text-xs text-muted-foreground">
              {event.unavailableCounts.no > 0
                ? `${event.unavailableCounts.no} unavailable`
                : null}
              {event.unavailableCounts.no > 0 && event.unavailableCounts.onlyIfNecessary > 0 ? " · " : null}
              {event.unavailableCounts.onlyIfNecessary > 0
                ? `${event.unavailableCounts.onlyIfNecessary} only if necessary`
                : null}
            </p>
          ) : null}
        </div>
      </div>

      <CrewAvailabilityResponseForm
        eventId={event._id}
        scheduleBlocks={event.scheduleBlocks}
        existingResponse={event.myResponse}
        onSaved={onSaved}
      />
    </>
  );
}

function CrewAvailabilityEventHeader({
  event,
  showResponseBadge = true,
}: {
  event: InboxEvent;
  showResponseBadge?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{event.title}</p>
        <EventStateBadges status={event.status} startAt={event.startAt} endAt={event.endAt} />
        {event.needsResponse ? (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700">
            Needs response
          </span>
        ) : showResponseBadge && event.myResponse ? (
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${crewResponseBadgeClass(event.myResponse.responseStatus)}`}
          >
            You: {formatCrewResponseLabel(event.myResponse.responseStatus)}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {formatEventDateTime(event.startAt)} {" → "} {formatEventDateTime(event.endAt)}
      </p>
      <div className="flex flex-wrap gap-2 text-xs">
        {event.eventType ? <span className="rounded bg-muted px-2 py-0.5">{event.eventType}</span> : null}
        {event.venueName ? <span className="rounded bg-muted px-2 py-0.5">{event.venueName}</span> : null}
        {event.host ? <span className="rounded bg-muted px-2 py-0.5">Host: {event.host}</span> : null}
        {event.teamsInterested?.map((team) => (
          <span key={team} className="rounded bg-muted px-2 py-0.5">
            {team}
          </span>
        ))}
      </div>
      {event.notes ? (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{event.notes}</p>
      ) : null}
    </div>
  );
}

function CrewAvailabilityPendingCard({
  event,
  onSaved,
}: {
  event: InboxEvent;
  onSaved: (message: string) => void;
}) {
  return (
    <div className="space-y-4 rounded-md border p-4">
      <CrewAvailabilityEventHeader event={event} />
      <CrewAvailabilityEventDetails event={event} onSaved={onSaved} />
    </div>
  );
}

function CrewAvailabilityRespondedCard({
  event,
  onSaved,
}: {
  event: InboxEvent;
  onSaved: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const responseStatus = event.myResponse?.responseStatus;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="truncate text-sm font-medium">{event.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatEventDateTime(event.startAt)} – {formatEventDateTime(event.endAt)}
                {event.venueName ? ` · ${event.venueName}` : null}
              </p>
            </div>
            {responseStatus ? (
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${crewResponseBadgeClass(responseStatus)}`}
              >
                You: {formatCrewResponseLabel(responseStatus)}
              </span>
            ) : null}
            <CaretDownIcon
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 border-t px-4 py-4">
            <CrewAvailabilityEventHeader event={event} showResponseBadge={false} />
            <CrewAvailabilityEventDetails event={event} onSaved={onSaved} />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function CrewAvailabilityInbox() {
  const [showExtended, setShowExtended] = useState(false);
  const [now] = useState(() => Date.now());

  const events = useQuery(api.eventCrewAvailability.listForCrewMember, {
    now,
    weeksAhead: showExtended ? EXTENDED_AVAILABILITY_WEEKS : DEFAULT_AVAILABILITY_WEEKS,
  });

  const { pendingEvents, respondedEvents } = useMemo(() => {
    if (!events) {
      return { pendingEvents: [], respondedEvents: [] };
    }
    const pending = events.filter((event) => event.needsResponse);
    const responded = events.filter((event) => !event.needsResponse);
    return { pendingEvents: pending, respondedEvents: responded };
  }, [events]);

  const pendingCount = pendingEvents.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Showing team-matched events for the next {showExtended ? EXTENDED_AVAILABILITY_WEEKS : DEFAULT_AVAILABILITY_WEEKS} weeks.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowExtended((prev) => !prev)}
        >
          {showExtended ? "Show default window" : "Show more events"}
        </Button>
        {pendingCount > 0 ? (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700">
            {pendingCount} need{pendingCount === 1 ? "s" : ""} your response
          </span>
        ) : null}
      </div>

      {!events ? <p className="text-sm text-muted-foreground">Loading availability events...</p> : null}

      {events && events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No upcoming crewed events match your teams in this window.
        </p>
      ) : null}

      {events && events.length > 0 && pendingEvents.length === 0 ? (
        <p className="text-sm text-muted-foreground">You&apos;re caught up — no responses needed right now.</p>
      ) : null}

      {pendingEvents.map((event) => (
        <CrewAvailabilityPendingCard
          key={event._id}
          event={event}
          onSaved={(savedMessage) => notify.success(savedMessage)}
        />
      ))}

      {respondedEvents.length > 0 ? (
        <div className="space-y-2 pt-2">
          <p className="text-sm font-medium text-muted-foreground">Already responded</p>
          {respondedEvents.map((event) => (
            <CrewAvailabilityRespondedCard
              key={event._id}
              event={event}
              onSaved={(savedMessage) => notify.success(savedMessage)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
