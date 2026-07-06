"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  EventTimelineScheduler,
  type TimelineBlockDraft,
} from "@/components/events/event-timeline-scheduler";
import { SERIES_EDIT_SCOPE_LABELS, type SeriesEditScope } from "@/lib/event-series";
import {
  seriesDayCount,
  templatesToTimelineDrafts,
  type SeriesBlockTemplate,
} from "@/lib/event-series-schedule";
import {
  createShiftDraftForBlock,
  formatDurationHours,
  formatOffsetHours,
  shiftDraftsToTemplates,
  shiftTemplatesToDrafts,
  sortedBlockTemplateOptions,
  totalEstimatedShiftCostUsd,
  type SeriesShiftTemplate,
  type SeriesShiftTemplateDraft,
} from "@/lib/event-series-shifts";
import {
  seriesShiftEditorSchema,
  type SeriesShiftEditorFormValues,
} from "@/lib/validations/event";
import { formatOccurrencePreview } from "@/lib/event-series";
import { formatUsd } from "@/lib/format";

type EventSeriesShiftEditorProps = {
  seriesId: Id<"eventSeries">;
  anchorStartAt: number;
  anchorEndAt: number;
  eventType?: string;
  rentalFulfillmentMode?: "delivery" | "will_call" | "pickup";
  blockTemplates?: SeriesBlockTemplate[];
  shiftTemplates?: SeriesShiftTemplate[];
  budgetCrewHourlyRateUsd?: number;
  occurrences: Array<{ _id: Id<"events">; occurrenceIndex?: number; startAt: number }>;
  onMessage: (message: string) => void;
  onShiftDraftsChange?: (drafts: SeriesShiftTemplateDraft[]) => void;
  title?: string;
  description?: string;
  billableOccurrenceCount?: number;
};

function normalizeEventType(value: string | undefined) {
  if (value === "Dry Rental") return "Dry Hire" as const;
  if (
    value === "Crewed Event" ||
    value === "Rental with Crew" ||
    value === "Dry Hire" ||
    value === "Services Only"
  ) {
    return value;
  }
  return "Crewed Event" as const;
}

function blocksFromTemplates(
  blockTemplates: SeriesBlockTemplate[] | undefined,
  anchorStartAt: number,
): TimelineBlockDraft[] {
  return templatesToTimelineDrafts(blockTemplates ?? [], anchorStartAt).map((block, index) => ({
    ...block,
    clientId: block.clientId ?? `template-${index}`,
  }));
}

