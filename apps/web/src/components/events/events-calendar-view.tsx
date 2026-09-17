"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import timeGridPlugin from "@fullcalendar/react/timegrid";
// v7 moved theming into a plugin — without one the calendar renders unstyled.
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import type { EventDisplayInfo, EventInput } from "@fullcalendar/react";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { normalizeEventStatus } from "@/lib/event-status";
import { PORTAL_TIMEZONE } from "@/lib/format";

type DashboardEvent = {
  _id: string;
  title: string;
  status: string;
  eventType?: string;
  venueName?: string;
  assignedCrewCount?: number;
  assignedCrew?: Array<{
    userId: string;
    name: string;
    email: string;
    image?: string;
  }>;
  startAt: number;
  endAt: number;
  scheduleSummary?: {
    setupAt?: number;
    showAt?: number;
    strikeAt?: number;
    blocks?: Array<{
      blockType: string;
      label: string;
      startsAt: number;
      endsAt: number;
    }>;
  };
};

type EventPalette = { color: string; contrastColor: string };

// v7 dropped FullCalendar's `backgroundColor`/`borderColor` event props: an
// event's color is a single `color` (used as the fill) plus a `contrastColor`
// for the text. Alpha fills no longer tint, so these are opaque pastels.
function getEventPalette(row: DashboardEvent): EventPalette {
  const status = normalizeEventStatus(row.status);
  if (status === "cancelled") return { color: "#fecdd3", contrastColor: "#9f1239" };
  if (status === "ready") return { color: "#a7f3d0", contrastColor: "#065f46" };
  if (status === "scheduling") return { color: "#bfdbfe", contrastColor: "#1e40af" };
  if (status === "logistics") return { color: "#fde68a", contrastColor: "#92400e" };
  if (row.eventType === "Dry Hire" || row.eventType === "Dry Rental") {
    return { color: "#fde68a", contrastColor: "#92400e" };
  }
  if (row.eventType === "Rental with Crew") return { color: "#bfdbfe", contrastColor: "#1e40af" };
  if (row.eventType === "Services Only") return { color: "#ddd6fe", contrastColor: "#5b21b6" };
  return { color: "#bbf7d0", contrastColor: "#166534" };
}

function getBlockPalette(blockType?: string): EventPalette {
  if (blockType === "setup") return { color: "#bfdbfe", contrastColor: "#1e40af" };
  if (blockType === "show") return { color: "#bbf7d0", contrastColor: "#166534" };
  if (blockType === "strike") return { color: "#fde68a", contrastColor: "#92400e" };
  return { color: "#ddd6fe", contrastColor: "#5b21b6" };
}

const clockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PORTAL_TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
});

function formatClock(value: number | undefined) {
  if (!value) return null;
  return clockFormatter.format(new Date(value));
}

function initials(value: string) {
  return (
    value
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0]?.toUpperCase() ?? "")
      .join("") || "U"
  );
}

