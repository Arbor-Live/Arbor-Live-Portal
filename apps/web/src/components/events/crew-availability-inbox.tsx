"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { CaretDownIcon, MapPinIcon, WarningIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { EventStateBadges } from "@/components/events/event-state-badges";
import { CrewAvailabilityResponseForm } from "@/components/events/crew-availability-response-form";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DEFAULT_AVAILABILITY_WEEKS,
  EXTENDED_AVAILABILITY_WEEKS,
  crewResponseBadgeClass,
  formatCrewResponseLabel,
  formatTimeWindow,
} from "@/lib/crew-availability";
import { formatDate, formatDateTimeRange } from "@/lib/format";
import { cn } from "@/lib/utils";

type InboxEvent = NonNullable<
  ReturnType<typeof useQuery<typeof api.eventCrewAvailability.listForCrewMember>>
>[number];

function needsAttention(event: InboxEvent) {
  return event.needsResponse || Boolean(event.myResponse?.scheduleChanged);
}

function EventDetails({ event }: { event: InboxEvent }) {
  const blockNotes = event.scheduleBlocks.filter((block) => block.notes?.trim());
  const others = event.assignedCrew.length + event.interestedCrew.length;
  if (!event.notes && blockNotes.length === 0 && others === 0) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className="group inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
        Details
        <CaretDownIcon className="size-3 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2 text-sm">
        {event.notes ? (
          <p className="whitespace-pre-wrap text-muted-foreground">{event.notes}</p>
        ) : null}
        {blockNotes.map((block) => (
          <p key={block._id} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{block.label}:</span> {block.notes}
          </p>
        ))}
        {event.assignedCrew.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            On the crew: {event.assignedCrew.map((member) => member.name).join(", ")}
          </p>
        ) : null}
        {event.interestedCrew.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Also available:{" "}
            {event.interestedCrew
              .map((member) => `${member.name} (${formatCrewResponseLabel(member.responseStatus).toLowerCase()})`)
              .join(", ")}
          </p>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function EventSummary({ event }: { event: InboxEvent }) {
  const myBlockIds = new Set(event.myShifts.map((shift) => shift.scheduleBlockId));
  const mySections = event.scheduleBlocks.filter((block) => myBlockIds.has(block._id));
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{event.title}</p>
        <EventStateBadges status={event.status} startAt={event.startAt} endAt={event.endAt} />
      </div>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{formatDateTimeRange(event.startAt, event.endAt)}</span>
        {event.venueName ? (
          <span className="inline-flex items-center gap-1">
            <MapPinIcon className="size-3.5" aria-hidden />
            {event.venueName}
          </span>
        ) : null}
        {event.host ? <span>Host: {event.host}</span> : null}
      </p>
      {event.scheduleBlocks.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {event.scheduleBlocks
            .map((block) => `${block.label || block.blockType} ${formatTimeWindow(block)}`)
            .join(" · ")}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Crew schedule not set yet.</p>
      )}
      {mySections.length > 0 || event.myShifts.length > 0 ? (
        <p className="text-xs font-medium text-status-emerald-700 dark:text-status-emerald-300">
          You&apos;re on:{" "}
          {mySections.length > 0
            ? mySections.map((block) => block.label || block.blockType).join(", ")
            : `${event.myShifts.length} shift${event.myShifts.length === 1 ? "" : "s"}`}
        </p>
      ) : null}
      {event.myResponse?.scheduleChanged ? (
        <p className="flex items-center gap-1.5 text-xs text-status-amber-700">
          <WarningIcon className="size-3.5" weight="fill" aria-hidden />
          The schedule changed after you answered. Check it still works.
        </p>
      ) : null}
    </div>
  );
}

function DateColumn({ startAt }: { startAt: number }) {
  // "Thu, Oct 15, 2026" → "Thu" over "Oct 15"; the full date is in the summary.
  const [weekday, monthDay] = formatDate(startAt).split(", ");
  return (
    <div className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">
      <p className="font-medium text-foreground">{weekday}</p>
      <p>{monthDay}</p>
    </div>
  );
}

