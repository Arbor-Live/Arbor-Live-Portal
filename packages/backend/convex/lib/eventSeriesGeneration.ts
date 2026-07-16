import { pacificDateKey, PORTAL_TIMEZONE } from "@arbor/format";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { syncEventCrewCostUsd } from "./crewCost";
import { syncEventStatusForLinkedInvoice, type EventStatus } from "./eventStatus";

export const EVENT_TIMEZONE = PORTAL_TIMEZONE;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type EventSeriesBlockTemplate = {
  blockType: "setup" | "show" | "strike" | "custom";
  label: string;
  dayIndex: number;
  offsetMs: number;
  durationMs: number;
  notes?: string;
};

export type EventSeriesShiftTemplate = {
  role: string;
  blockTemplateIndex: number;
  offsetMs: number;
  durationMs: number;
  estimatedHourlyRateUsd?: number;
  notes?: string;
};

function hoursBetween(start: number, end: number) {
  return Number(((end - start) / 3_600_000).toFixed(2));
}

export function sortedBlockTemplates(templates: EventSeriesBlockTemplate[]) {
  return templates.slice().sort((a, b) => a.offsetMs - b.offsetMs);
}

export function blockIdsByTemplateIndex(
  blocks: Array<{ _id: Id<"eventScheduleBlocks">; startsAt: number }>,
  blockTemplates: EventSeriesBlockTemplate[] | undefined,
  occurrenceStartAt: number,
) {
  const byIndex = new Map<number, Id<"eventScheduleBlocks">>();
  if (!blockTemplates || blockTemplates.length === 0) return byIndex;
  const sortedTemplates = sortedBlockTemplates(blockTemplates);
  const sortedBlocks = blocks.slice().sort((a, b) => a.startsAt - b.startsAt);
  for (let index = 0; index < sortedTemplates.length; index += 1) {
    const template = sortedTemplates[index]!;
    const expectedStartsAt = occurrenceStartAt + template.offsetMs;
    const matched =
      sortedBlocks.find((block) => block.startsAt === expectedStartsAt) ?? sortedBlocks[index];
    if (matched) byIndex.set(index, matched._id);
  }
  return byIndex;
}

export function shiftsToTemplates(
  shifts: Array<{
    role: string;
    scheduleBlockId?: Id<"eventScheduleBlocks">;
    userId?: string;
    startsAt: number;
    endsAt: number;
    estimatedHourlyRateUsd?: number;
    notes?: string;
  }>,
  blocks: Array<{ _id: Id<"eventScheduleBlocks">; startsAt: number }>,
  blockTemplates: EventSeriesBlockTemplate[] | undefined,
  occurrenceStartAt: number,
): EventSeriesShiftTemplate[] {
  if (!blockTemplates || blockTemplates.length === 0) return [];
  const blockIdToIndex = new Map<Id<"eventScheduleBlocks">, number>();
  const blockIds = blockIdsByTemplateIndex(blocks, blockTemplates, occurrenceStartAt);
  for (const [index, blockId] of blockIds.entries()) {
    blockIdToIndex.set(blockId, index);
  }

  return shifts
    .filter((shift) => !shift.userId?.trim())
    .slice()
    .sort((a, b) => a.startsAt - b.startsAt)
    .flatMap((shift) => {
      if (!shift.scheduleBlockId) return [];
      const blockTemplateIndex = blockIdToIndex.get(shift.scheduleBlockId);
      if (blockTemplateIndex === undefined) return [];
      return [
        {
          role: shift.role,
          blockTemplateIndex,
          offsetMs: shift.startsAt - occurrenceStartAt,
          durationMs: shift.endsAt - shift.startsAt,
          estimatedHourlyRateUsd: shift.estimatedHourlyRateUsd,
          notes: shift.notes,
        },
      ];
    });
}

