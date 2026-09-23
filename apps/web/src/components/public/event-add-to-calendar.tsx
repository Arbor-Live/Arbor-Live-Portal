"use client";

import { useSyncExternalStore } from "react";
import { CalendarPlusIcon, CaretDownIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buildEventCalendarProviderLinks,
  eventCalendarIcsPath,
  type EventCalendarInput,
} from "@/lib/event-calendar";
import { cn } from "@/lib/utils";

const emptySubscribe = () => () => {};

/**
 * Add-this-show menu. Google opens a template; Apple uses webcal against the
 * per-event ICS; Outlook and the download both use the https ICS.
 */
export function EventAddToCalendar({
  event,
  className,
}: {
  event: EventCalendarInput;
  className?: string;
}) {
  const origin = useSyncExternalStore(
    emptySubscribe,
    () => window.location.origin,
    () => "",
  );

  const path = eventCalendarIcsPath(event.eventId);
  const links = buildEventCalendarProviderLinks(event, `${origin}${path}`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          className={cn("border-foreground/20 px-4 shadow-xs", className)}
          disabled={!origin}
        >
          <CalendarPlusIcon />
          Add to calendar
          <CaretDownIcon className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem asChild>
          <a href={links.google} target="_blank" rel="noreferrer">
            Google Calendar
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={links.apple}>Apple Calendar</a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={links.outlook} target="_blank" rel="noreferrer">
            Outlook
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={path} download>
            Download .ics
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