function AvailabilityEventCard({ event, open }: { event: InboxEvent; open: boolean }) {
  const [expanded, setExpanded] = useState(open);
  const status = event.myResponse?.responseStatus;
  const form = (
    <CrewAvailabilityResponseForm
      eventId={event._id}
      eventStartAt={event.startAt}
      eventEndAt={event.endAt}
      scheduleBlocks={event.scheduleBlocks}
      existingResponse={event.myResponse}
    />
  );

  if (open) {
    return (
      <li className="space-y-3 border p-3" data-testid="crew-availability-event">
        <div className="flex gap-3">
          <DateColumn startAt={event.startAt} />
          <EventSummary event={event} />
        </div>
        <div className="space-y-2 sm:pl-19">
          {form}
          <EventDetails event={event} />
        </div>
      </li>
    );
  }

  return (
    <li className="border" data-testid="crew-availability-event">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/30">
            <DateColumn startAt={event.startAt} />
            <EventSummary event={event} />
            {status ? (
              <span
                className={cn(
                  "shrink-0 rounded-md border px-2 py-0.5 text-xs",
                  crewResponseBadgeClass(status),
                )}
              >
                You: {formatCrewResponseLabel(status)}
              </span>
            ) : null}
            <CaretDownIcon
              className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2 border-t p-3 sm:pl-22">
            {form}
            <EventDetails event={event} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

export function CrewAvailabilityInbox() {
  const [weeks, setWeeks] = useState(DEFAULT_AVAILABILITY_WEEKS);
  const [now] = useState(() => Date.now());

  const events = useQuery(api.eventCrewAvailability.listForCrewMember, { now, weeksAhead: weeks });

  const { attention, answered } = useMemo(() => {
    const rows = events ?? [];
    return {
      attention: rows.filter(needsAttention),
      answered: rows.filter((event) => !needsAttention(event)),
    };
  }, [events]);
  const changed = attention.filter((event) => !event.needsResponse).length;
  const unanswered = attention.length - changed;

  return (
    <div className="space-y-4" data-testid="crew-availability-inbox">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm" data-testid="crew-availability-summary">
          {events === undefined
            ? "Loading…"
            : [
                unanswered > 0 ? `${unanswered} need${unanswered === 1 ? "s" : ""} an answer` : null,
                changed > 0 ? `${changed} changed since you answered` : null,
                `${answered.length} answered`,
              ]
                .filter(Boolean)
                .join(" · ")}
        </p>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          className="sm:ml-auto"
          value={String(weeks)}
          onValueChange={(value) => value && setWeeks(Number(value))}
          aria-label="How far ahead"
        >
          <ToggleGroupItem value={String(DEFAULT_AVAILABILITY_WEEKS)}>
            Next {DEFAULT_AVAILABILITY_WEEKS} weeks
          </ToggleGroupItem>
          <ToggleGroupItem value={String(EXTENDED_AVAILABILITY_WEEKS)}>
            Next {EXTENDED_AVAILABILITY_WEEKS} weeks
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {events && events.length === 0 ? (
        <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No upcoming crewed events for your teams in this window.
        </p>
      ) : null}

      {events && events.length > 0 && attention.length === 0 ? (
        <p className="text-sm text-muted-foreground">You&apos;re caught up. Nothing needs an answer right now.</p>
      ) : null}

      {attention.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Needs your answer
          </h2>
          <ul className="space-y-2">
            {attention.map((event) => (
              <AvailabilityEventCard key={event._id} event={event} open />
            ))}
          </ul>
        </section>
      ) : null}

      {answered.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Answered
          </h2>
          <ul className="space-y-2">
            {answered.map((event) => (
              <AvailabilityEventCard key={event._id} event={event} open={false} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
