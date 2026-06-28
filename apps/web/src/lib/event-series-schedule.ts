import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { toLocalDateTimeInput } from "@/lib/crew-availability";

export type SeriesBlockTemplate = {
  blockType: "setup" | "show" | "strike" | "custom";
  label: string;
  dayIndex: number;
  offsetMs: number;
  durationMs: number;
  notes?: string;
};

export function templatesToTimelineDrafts(
  templates: SeriesBlockTemplate[],
  anchorStartAt: number,
): TimelineBlockDraft[] {
  return templates
    .slice()
    .sort((a, b) => a.offsetMs - b.offsetMs)
    .map((template, index) => {
      const startsAt = anchorStartAt + template.offsetMs;
      const endsAt = startsAt + template.durationMs;
      return {
        clientId: `template-${index}`,
        blockType: template.blockType,
        label: template.label,
        dayIndex: template.dayIndex,
        startsAt: toLocalDateTimeInput(new Date(startsAt)),
        endsAt: toLocalDateTimeInput(new Date(endsAt)),
        notes: template.notes ?? "",
      };
    });
}

export function timelineDraftsToTemplates(
  blocks: TimelineBlockDraft[],
  anchorStartAt: number,
): SeriesBlockTemplate[] {
  return blocks
    .slice()
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .map((block) => {
      const startsAt = new Date(block.startsAt).getTime();
      const endsAt = new Date(block.endsAt).getTime();
      return {
        blockType: block.blockType,
        label: block.label,
        dayIndex: block.dayIndex,
        offsetMs: startsAt - anchorStartAt,
        durationMs: Math.max(endsAt - startsAt, 15 * 60 * 1000),
        notes: block.notes.trim() ? block.notes.trim() : undefined,
      };
    });
}

type QuickAddEventType = "Crewed Event" | "Rental with Crew" | "Dry Hire" | "Services Only";
type RentalFulfillmentMode = "delivery" | "will_call";

export function buildSeriesQuickAddBlocks(args: {
  eventType: QuickAddEventType;
  rentalFulfillmentMode: RentalFulfillmentMode;
  anchorStartAt: number;
  anchorEndAt: number;
}): TimelineBlockDraft[] {
  const showStart = new Date(args.anchorStartAt);
  const showEnd = new Date(args.anchorEndAt);
  const setupStart = new Date(showStart.getTime() - 3 * 60 * 60 * 1000);
  const strikeEnd = new Date(showEnd.getTime() + 2 * 60 * 60 * 1000);
  const deliveryStart = new Date(showStart.getTime() - 2 * 60 * 60 * 1000);
  const returnEnd = new Date(showEnd.getTime() + 2 * 60 * 60 * 1000);
  const anchorDayStart = new Date(
    showStart.getFullYear(),
    showStart.getMonth(),
    showStart.getDate(),
  ).getTime();
  const dayIndexFrom = (timeMs: number) =>
    Math.max(0, Math.floor((timeMs - anchorDayStart) / (24 * 60 * 60 * 1000)));

  if (args.eventType === "Dry Hire") {
    const outboundLabel =
      args.rentalFulfillmentMode === "will_call" ? "Check-out Window" : "Drop-off Window";
    const returnLabel =
      args.rentalFulfillmentMode === "will_call" ? "Return Window" : "Pickup Window";
    return [
      {
        blockType: "setup",
        label: outboundLabel,
        dayIndex: dayIndexFrom(deliveryStart.getTime()),
        startsAt: toLocalDateTimeInput(deliveryStart),
        endsAt: toLocalDateTimeInput(showStart),
        notes: "",
      },
      {
        blockType: "strike",
        label: returnLabel,
        dayIndex: dayIndexFrom(showEnd.getTime()),
        startsAt: toLocalDateTimeInput(showEnd),
        endsAt: toLocalDateTimeInput(returnEnd),
        notes: "",
      },
    ];
  }

  const blocks: TimelineBlockDraft[] = [
    {
      blockType: "setup",
      label: "Setup",
      dayIndex: dayIndexFrom(setupStart.getTime()),
      startsAt: toLocalDateTimeInput(setupStart),
      endsAt: toLocalDateTimeInput(showStart),
      notes: "",
    },
    {
      blockType: "strike",
      label: "Strike",
      dayIndex: dayIndexFrom(showEnd.getTime()),
      startsAt: toLocalDateTimeInput(showEnd),
      endsAt: toLocalDateTimeInput(strikeEnd),
      notes: "",
    },
  ];

  if (args.eventType === "Crewed Event") {
    blocks.splice(1, 0, {
      blockType: "show",
      label: "Show",
      dayIndex: 0,
      startsAt: toLocalDateTimeInput(showStart),
      endsAt: toLocalDateTimeInput(showEnd),
      notes: "",
    });
  }

  return blocks;
}

export function seriesDayCount(anchorStartAt: number, anchorEndAt: number) {
  return Math.max(
    1,
    Math.floor(Math.max(0, anchorEndAt - anchorStartAt) / (24 * 60 * 60 * 1000)) + 1,
  );
}
