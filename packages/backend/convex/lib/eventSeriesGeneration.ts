import {
  occurrenceEndAtFromAnchor,
  occurrenceStartAt,
  addPacificWeeks,
  pacificDateKey,
  PORTAL_TIMEZONE,
} from "@arbor/format";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { syncEventCrewCostUsd } from "./crewCost";
import { detachInvoiceFromAdditionalLinks } from "./eventInvoiceLinks";
import { syncEventStatusForLinkedInvoice, type EventStatus } from "./eventStatus";
import {
  hasPendingInquiry,
  MAX_INQUIRIES_CHECKED,
  MAX_OCCURRENCE_ACTS,
  MAX_OCCURRENCE_POSITIONS,
  planPositionTemplateApplication,
  positionWindowFromTemplate,
  type EventSeriesPositionTemplate,
} from "./eventSeriesPositions";
import { removePositionRow } from "./positionRows";
import { isActBlock, syncNeedBlocks } from "./runOfShow";
import type { ScheduleBlockType } from "./scheduleBlockTypes";
import { isMultiDayGroup } from "./eventGroupKind";
import { listGroupDays, selectDaysInScope, type GroupApplyScope } from "./eventGroupDays";
import { formatPacificShortDate } from "./bookingDayLoad";

export const EVENT_TIMEZONE = PORTAL_TIMEZONE;

