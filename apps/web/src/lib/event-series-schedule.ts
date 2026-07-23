import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import {
  localDateTimeInputToMs,
  toLocalDateTimeInput,
} from "@/lib/crew-availability";
import { pacificDayIndexFromAnchor, pacificScheduleDayCount } from "@/lib/format";

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
        startsAt: toLocalDateTimeInput(startsAt),
        endsAt: toLocalDateTimeInput(endsAt),
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
    .sort(
      (a, b) =>
        (localDateTimeInputToMs(a.startsAt) ?? 0) - (localDateTimeInputToMs(b.startsAt) ?? 0),
    )
    .map((block) => {
      const startsAt = localDateTimeInputToMs(block.startsAt) ?? anchorStartAt;
      const endsAt = localDateTimeInputToMs(block.endsAt) ?? startsAt;
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
  const showStartMs = args.anchorStartAt;
  const showEndMs = args.anchorEndAt;
  const setupStartMs = showStartMs - 3 * 60 * 60 * 1000;
  const strikeEndMs = showEndMs + 2 * 60 * 60 * 1000;
  const deliveryStartMs = showStartMs - 2 * 60 * 60 * 1000;
  const returnEndMs = showEndMs + 2 * 60 * 60 * 1000;
  const dayIndexFrom = (timeMs: number) => pacificDayIndexFromAnchor(showStartMs, timeMs);

  if (args.eventType === "Dry Hire") {
    const outboundLabel =
      args.rentalFulfillmentMode === "will_call" ? "Check-out Window" : "Drop-off Window";
    const returnLabel =
      args.rentalFulfillmentMode === "will_call" ? "Return Window" : "Pickup Window";
    return [
      {
        blockType: "setup",
        label: outboundLabel,
        dayIndex: dayIndexFrom(deliveryStartMs),
        startsAt: toLocalDateTimeInput(deliveryStartMs),
        endsAt: toLocalDateTimeInput(showStartMs),
        notes: "",
      },
      {
        blockType: "strike",
        label: returnLabel,
        dayIndex: dayIndexFrom(showEndMs),
        startsAt: toLocalDateTimeInput(showEndMs),
        endsAt: toLocalDateTimeInput(returnEndMs),
        notes: "",
      },
    ];
  }

  const blocks: TimelineBlockDraft[] = [
    {
      blockType: "setup",
      label: "Setup",
      dayIndex: dayIndexFrom(setupStartMs),
      startsAt: toLocalDateTimeInput(setupStartMs),
      endsAt: toLocalDateTimeInput(showStartMs),
      notes: "",
    },
    {
      blockType: "strike",
      label: "Strike",
      dayIndex: dayIndexFrom(showEndMs),
      startsAt: toLocalDateTimeInput(showEndMs),
      endsAt: toLocalDateTimeInput(strikeEndMs),
      notes: "",
    },
  ];

  if (args.eventType === "Crewed Event") {
    blocks.splice(1, 0, {
      blockType: "show",
      label: "Show",
      dayIndex: 0,
      startsAt: toLocalDateTimeInput(showStartMs),
      endsAt: toLocalDateTimeInput(showEndMs),
      notes: "",
    });
  }

  return blocks;
}

export function seriesDayCount(anchorStartAt: number, anchorEndAt: number) {
  return pacificScheduleDayCount(anchorStartAt, anchorEndAt);
}