export async function insertShiftsFromTemplates(
  ctx: MutationCtx,
  eventId: Id<"events">,
  occurrenceStartAt: number,
  shiftTemplates: EventSeriesShiftTemplate[] | undefined,
  blockTemplates: EventSeriesBlockTemplate[] | undefined,
  defaultHourlyRateUsd: number | undefined,
  now: number,
) {
  if (!shiftTemplates || shiftTemplates.length === 0) return;
  const blocks = await ctx.db
    .query("eventScheduleBlocks")
    .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", eventId))
    .take(500);
  const blockIdByIndex = blockIdsByTemplateIndex(blocks, blockTemplates, occurrenceStartAt);

  for (const template of shiftTemplates) {
    const startsAt = occurrenceStartAt + template.offsetMs;
    const endsAt = startsAt + template.durationMs;
    const scheduleBlockId = blockIdByIndex.get(template.blockTemplateIndex);
    const estimatedHourlyRateUsd =
      template.estimatedHourlyRateUsd !== undefined && template.estimatedHourlyRateUsd > 0
        ? template.estimatedHourlyRateUsd
        : defaultHourlyRateUsd !== undefined && defaultHourlyRateUsd > 0
          ? defaultHourlyRateUsd
          : undefined;
    await ctx.db.insert("eventCrewShifts", {
      eventId,
      scheduleBlockId,
      role: template.role.trim(),
      startsAt,
      endsAt,
      hours: hoursBetween(startsAt, endsAt),
      estimatedHourlyRateUsd,
      postedToExpense: false,
      notes: template.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function replaceEmptyShiftsFromTemplates(
  ctx: MutationCtx,
  eventId: Id<"events">,
  occurrenceStartAt: number,
  shiftTemplates: EventSeriesShiftTemplate[] | undefined,
  blockTemplates: EventSeriesBlockTemplate[] | undefined,
  defaultHourlyRateUsd: number | undefined,
  now: number,
) {
  const existingShifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(500);
  for (const shift of existingShifts) {
    if (!shift.userId?.trim()) {
      await ctx.db.delete(shift._id);
    }
  }
  await insertShiftsFromTemplates(
    ctx,
    eventId,
    occurrenceStartAt,
    shiftTemplates,
    blockTemplates,
    defaultHourlyRateUsd,
    now,
  );
}

export type SeriesTemplateFields = Pick<
  Doc<"eventSeries">,
  | "title"
  | "requiresShowWindow"
  | "venueId"
  | "venueName"
  | "eventType"
  | "teamsInterested"
  | "category"
  | "host"
  | "expectedTurnout"
  | "budgetUsd"
  | "occurrenceBandsCostUsd"
  | "occurrenceExternalRentalsCostUsd"
  | "occurrenceOtherCostUsd"
  | "dayOfLeadUserId"
  | "eventManagerUserId"
  | "rentalFulfillmentMode"
  | "notes"
>;

export function makePublicToken() {
  return `evt_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

export function computeOccurrenceStarts(args: {
  anchorStartAt: number;
  intervalWeeks: number;
  occurrenceCount?: number;
  seriesEndAt?: number;
}): number[] {
  if (args.intervalWeeks < 1) {
    throw new Error("Interval must be at least 1 week.");
  }
  if (args.occurrenceCount !== undefined && args.occurrenceCount < 1) {
    throw new Error("Occurrence count must be at least 1.");
  }
  if (args.occurrenceCount === undefined && args.seriesEndAt === undefined) {
    throw new Error("Provide either occurrence count or series end date.");
  }
  if (args.occurrenceCount !== undefined && args.seriesEndAt !== undefined) {
    throw new Error("Provide either occurrence count or series end date, not both.");
  }

  const intervalMs = args.intervalWeeks * WEEK_MS;
  const starts: number[] = [];
  let current = args.anchorStartAt;

  if (args.occurrenceCount !== undefined) {
    for (let index = 0; index < args.occurrenceCount; index += 1) {
      starts.push(current);
      current += intervalMs;
    }
    return starts;
  }

  const endBound = args.seriesEndAt!;
  while (current <= endBound) {
    starts.push(current);
    current += intervalMs;
  }
  if (starts.length === 0) {
    throw new Error("No occurrences fall within the selected end date.");
  }
  return starts;
}

export function blocksToTemplates(
  blocks: Array<{
    blockType: "setup" | "show" | "strike" | "custom";
    label: string;
    dayIndex: number;
    startsAt: number;
    endsAt: number;
    notes?: string;
  }>,
  anchorStartAt: number,
): EventSeriesBlockTemplate[] {
  return blocks
    .slice()
    .sort((a, b) => a.startsAt - b.startsAt)
    .map((block) => ({
      blockType: block.blockType,
      label: block.label,
      dayIndex: block.dayIndex,
      offsetMs: block.startsAt - anchorStartAt,
      durationMs: block.endsAt - block.startsAt,
      notes: block.notes,
    }));
}

export function occurrenceEndAt(startAt: number, anchorStartAt: number, anchorEndAt: number) {
  const durationMs = anchorEndAt - anchorStartAt;
  return startAt + durationMs;
}

export function spansMultipleDays(startAt: number, endAt: number) {
  return pacificDateKey(startAt) !== pacificDateKey(endAt);
}

export async function insertScheduleBlocksFromTemplates(
  ctx: MutationCtx,
  eventId: Id<"events">,
  occurrenceStartAt: number,
  templates: EventSeriesBlockTemplate[] | undefined,
  now: number,
) {
  if (!templates || templates.length === 0) return;
  for (const template of templates) {
    const startsAt = occurrenceStartAt + template.offsetMs;
    const endsAt = startsAt + template.durationMs;
    await ctx.db.insert("eventScheduleBlocks", {
      eventId,
      blockType: template.blockType,
      label: template.label,
      dayIndex: template.dayIndex,
      startsAt,
      endsAt,
      notes: template.notes,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function replaceScheduleBlocksFromTemplates(
  ctx: MutationCtx,
  eventId: Id<"events">,
  occurrenceStartAt: number,
  templates: EventSeriesBlockTemplate[] | undefined,
  now: number,
) {
  const existingBlocks = await ctx.db
    .query("eventScheduleBlocks")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(500);
  for (const block of existingBlocks) {
    await ctx.db.delete(block._id);
  }
  await insertScheduleBlocksFromTemplates(ctx, eventId, occurrenceStartAt, templates, now);
}

export async function materializeOccurrence(
  ctx: MutationCtx,
  series: Doc<"eventSeries">,
  occurrenceIndex: number,
  startAt: number,
  now: number,
): Promise<Id<"events">> {
  const endAt = occurrenceEndAt(startAt, series.anchorStartAt, series.anchorEndAt);
  const eventId = await ctx.db.insert("events", {
    title: series.title,
    status: "tentative",
    visibility: "public",
    invoiceId: series.invoiceId,
    seriesId: series._id,
    occurrenceIndex,
    seriesDetached: false,
    startAt,
    endAt,
    timezone: series.timezone,
    spansMultipleDays: spansMultipleDays(startAt, endAt),
    setupOnly: false,
    strikeOnly: false,
    requiresShowWindow: series.requiresShowWindow,
    venueId: series.venueId,
    venueName: series.venueName,
    eventType: series.eventType,
    teamsInterested: series.teamsInterested,
    category: series.category,
    host: series.host,
    expectedTurnout: series.expectedTurnout,
    budgetUsd: series.budgetUsd,
    bandsCostUsd: series.occurrenceBandsCostUsd,
    externalRentalsCostUsd: series.occurrenceExternalRentalsCostUsd,
    otherCostUsd: series.occurrenceOtherCostUsd,
    crewCostUsd: series.occurrenceBudgetCrewCostUsd,
    dayOfLeadUserId: series.dayOfLeadUserId,
    eventManagerUserId: series.eventManagerUserId,
    rentalFulfillmentMode: series.rentalFulfillmentMode,
    notes: series.notes,
    createdAt: now,
    updatedAt: now,
    publicToken: makePublicToken(),
  });
  await insertScheduleBlocksFromTemplates(
    ctx,
    eventId,
    startAt,
    series.blockTemplates ?? undefined,
    now,
  );
  await insertShiftsFromTemplates(
    ctx,
    eventId,
    startAt,
    series.shiftTemplates ?? undefined,
    series.blockTemplates ?? undefined,
    series.budgetCrewHourlyRateUsd,
    now,
  );
  if (series.shiftTemplates && series.shiftTemplates.length > 0) {
    await syncEventCrewCostUsd(ctx, eventId, now);
  }
  if (series.invoiceId) {
    await syncEventStatusForLinkedInvoice(ctx, eventId, series.invoiceId, "tentative");
  }
  return eventId;
}

export function buildEventPatchFromSeriesTemplate(
  series: Doc<"eventSeries">,
  startAt: number,
): Partial<Doc<"events">> {
  const endAt = occurrenceEndAt(startAt, series.anchorStartAt, series.anchorEndAt);
  return {
    title: series.title,
    venueId: series.venueId,
    venueName: series.venueName,
    eventType: series.eventType,
    teamsInterested: series.teamsInterested,
    category: series.category,
    host: series.host,
    expectedTurnout: series.expectedTurnout,
    budgetUsd: series.budgetUsd,
    bandsCostUsd: series.occurrenceBandsCostUsd,
    externalRentalsCostUsd: series.occurrenceExternalRentalsCostUsd,
    otherCostUsd: series.occurrenceOtherCostUsd,
    dayOfLeadUserId: series.dayOfLeadUserId,
    eventManagerUserId: series.eventManagerUserId,
    rentalFulfillmentMode: series.rentalFulfillmentMode,
    notes: series.notes,
    requiresShowWindow: series.requiresShowWindow,
    startAt,
    endAt,
    spansMultipleDays: spansMultipleDays(startAt, endAt),
    timezone: series.timezone,
  };
}

export type SeriesEditScope = "this" | "future" | "all";

export function shouldApplySeriesUpdate(
  event: Doc<"events">,
  scope: SeriesEditScope,
  referenceOccurrenceIndex: number,
  now: number,
) {
  if (!event.seriesId || event.seriesDetached) return false;
  if (event.status === "cancelled") return false;
  if (scope === "this") return false;
  if (scope === "all") return true;
  const occurrenceIndex = event.occurrenceIndex ?? 0;
  if (occurrenceIndex < referenceOccurrenceIndex) return false;
  if (event.startAt < now) return false;
  return true;
}

export async function propagateInvoiceIdToSeriesOccurrences(
  ctx: MutationCtx,
  seriesId: Id<"eventSeries">,
  invoiceId: Id<"invoices"> | undefined,
  referenceOccurrenceIndex: number,
  scope: SeriesEditScope,
  now: number,
) {
  const occurrences = await ctx.db
    .query("events")
    .withIndex("by_seriesId_and_occurrenceIndex", (q) => q.eq("seriesId", seriesId))
    .take(200);

  for (const occurrence of occurrences.sort(
    (a, b) => (a.occurrenceIndex ?? 0) - (b.occurrenceIndex ?? 0),
  )) {
    if (scope === "this") {
      if (occurrence.occurrenceIndex !== referenceOccurrenceIndex) continue;
    } else if (!shouldApplySeriesUpdate(occurrence, scope, referenceOccurrenceIndex, now)) {
      continue;
    }
    if (occurrence.seriesDetached || occurrence.status === "cancelled") continue;

    await ctx.db.patch(occurrence._id, { invoiceId, updatedAt: now });
    if (invoiceId) {
      await syncEventStatusForLinkedInvoice(ctx, occurrence._id, invoiceId, occurrence.status);
    }
  }
}
export type SeriesOverviewOverride = {
  status?: EventStatus;
  visibility?: "public" | "internal" | "informational";
  otPremium?: boolean;
  crewCostBufferPercent?: number;
};

export type SeriesOverviewAffectedOccurrence = {
  id: Id<"events">;
  prevStatus: string;
  invoiceId: Id<"invoices"> | undefined;
};

export async function propagateOverviewToSeriesOccurrences(
  ctx: MutationCtx,
  series: Doc<"eventSeries">,
  referenceOccurrenceIndex: number,
  scope: SeriesEditScope,
  now: number,
  overrides?: SeriesOverviewOverride,
): Promise<SeriesOverviewAffectedOccurrence[]> {
  const occurrences = await ctx.db
    .query("events")
    .withIndex("by_seriesId_and_occurrenceIndex", (q) => q.eq("seriesId", series._id))
    .take(200);
  const intervalMs = series.intervalWeeks * 7 * 24 * 60 * 60 * 1000;

  const affected: SeriesOverviewAffectedOccurrence[] = [];

  for (const occurrence of occurrences.sort(
    (a, b) => (a.occurrenceIndex ?? 0) - (b.occurrenceIndex ?? 0),
  )) {
    if (scope === "this") {
      if (occurrence.occurrenceIndex !== referenceOccurrenceIndex) continue;
    } else if (!shouldApplySeriesUpdate(occurrence, scope, referenceOccurrenceIndex, now)) {
      continue;
    }

    const occurrenceIndex = occurrence.occurrenceIndex ?? 0;
    const startAt = series.anchorStartAt + occurrenceIndex * intervalMs;
    const patch = buildEventPatchFromSeriesTemplate(series, startAt);
    await ctx.db.patch(occurrence._id, { ...patch, ...overrides, updatedAt: now });
    affected.push({
      id: occurrence._id,
      prevStatus: occurrence.status,
      invoiceId: occurrence.invoiceId,
    });
  }

  return affected;
}
