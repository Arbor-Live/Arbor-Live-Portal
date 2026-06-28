"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { EventStateBadges } from "@/components/events/event-state-badges";
import { CrewAvailabilityResponseForm } from "@/components/events/crew-availability-response-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_AVAILABILITY_WEEKS,
  EXTENDED_AVAILABILITY_WEEKS,
  crewResponseBadgeClass,
  formatCrewResponseLabel,
  formatEventDateTime,
} from "@/lib/crew-availability";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function CrewAvailabilityInbox() {
  const [showExtended, setShowExtended] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const events = useQuery(api.eventCrewAvailability.listForCrewMember, {
    now,
    weeksAhead: showExtended ? EXTENDED_AVAILABILITY_WEEKS : DEFAULT_AVAILABILITY_WEEKS,
  });

  const pendingCount = events?.filter((event) => event.needsResponse).length ?? 0;

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

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      {!events ? <p className="text-sm text-muted-foreground">Loading availability events...</p> : null}

      {events && events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No upcoming crewed events match your teams in this window.
        </p>
      ) : null}

      {events?.map((event) => (
        <div key={event._id} className="rounded-md border p-4 space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{event.title}</p>
              <EventStateBadges status={event.status} startAt={event.startAt} endAt={event.endAt} />
              {event.needsResponse ? (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700">
                  Needs response
                </span>
              ) : event.myResponse ? (
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
            onSaved={(savedMessage) => setMessage(savedMessage)}
          />
        </div>
      ))}
    </div>
  );
}
