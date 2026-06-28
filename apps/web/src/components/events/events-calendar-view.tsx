"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { EventContentArg } from "@fullcalendar/core";
import type { EventInput } from "@fullcalendar/core/index.js";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { normalizeEventStatus } from "@/lib/event-status";

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

function formatClock(value: number | undefined) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRange(start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
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

function getEventColors(row: DashboardEvent) {
  const status = normalizeEventStatus(row.status);
  if (status === "cancelled") return { backgroundColor: "#fda4af33", borderColor: "#f43f5e" };
  if (status === "ready") return { backgroundColor: "#6ee7b733", borderColor: "#10b981" };
  if (status === "scheduling") return { backgroundColor: "#93c5fd33", borderColor: "#3b82f6" };
  if (status === "logistics") return { backgroundColor: "#fcd34d33", borderColor: "#f59e0b" };
  if (row.eventType === "Dry Hire") return { backgroundColor: "#fcd34d33", borderColor: "#f59e0b" };
  if (row.eventType === "Rental with Crew") return { backgroundColor: "#93c5fd33", borderColor: "#3b82f6" };
  if (row.eventType === "Services Only") return { backgroundColor: "#d8b4fe33", borderColor: "#a855f7" };
  return { backgroundColor: "#86efac33", borderColor: "#22c55e" };
}

function getBlockColors(blockType?: string) {
  if (blockType === "setup") return { backgroundColor: "#93c5fd33", borderColor: "#3b82f6" };
  if (blockType === "show") return { backgroundColor: "#86efac33", borderColor: "#22c55e" };
  if (blockType === "strike") return { backgroundColor: "#fcd34d33", borderColor: "#f59e0b" };
  return { backgroundColor: "#a78bfa33", borderColor: "#8b5cf6" };
}

export function EventsCalendarView({ events }: { events: DashboardEvent[] }) {
  const router = useRouter();
  const [view, setView] = useState<"timeGridWeek" | "dayGridMonth">("timeGridWeek");
  const calendarEvents = useMemo<EventInput[]>(
    () =>
      events.flatMap<EventInput>((row) => {
        const blocks = row.scheduleSummary?.blocks ?? [];
        if (!blocks.length) {
          const colors = getEventColors(row);
          const fallbackEvent: EventInput = {
            id: row._id,
            title: row.title,
            start: row.startAt,
            end: row.endAt,
            backgroundColor: colors.backgroundColor,
            borderColor: colors.borderColor,
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
          const colors = getBlockColors(block.blockType);
          const blockEvent: EventInput = {
            id: `${row._id}-${block.blockType}-${index}`,
            title: block.label?.trim() || block.blockType || row.title,
            start: block.startsAt,
            end: block.endsAt,
            backgroundColor: colors.backgroundColor,
            borderColor: colors.borderColor,
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
      }),
    [events],
  );

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
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={view}
          allDaySlot={false}
          nowIndicator
          dayMaxEvents
          firstDay={1}
          slotMinTime="06:00:00"
          slotMaxTime="24:00:00"
          slotDuration="00:30:00"
          expandRows
          dayHeaderFormat={{ weekday: "short", month: "numeric", day: "numeric" }}
          eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "",
          }}
          height="auto"
          events={calendarEvents}
          eventClick={(arg) =>
            router.push(
              `/dashboard/events/${(arg.event.extendedProps.parentEventId as string | undefined) ?? arg.event.id}`,
            )
          }
          eventContent={(arg: EventContentArg) => {
            const isBlockEvent = Boolean(arg.event.extendedProps.isBlockEvent);
            const crew = (arg.event.extendedProps.assignedCrew as Array<{
              userId: string;
              name: string;
              email: string;
              image?: string;
            }> | undefined) ?? [];
            const crewCount = (arg.event.extendedProps.assignedCrewCount as number | undefined) ?? crew.length;
            const venueName = (arg.event.extendedProps.venueName as string | undefined) ?? "";
            const start = arg.event.start;
            const end = arg.event.end;
            const range = start && end ? formatRange(start, end) : arg.timeText;

            if (isBlockEvent) {
              return (
                <div className="space-y-1 px-1 py-0.5">
                  <p className="text-xs font-semibold leading-tight break-words whitespace-normal">
                    {(arg.event.extendedProps.parentTitle as string | undefined) ?? "Event"} {arg.event.title}
                  </p>
                  <p className="text-[11px] leading-tight opacity-90">{range}</p>
                  {venueName ? <p className="line-clamp-1 text-[11px] leading-tight opacity-90">{venueName}</p> : null}
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
                </div>
              );
            }
            const setup = formatClock(arg.event.extendedProps.setupAt as number | undefined);
            const show = formatClock(arg.event.extendedProps.showAt as number | undefined);
            const blocks = (arg.event.extendedProps.blocks as Array<{ label?: string; blockType?: string }> | undefined) ?? [];
            const additionalBlocks = blocks
              .map((block) => block.label?.trim() || block.blockType || "Block")
              .filter(Boolean)
              .filter((label) => label.toLowerCase() !== "show");
            const additionalBlocksInline = additionalBlocks.length
              ? ` • +${additionalBlocks.slice(0, 2).join(", ")}${additionalBlocks.length > 2 ? ", ..." : ""}`
              : "";
            const blockLabelLine = blocks.length
              ? `Blocks: ${blocks
                  .map((block) => block.label?.trim() || block.blockType || "Block")
                  .filter(Boolean)
                  .slice(0, 3)
                  .join(" • ")}${blocks.length > 3 ? " • ..." : ""}`
              : null;
            return (
              <div className="space-y-0.5 px-1 py-0.5">
                <p className="line-clamp-2 text-xs font-semibold leading-tight">{arg.event.title}</p>
                <p className="line-clamp-2 text-[11px] leading-tight opacity-90">
                  {range}
                  {additionalBlocksInline}
                </p>
                {setup ? (
                  <p className="text-[11px] leading-tight opacity-90">
                    Call {setup}
                    {show ? ` • Show ${show}` : ""}
                  </p>
                ) : null}
                {blockLabelLine ? <p className="line-clamp-1 text-[11px] leading-tight opacity-90">{blockLabelLine}</p> : null}
                <p className="text-[11px] leading-tight opacity-90">Crew {crewCount}</p>
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}