export type EventSeriesBlockTemplate = {
  blockType: ScheduleBlockType;
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

export async function resolveDefaultCrewHourlyRateUsd(ctx: MutationCtx) {
  const settings = await ctx.db
    .query("invoiceSettings")
    .withIndex("by_key", (q) => q.eq("key", "default"))
    .unique();
  const normal = settings?.crewNormalRateUsd;
  const lead = settings?.crewLeadRateUsd ?? settings?.crewOtRateUsd;
  const rates = [normal, lead].filter(
    (rate): rate is number => rate !== undefined && Number.isFinite(rate) && rate > 0,
  );
  if (rates.length === 0) return undefined;
  return Math.round((rates.reduce((sum, rate) => sum + rate, 0) / rates.length) * 100) / 100;
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
  // Templates never include an act's soundcheck/set blocks.
  const blocks = (
    await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", eventId))
      .take(500)
  ).filter((block) => !isActBlock(block));
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
  | "hostGroupId"
  | "host"
  | "additionalHostGroupIds"
  | "expectedTurnout"
  | "budgetUsd"
  | "occurrenceBandsCostUsd"
  | "occurrenceExternalRentalsCostUsd"
  | "occurrenceOtherCostUsd"
  | "dayOfLeadUserId"
  | "eventManagerUserId"
  | "operationsLeadUserId"
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

  const starts: number[] = [];

  if (args.occurrenceCount !== undefined) {
    for (let index = 0; index < args.occurrenceCount; index += 1) {
      starts.push(occurrenceStartAt(args.anchorStartAt, index, args.intervalWeeks));
    }
    return starts;
  }

  const endBound = args.seriesEndAt!;
  let current = args.anchorStartAt;
  while (current <= endBound) {
    starts.push(current);
    current = addPacificWeeks(current, args.intervalWeeks);
  }
  if (starts.length === 0) {
    throw new Error("No occurrences fall within the selected end date.");
  }
  return starts;
}

export function blocksToTemplates(
  blocks: Array<{
    blockType: ScheduleBlockType;
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
  return occurrenceEndAtFromAnchor(startAt, anchorStartAt, anchorEndAt);
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
    // An act's soundcheck/set blocks belong to this occurrence's lineup.
    if (isActBlock(block)) continue;
    await ctx.db.delete(block._id);
  }
  await insertScheduleBlocksFromTemplates(ctx, eventId, occurrenceStartAt, templates, now);
}

/** An occurrence's positions, failing loudly past the cap rather than missing some. */
export async function listOccurrencePositions(ctx: MutationCtx, eventId: Id<"events">) {
  const slots = await ctx.db
    .query("eventArtistNeeds")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(MAX_OCCURRENCE_POSITIONS + 1);
  if (slots.length > MAX_OCCURRENCE_POSITIONS) {
    throw new Error(
      `An occurrence can have at most ${MAX_OCCURRENCE_POSITIONS} positions for templates to apply, got more.`,
    );
  }
  return slots;
}

/**
 * Positions a template apply must not move or remove: a platform act fills it,
 * an outside act is named on it, it isn't open, an artist has a submitted
 * inquiry on it (staff can set a position back to "open" while inquiries are
 * pending), or an invoice artist line stands for it.
 */
async function lockedPositionIds(
  ctx: MutationCtx,
  eventId: Id<"events">,
  slots: readonly Doc<"eventArtistNeeds">[],
) {
  const participations = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(MAX_OCCURRENCE_ACTS + 1);
  if (participations.length > MAX_OCCURRENCE_ACTS) {
    // Can't tell which positions are filled: refuse rather than risk changing one.
    throw new Error(
      `An occurrence can have at most ${MAX_OCCURRENCE_ACTS} acts for templates to apply, got more.`,
    );
  }
  const locked = new Set(participations.flatMap((row) => (row.needId ? [row.needId] : [])));
  for (const slot of slots) {
    if (locked.has(slot._id)) continue;
    if (slot.externalArtistName?.trim() || slot.status !== "open") {
      locked.add(slot._id);
      continue;
    }
    const [inquiries, invoiceLine] = await Promise.all([
      ctx.db
        .query("eventArtistInquiries")
        .withIndex("by_needId", (q) => q.eq("needId", slot._id))
        .take(MAX_INQUIRIES_CHECKED + 1),
      ctx.db
        .query("invoiceLineItems")
        .withIndex("by_needId", (q) => q.eq("needId", slot._id))
        .first(),
    ]);
    if (invoiceLine || hasPendingInquiry(inquiries)) {
      locked.add(slot._id);
    }
  }
  return locked;
}

/**
 * Apply the series position templates to one occurrence: add missing open
 * template positions, move/refresh the open ones, and drop open template
 * positions whose template is gone. Locked positions (see `lockedPositionIds`)
 * are never touched.
 */
export async function applyPositionTemplates(
  ctx: MutationCtx,
  eventId: Id<"events">,
  occurrenceStartAt: number,
  templates: readonly EventSeriesPositionTemplate[],
  now: number,
): Promise<number> {
  const slots = await listOccurrencePositions(ctx, eventId);
  const lockedIds = await lockedPositionIds(ctx, eventId, slots);
  const plan = planPositionTemplateApplication(
    slots.map((slot) => ({
      _id: slot._id,
      templateKey: slot.templateKey,
      label: slot.label,
      locked: lockedIds.has(slot._id),
    })),
    templates,
  );
  const orderByKey = new Map(templates.map((template, index) => [template.templateKey, index]));

  for (const needId of plan.removeIds) {
    await removePositionRow(ctx, needId);
  }
  for (const { needId, templateKey } of plan.stampKeys) {
    await ctx.db.patch(needId, { templateKey, updatedAt: now });
  }

  for (const action of plan.actions) {
    const template = action.template;
    const window = positionWindowFromTemplate(template, occurrenceStartAt);
    const fields = {
      templateKey: template.templateKey,
      sortOrder: orderByKey.get(template.templateKey) ?? 0,
      label: template.label.trim() || undefined,
      artistType: template.artistType,
      genres: template.genres?.trim() || undefined,
      ...window,
    };
    if (action.kind === "insert") {
      const needId = await ctx.db.insert("eventArtistNeeds", {
        eventId,
        status: "open",
        ...fields,
        createdAt: now,
        updatedAt: now,
      });
      await syncNeedBlocks(ctx, needId);
      continue;
    }
    const existing = await ctx.db.get(action.needId);
    if (!existing) continue;
    // `replace` (not `patch`) so a template that dropped a set/soundcheck
    // window actually clears the stored times.
    const next: Doc<"eventArtistNeeds"> = { ...existing, ...fields, updatedAt: now };
    delete next.setStartsAt;
    delete next.setEndsAt;
    delete next.soundcheckStartsAt;
    delete next.soundcheckEndsAt;
    Object.assign(next, window);
    await ctx.db.replace(action.needId, next);
    await syncNeedBlocks(ctx, action.needId);
  }

  return plan.actions.length + plan.removeIds.length + plan.stampKeys.length;
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
    title: isMultiDayGroup(series) ? multiDayTitle(series.title, startAt) : series.title,
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
    hostGroupId: series.hostGroupId,
    host: series.host,
    additionalHostGroupIds: series.additionalHostGroupIds,
    expectedTurnout: series.expectedTurnout,
    budgetUsd: series.budgetUsd,
    bandsCostUsd: series.occurrenceBandsCostUsd,
    externalRentalsCostUsd: series.occurrenceExternalRentalsCostUsd,
    otherCostUsd: series.occurrenceOtherCostUsd,
    crewCostUsd: series.occurrenceBudgetCrewCostUsd,
    dayOfLeadUserId: series.dayOfLeadUserId,
    eventManagerUserId: series.eventManagerUserId,
    operationsLeadUserId: series.operationsLeadUserId,
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
    await resolveDefaultCrewHourlyRateUsd(ctx),
    now,
  );
  if (series.shiftTemplates && series.shiftTemplates.length > 0) {
    await syncEventCrewCostUsd(ctx, eventId, now);
  }
  await applyPositionTemplates(ctx, eventId, startAt, series.positionTemplates ?? [], now);
  if (series.invoiceId) {
    await syncEventStatusForLinkedInvoice(ctx, eventId, series.invoiceId, "tentative");
  }
  return eventId;
}

/**
 * Fields every day of a group shares. A multi-day booking's days keep their
 * own title (dated), times and per-day costs, so only these propagate there.
 */