function CrewBadge({
  crew,
  crewCount,
}: {
  crew: NonNullable<DashboardEvent["assignedCrew"]>;
  crewCount: number;
}) {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1">
            <AvatarGroup className="items-center">
              {crew.slice(0, 3).map((member) => (
                <Avatar key={member.userId} size="sm">
                  <AvatarImage src={member.image} alt={member.name} />
                  <AvatarFallback>{initials(member.name)}</AvatarFallback>
                </Avatar>
              ))}
              {crewCount > 3 ? <AvatarGroupCount>+{crewCount - 3}</AvatarGroupCount> : null}
            </AvatarGroup>
            <p className="text-[11px] leading-tight opacity-90">{crewCount} crew</p>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm p-2">
          <div className="space-y-1">
            {crew.length ? (
              crew.map((member) => (
                <p key={`crew-${member.userId}`} className="text-xs">
                  {member.name}
                  {member.email ? ` (${member.email})` : ""}
                </p>
              ))
            ) : (
              <p className="text-xs">No assigned crew yet.</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function EventsCalendarView({ events }: { events: DashboardEvent[] }) {
  const router = useRouter();
  const [view, setView] = useState<"timeGridWeek" | "dayGridMonth">("timeGridWeek");
  const calendarEvents = useMemo<EventInput[]>(() => {
    // Month cells only fit one chip per event; the week view has room to expand
    // each event into its setup/show/strike blocks.
    if (view === "dayGridMonth") {
      return events.map<EventInput>((row) => {
        const palette = getEventPalette(row);
        return {
          id: row._id,
          title: row.title,
          start: row.startAt,
          end: row.endAt,
          color: palette.color,
          contrastColor: palette.contrastColor,
          extendedProps: {
            parentEventId: row._id,
            venueName: row.venueName,
            assignedCrewCount: row.assignedCrewCount ?? 0,
            assignedCrew: row.assignedCrew ?? [],
            isBlockEvent: false,
          },
        };
      });
    }
    return events.flatMap<EventInput>((row) => {
      const blocks = row.scheduleSummary?.blocks ?? [];
      if (!blocks.length) {
        const palette = getEventPalette(row);
        const fallbackEvent: EventInput = {
          id: row._id,
          title: row.title,
          start: row.startAt,
          end: row.endAt,
          color: palette.color,
          contrastColor: palette.contrastColor,
          extendedProps: {
            eventType: row.eventType,
            status: normalizeEventStatus(row.status),
            venueName: row.venueName,
            assignedCrewCount: row.assignedCrewCount ?? 0,
            assignedCrew: row.assignedCrew ?? [],
            setupAt: row.scheduleSummary?.setupAt,
            showAt: row.scheduleSummary?.showAt,
            strikeAt: row.scheduleSummary?.strikeAt,
            blocks: [],
            isBlockEvent: false,
          },
        };
        return [fallbackEvent];
      }
      return blocks.map((block, index) => {
        const palette = getBlockPalette(block.blockType);
        const blockEvent: EventInput = {
          id: `${row._id}-${block.blockType}-${index}`,
          title: block.label?.trim() || block.blockType || row.title,
          start: block.startsAt,
          end: block.endsAt,
          color: palette.color,
          contrastColor: palette.contrastColor,
          extendedProps: {
            parentEventId: row._id,
            parentTitle: row.title,
            blockType: block.blockType,
            venueName: row.venueName,
            assignedCrewCount: row.assignedCrewCount ?? 0,
            assignedCrew: row.assignedCrew ?? [],
            isBlockEvent: true,
          },
        };
        return blockEvent;
      });
    });
  }, [events, view]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`rounded-md border px-3 py-1 text-sm ${view === "timeGridWeek" ? "bg-primary text-primary-foreground" : "bg-background"}`}
          onClick={() => setView("timeGridWeek")}
        >
          Week
        </button>
        <button
          type="button"
          className={`rounded-md border px-3 py-1 text-sm ${view === "dayGridMonth" ? "bg-primary text-primary-foreground" : "bg-background"}`}
          onClick={() => setView("dayGridMonth")}
        >
          Month
        </button>
      </div>

      <div className="rounded-md border bg-card p-2">
        <FullCalendar
          key={view}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, classicThemePlugin]}
          initialView={view}
          timeZone={PORTAL_TIMEZONE}
          allDaySlot={false}
          nowIndicator
          dayMaxEvents
          firstDay={1}
          slotMinTime="06:00:00"
          slotMaxTime="24:00:00"
          slotDuration="00:30:00"
          expandRows
          eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
          slotHeaderFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "",
          }}
          // v7's hashed class names can't be targeted from CSS, so the chrome
          // the v6 stylesheet used to restyle is reapplied through these hooks.
          tableClass="rounded-xl overflow-hidden"
          toolbarTitleClass="text-base font-semibold"
          buttonClass="rounded-lg shadow-none text-[0.8rem] font-semibold"
          eventClass="rounded-lg border shadow-none"
          eventInnerClass="whitespace-normal"
          eventTitleClass="font-semibold"
          slotHeaderClass="text-xs opacity-85"
          height="auto"
          events={calendarEvents}
          eventClick={(arg) =>
            router.push(
              `/dashboard/events/${(arg.event.extendedProps.parentEventId as string | undefined) ?? arg.event.id}`,
            )
          }
          eventContent={(arg: EventDisplayInfo) => {
            const isBlockEvent = Boolean(arg.event.extendedProps.isBlockEvent);
            const crew = (arg.event.extendedProps.assignedCrew as Array<{
              userId: string;
              name: string;
              email: string;
              image?: string;
            }> | undefined) ?? [];
            const crewCount = (arg.event.extendedProps.assignedCrewCount as number | undefined) ?? crew.length;
            const venueName = (arg.event.extendedProps.venueName as string | undefined) ?? "";
            // Month cells are one line per event; the week view has room for detail.
            const compact = arg.view.type === "dayGridMonth" || Boolean(arg.isShort || arg.isNarrow);

            if (isBlockEvent) {
              const parentTitle = (arg.event.extendedProps.parentTitle as string | undefined) ?? "Event";
              if (compact) {
                return (
                  <p className="truncate px-1 py-0.5 text-xs font-semibold leading-tight">
                    <span className="opacity-80">{parentTitle}</span> {arg.event.title}
                    <span className="font-normal opacity-70"> · {arg.timeText}</span>
                  </p>
                );
              }
              return (
                <div className="@container overflow-hidden space-y-0.5 px-1 py-0.5">
                  <p className="text-xs font-semibold leading-tight break-words whitespace-normal">
                    <span className="opacity-80">{parentTitle}</span> {arg.event.title}
                  </p>
                  <p className="truncate text-[11px] leading-tight opacity-90 @max-[5rem]:hidden">{arg.timeText}</p>
                  {/* Overlapping events shrink to narrow lanes; drop the
                      secondary lines rather than let them clip into neighbors. */}
                  {venueName ? (
                    <p className="line-clamp-1 text-[11px] leading-tight opacity-90 @max-[7rem]:hidden">{venueName}</p>
                  ) : null}
                  {crewCount > 0 ? (
                    <div className="@max-[7rem]:hidden">
                      <CrewBadge crew={crew} crewCount={crewCount} />
                    </div>
                  ) : null}
                </div>
              );
            }
            const setup = formatClock(arg.event.extendedProps.setupAt as number | undefined);
            const show = formatClock(arg.event.extendedProps.showAt as number | undefined);
            const blocks = (arg.event.extendedProps.blocks as Array<{ label?: string; blockType?: string }> | undefined) ?? [];
            const blockLabelLine = blocks.length
              ? `Blocks: ${blocks
                  .map((block) => block.label?.trim() || block.blockType || "Block")
                  .filter(Boolean)
                  .slice(0, 3)
                  .join(" • ")}${blocks.length > 3 ? " • ..." : ""}`
              : null;
            if (compact) {
              return (
                <p className="truncate px-1 py-0.5 text-xs font-semibold leading-tight">
                  {arg.event.title}
                  <span className="font-normal opacity-70"> · {arg.timeText}</span>
                </p>
              );
            }
            return (
              <div className="@container overflow-hidden space-y-0.5 px-1 py-0.5">
                <p className="line-clamp-2 text-xs font-semibold leading-tight">{arg.event.title}</p>
                <p className="truncate text-[11px] leading-tight opacity-90 @max-[5rem]:hidden">{arg.timeText}</p>
                {setup ? (
                  <p className="text-[11px] leading-tight opacity-90">
                    Call {setup}
                    {show ? ` • Show ${show}` : ""}
                  </p>
                ) : null}
                {blockLabelLine ? (
                  <p className="line-clamp-1 text-[11px] leading-tight opacity-90 @max-[7rem]:hidden">{blockLabelLine}</p>
                ) : null}
                {crewCount > 0 ? (
                  <div className="@max-[7rem]:hidden">
                    <CrewBadge crew={crew} crewCount={crewCount} />
                  </div>
                ) : null}
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}