export function EventSeriesShiftEditor({
  seriesId,
  anchorStartAt,
  anchorEndAt,
  eventType,
  blockTemplates,
  shiftTemplates,
  budgetCrewHourlyRateUsd,
  occurrences,
  onMessage,
  onShiftDraftsChange,
  title = "Series crew shift template",
  description = "Define empty shifts once for cost estimation. Applying syncs schedule blocks and replaces unassigned shifts on selected occurrences; staffed shifts are kept.",
  billableOccurrenceCount = 1,
}: EventSeriesShiftEditorProps) {
  const regenerateShifts = useMutation(api.eventSeries.regenerateFutureShifts);
  const importShifts = useMutation(api.eventSeries.importShiftsFromOccurrence);
  const localShiftCounterRef = useRef(0);
  const [shifts, setShifts] = useState<SeriesShiftTemplateDraft[]>([]);
  const [shiftsDirty, setShiftsDirty] = useState(false);

  const form = useConvexForm<SeriesShiftEditorFormValues>({
    schema: seriesShiftEditorSchema,
    defaultValues: {
      applyScope: "all",
      fromOccurrenceIndex: "0",
      importOccurrenceId: "",
      defaultHourlyRate: "",
    },
    mode: "onChange",
  });

  const resolvedEventType = normalizeEventType(eventType);
  const dayCount = seriesDayCount(anchorStartAt, anchorEndAt);
  const hideSchedule = resolvedEventType === "Services Only";

  const blockOptions = useMemo(
    () => sortedBlockTemplateOptions(blockTemplates ?? []),
    [blockTemplates],
  );

  const timelineBlocks = useMemo(
    () => blocksFromTemplates(blockTemplates, anchorStartAt),
    [blockTemplates, anchorStartAt],
  );

  const initialShifts = useMemo(
    () => shiftTemplatesToDrafts(shiftTemplates ?? [], budgetCrewHourlyRateUsd),
    [shiftTemplates, budgetCrewHourlyRateUsd],
  );

  const initialDefaultRate =
    budgetCrewHourlyRateUsd !== undefined ? String(budgetCrewHourlyRateUsd) : "";

  useEffect(() => {
    setShifts(initialShifts);
    setShiftsDirty(false);
    form.reset({
      applyScope: "all",
      fromOccurrenceIndex: "0",
      importOccurrenceId: "",
      defaultHourlyRate: initialDefaultRate,
    });
  }, [initialShifts, initialDefaultRate, form]);

  useEffect(() => {
    onShiftDraftsChange?.(shifts);
  }, [shifts, onShiftDraftsChange]);

  const occurrenceOptions = useMemo(
    () =>
      occurrences.map((row) => ({
        value: row._id,
        label: `#${(row.occurrenceIndex ?? 0) + 1} · ${formatOccurrencePreview(row.startAt)}`,
      })),
    [occurrences],
  );

  const estimatedPerOccurrence = useMemo(() => totalEstimatedShiftCostUsd(shifts), [shifts]);
  const estimatedSeriesTotal = estimatedPerOccurrence * Math.max(1, billableOccurrenceCount);
  const isDirty = form.formState.isDirty || shiftsDirty;

  function updateShift(clientId: string, patch: Partial<SeriesShiftTemplateDraft>) {
    setShiftsDirty(true);
    setShifts((prev) => prev.map((row) => (row.clientId === clientId ? { ...row, ...patch } : row)));
  }

  function removeShift(clientId: string) {
    setShiftsDirty(true);
    setShifts((prev) => prev.filter((row) => row.clientId !== clientId));
  }

  function addShiftForBlock(blockTemplateIndex: number) {
    const block = blockOptions.find((option) => option.index === blockTemplateIndex);
    if (!block) return;
    const defaultRate = form.getValues("defaultHourlyRate").trim()
      ? Number(form.getValues("defaultHourlyRate"))
      : budgetCrewHourlyRateUsd;
    setShifts((prev) => [
      ...prev,
      createShiftDraftForBlock({
        blockTemplateIndex,
        block,
        defaultHourlyRateUsd: defaultRate,
        clientId: `local-shift-${(localShiftCounterRef.current += 1)}`,
      }),
    ]);
    setShiftsDirty(true);
  }

  async function applyTemplate(values: SeriesShiftEditorFormValues) {
    if (shifts.length === 0) {
      throw new Error("Add at least one empty crew shift to the series template.");
    }
    if (blockOptions.length === 0) {
      throw new Error("Save schedule block templates before applying crew shift templates.");
    }
    const templates = shiftDraftsToTemplates(shifts, blockTemplates);
    if (templates.length === 0) {
      throw new Error("Add at least one crew shift to the series template.");
    }
    const parsedFromIndex = Number(values.fromOccurrenceIndex);
    if (!Number.isFinite(parsedFromIndex) || parsedFromIndex < 0) {
      throw new Error("Enter a valid occurrence index.");
    }
    const result = await regenerateShifts({
      id: seriesId,
      scope: values.applyScope,
      fromOccurrenceIndex: parsedFromIndex,
      shiftTemplates: templates,
      budgetCrewHourlyRateUsd: values.defaultHourlyRate.trim()
        ? Number(values.defaultHourlyRate)
        : undefined,
    });
    onMessage(
      `Saved shift template and applied empty shifts on ${result.updatedCount} occurrence${result.updatedCount === 1 ? "" : "s"}. Assigned crew were kept.`,
    );
    setShiftsDirty(false);
    form.reset(values);
  }

  const onSaveTemplate = form.submitMutation(applyTemplate);

  async function handleImportFromOccurrence() {
    const importOccurrenceId = form.getValues("importOccurrenceId");
    if (!importOccurrenceId) {
      onMessage("Select an occurrence to import from.");
      return;
    }
    await form.runMutation(async () => {
      const result = await importShifts({
        id: seriesId,
        eventId: importOccurrenceId as Id<"events">,
      });
      onMessage(
        `Imported ${result.templateCount} empty shift${result.templateCount === 1 ? "" : "s"} into the series template.`,
      );
    });
  }

  function handleDiscard() {
    setShifts(initialShifts);
    setShiftsDirty(false);
    form.reset({
      applyScope: "all",
      fromOccurrenceIndex: "0",
      importOccurrenceId: "",
      defaultHourlyRate: initialDefaultRate,
    });
  }

  if (hideSchedule) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Services Only events do not use crew shift templates.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form {...form}>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Default hourly rate (USD)</Label>
                <Input
                  value={form.watch("defaultHourlyRate")}
                  onChange={(event) =>
                    form.setValue("defaultHourlyRate", event.target.value, { shouldDirty: true })
                  }
                  placeholder="e.g. 35"
                />
                <p className="text-xs text-muted-foreground">
                  Used for empty shifts without a per-shift rate when estimating crew cost.
                </p>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>
                  Estimated template crew cost
                  {billableOccurrenceCount > 1
                    ? ` (${billableOccurrenceCount} occurrences)`
                    : " (per occurrence)"}
                </Label>
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-lg font-semibold">
                  {formatUsd(estimatedSeriesTotal)}
                  {billableOccurrenceCount > 1 ? (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      ({formatUsd(estimatedPerOccurrence)} × {billableOccurrenceCount})
                    </span>
                  ) : null}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Import empty shifts from occurrence</Label>
                <SearchableSelect
                  value={form.watch("importOccurrenceId")}
                  onChange={(value) =>
                    form.setValue("importOccurrenceId", value, { shouldDirty: true })
                  }
                  options={occurrenceOptions}
                  placeholder="Select occurrence..."
                  emptyLabel="Select occurrence"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={form.saveStatus === "saving"}
                  onClick={() => void handleImportFromOccurrence()}
                >
                  Import into template
                </Button>
              </div>
            </div>
          </Form>

          {blockOptions.length === 0 ? (
            <p className="text-sm text-amber-700">
              Add schedule block templates first — crew shifts link to those blocks.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-sm font-medium">Schedule blocks (from series template)</p>
                <p className="text-xs text-muted-foreground">
                  Edit blocks in the series schedule template. Crew shifts below attach to each block.
                </p>
              </div>
              <EventTimelineScheduler
                dayCount={dayCount}
                blocks={timelineBlocks}
                onChange={() => {}}
                onQuickAdd={() => {}}
                quickAddLabel=""
                readOnly
              />

              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Empty shifts by block</p>
                {blockOptions.map((block) => {
                  const blockShifts = shifts.filter((shift) => shift.blockTemplateIndex === block.index);
                  return (
                    <div key={block.index} className="space-y-2 rounded-md border p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {block.label} ({block.blockType})
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addShiftForBlock(block.index)}
                        >
                          Add empty shift
                        </Button>
                      </div>
                      {blockShifts.length ? (
                        blockShifts.map((shift) => (
                          <div key={shift.clientId} className="grid gap-2 md:grid-cols-6">
                            <Input
                              placeholder="Role"
                              value={shift.role}
                              onChange={(event) => updateShift(shift.clientId, { role: event.target.value })}
                            />
                            <Input
                              readOnly
                              value={formatDurationHours(shift.durationMs)}
                              aria-label="Shift duration"
                            />
                            <Input
                              readOnly
                              value={formatOffsetHours(shift.offsetMs)}
                              aria-label="Shift offset"
                            />
                            <Input
                              value={shift.estimatedHourlyRateUsd}
                              onChange={(event) =>
                                updateShift(shift.clientId, { estimatedHourlyRateUsd: event.target.value })
                              }
                              placeholder={form.watch("defaultHourlyRate") || "Rate"}
                            />
                            <Input
                              value={shift.notes}
                              onChange={(event) => updateShift(shift.clientId, { notes: event.target.value })}
                              placeholder="Notes"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => removeShift(shift.clientId)}
                            >
                              Remove
                            </Button>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">No shift templates for this block yet.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <Form {...form}>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Apply to</Label>
                <SearchableSelect
                  value={form.watch("applyScope")}
                  onChange={(value) =>
                    form.setValue("applyScope", value as SeriesEditScope, { shouldDirty: true })
                  }
                  options={(Object.keys(SERIES_EDIT_SCOPE_LABELS) as SeriesEditScope[]).map((scope) => ({
                    value: scope,
                    label: SERIES_EDIT_SCOPE_LABELS[scope],
                  }))}
                  placeholder="Select scope..."
                  emptyLabel="Select scope"
                />
              </div>
              <div className="space-y-1">
                <Label>From occurrence index (0-based)</Label>
                <SearchableSelect
                  value={form.watch("fromOccurrenceIndex")}
                  onChange={(value) =>
                    form.setValue("fromOccurrenceIndex", value, { shouldDirty: true })
                  }
                  options={occurrences.map((row) => ({
                    value: String(row.occurrenceIndex ?? 0),
                    label: `#${(row.occurrenceIndex ?? 0) + 1}`,
                  }))}
                  placeholder="Select index..."
                  emptyLabel="Select index"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  disabled={form.saveStatus === "saving"}
                  onClick={() => void form.handleSubmit(onSaveTemplate)()}
                >
                  Save template &amp; apply shifts
                </Button>
              </div>
            </div>
          </Form>
          <p className="text-xs text-muted-foreground">
            Applying syncs schedule blocks on each selected occurrence, then replaces unassigned crew
            shifts from this template.
          </p>
          {form.saveError ? (
            <p className="text-sm text-destructive">{form.saveError}</p>
          ) : null}
        </CardContent>
      </Card>

      <FormSaveBar
        tier="C"
        saveStatus={form.saveStatus}
        saveError={form.saveError}
        isDirty={isDirty}
        saveLabel="Save template & apply shifts"
        onSave={() => void form.handleSubmit(onSaveTemplate)()}
        onDiscard={handleDiscard}
        onRetry={() => void form.handleSubmit(onSaveTemplate)()}
      />
    </>
  );
}