const SHARED_DAY_FIELDS = [
  "venueId",
  "venueName",
  "eventType",
  "teamsInterested",
  "category",
  "hostGroupId",
  "host",
  "additionalHostGroupIds",
  "expectedTurnout",
  "dayOfLeadUserId",
  "eventManagerUserId",
  "operationsLeadUserId",
  "rentalFulfillmentMode",
  "requiresShowWindow",
] as const satisfies ReadonlyArray<keyof Doc<"events"> & keyof Doc<"eventSeries">>;

type SharedDayFields = Pick<Doc<"events">, (typeof SHARED_DAY_FIELDS)[number]>;

function pickSharedDayFields(source: Partial<SharedDayFields>): Partial<SharedDayFields> {
  const out: Partial<SharedDayFields> = {};
  for (const field of SHARED_DAY_FIELDS) {
    if (field in source) Object.assign(out, { [field]: source[field] });
  }
  return out;
}

export function buildSharedDayPatchFromGroup(group: Doc<"eventSeries">): Partial<Doc<"events">> {
  return pickSharedDayFields(group);
}

/** The shared fields of a day edit, as a patch for its group. */
export function buildSharedGroupPatchFromDay(
  patch: Partial<Doc<"events">>,
): Partial<Doc<"eventSeries">> {
  return pickSharedDayFields(patch);
}

/** Where a group day starts: recurring days follow the rule; multi-day days are their own. */
export function groupDayStartAt(
  group: Doc<"eventSeries">,
  day: Pick<Doc<"events">, "startAt" | "occurrenceIndex">,
) {
  if (isMultiDayGroup(group) || group.intervalWeeks === undefined) return day.startAt;
  return occurrenceStartAt(group.anchorStartAt, day.occurrenceIndex ?? 0, group.intervalWeeks);
}

/** A multi-day booking's day title: "<group> — <short date>". */
export function multiDayTitle(groupTitle: string, startAt: number) {
  return `${groupTitle} — ${formatPacificShortDate(pacificDateKey(startAt))}`;
}

export function buildEventPatchFromSeriesTemplate(
  series: Doc<"eventSeries">,
  startAt: number,
): Partial<Doc<"events">> {
  if (isMultiDayGroup(series)) return buildSharedDayPatchFromGroup(series);
  const endAt = occurrenceEndAt(startAt, series.anchorStartAt, series.anchorEndAt);
  return {
    title: series.title,
    venueId: series.venueId,
    venueName: series.venueName,
    eventType: series.eventType,
    teamsInterested: series.teamsInterested,
    category: series.category,
    hostGroupId: series.hostGroupId,
    host: series.host,
    additionalHostGroupIds: series.additionalHostGroupIds,
    expectedTurnout: series.expectedTurnout,
    budgetUsd: series.budgetUsd,
    bandsCostUsd: series.occurrenceBandsCostUsd,
    externalRentalsCostUsd: series.occurrenceExternalRentalsCostUsd,
    otherCostUsd: series.occurrenceOtherCostUsd,
    dayOfLeadUserId: series.dayOfLeadUserId,
    eventManagerUserId: series.eventManagerUserId,
    operationsLeadUserId: series.operationsLeadUserId,
    rentalFulfillmentMode: series.rentalFulfillmentMode,
    notes: series.notes,
    requiresShowWindow: series.requiresShowWindow,
    startAt,
    endAt,
    spansMultipleDays: spansMultipleDays(startAt, endAt),
    timezone: series.timezone,
  };
}

export type SeriesEditScope = GroupApplyScope;

export async function propagateInvoiceIdToSeriesOccurrences(
  ctx: MutationCtx,
  seriesId: Id<"eventSeries">,
  invoiceId: Id<"invoices"> | undefined,
  referenceOccurrenceIndex: number,
  scope: SeriesEditScope,
  now: number,
) {
  const occurrences = selectDaysInScope(
    await listGroupDays(ctx, seriesId),
    scope,
    referenceOccurrenceIndex,
    now,
  );

  for (const occurrence of occurrences) {

    await ctx.db.patch(occurrence._id, { invoiceId, updatedAt: now });
    if (invoiceId) {
      await detachInvoiceFromAdditionalLinks(ctx, occurrence._id, invoiceId);
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
  const occurrences = selectDaysInScope(
    await listGroupDays(ctx, series._id),
    scope,
    referenceOccurrenceIndex,
    now,
  );

  const affected: SeriesOverviewAffectedOccurrence[] = [];

  for (const occurrence of occurrences) {

    const patch = buildEventPatchFromSeriesTemplate(series, groupDayStartAt(series, occurrence));
    await ctx.db.patch(occurrence._id, { ...patch, ...overrides, updatedAt: now });
    affected.push({
      id: occurrence._id,
      prevStatus: occurrence.status,
      invoiceId: occurrence.invoiceId,
    });
  }

  return affected;
}
