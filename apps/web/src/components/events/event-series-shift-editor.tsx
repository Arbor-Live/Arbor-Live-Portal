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
import { SERIES_EDIT_SCOPE_LABELS, type SeriesEditScope } from "@/lib/event-series";
import type { SeriesBlockTemplate } from "@/lib/event-series-schedule";
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

type EventSeriesShiftEditorProps = {
  seriesId: Id<"eventSeries">;
  blockTemplates?: SeriesBlockTemplate[];
  shiftTemplates?: SeriesShiftTemplate[];
  budgetCrewHourlyRateUsd?: number;
  occurrences: Array<{ _id: Id<"events">; occurrenceIndex?: number; startAt: number }>;
  onMessage: (message: string) => void;
};

export function EventSeriesShiftEditor({
  seriesId,
  blockTemplates,
  shiftTemplates,
  budgetCrewHourlyRateUsd,
  occurrences,
  onMessage,
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

  const blockOptions = useMemo(
    () => sortedBlockTemplateOptions(blockTemplates ?? []),
    [blockTemplates],
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
    form.suppressNextAutoSave();
  }, [initialShifts, initialDefaultRate, form]);

  const occurrenceOptions = useMemo(
    () =>
      occurrences.map((row) => ({
        value: row._id,
        label: `#${(row.occurrenceIndex ?? 0) + 1} · ${new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(row.startAt))}`,
      })),
    [occurrences],
  );

  const estimatedTotal = useMemo(() => totalEstimatedShiftCostUsd(shifts), [shifts]);
  const isDirty = form.formState.isDirty || shiftsDirty;

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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Series crew shift template</CardTitle>
          <p className="text-sm text-muted-foreground">
            Define empty shifts once for cost estimation. Applying replaces unassigned shifts on selected
            occurrences; staffed shifts are kept.
          </p>
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
                <Label>Estimated template crew cost (per occurrence)</Label>
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-lg font-semibold">
                  ${estimatedTotal.toFixed(2)}
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
            <div className="flex flex-wrap gap-2">
              {blockOptions.map((block) => (
                <Button
                  key={block.index}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addShiftForBlock(block.index)}
                >
                  Add shift · {block.label}
                </Button>
              ))}
            </div>
          )}

          {shifts.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="px-2 py-2">Role</th>
                    <th className="px-2 py-2">Block</th>
                    <th className="px-2 py-2">Timing</th>
                    <th className="px-2 py-2">Rate (USD/hr)</th>
                    <th className="px-2 py-2">Notes</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((shift) => {
                    const block = blockOptions.find((option) => option.index === shift.blockTemplateIndex);
                    return (
                      <tr key={shift.clientId} className="border-b last:border-b-0">
                        <td className="px-2 py-2">
                          <Input
                            value={shift.role}
                            onChange={(event) => {
                              setShiftsDirty(true);
                              setShifts((prev) =>
                                prev.map((row) =>
                                  row.clientId === shift.clientId
                                    ? { ...row, role: event.target.value }
                                    : row,
                                ),
                              );
                            }}
                            placeholder="e.g. LD"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <SearchableSelect
                            value={String(shift.blockTemplateIndex)}
                            onChange={(value) => {
                              const blockTemplateIndex = Number(value);
                              const nextBlock = blockOptions.find(
                                (option) => option.index === blockTemplateIndex,
                              );
                              if (!nextBlock) return;
                              setShiftsDirty(true);
                              setShifts((prev) =>
                                prev.map((row) =>
                                  row.clientId === shift.clientId
                                    ? {
                                        ...row,
                                        blockTemplateIndex,
                                        offsetMs: nextBlock.offsetMs,
                                        durationMs: nextBlock.durationMs,
                                      }
                                    : row,
                                ),
                              );
                            }}
                            options={blockOptions.map((option) => ({
                              value: String(option.index),
                              label: `${option.label} (${option.blockType})`,
                            }))}
                            placeholder="Select block..."
                            emptyLabel="Select block"
                          />
                        </td>
                        <td className="px-2 py-2 text-xs text-muted-foreground">
                          {block
                            ? `${formatOffsetHours(shift.offsetMs)} · ${formatDurationHours(shift.durationMs)}`
                            : "—"}
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            value={shift.estimatedHourlyRateUsd}
                            onChange={(event) => {
                              setShiftsDirty(true);
                              setShifts((prev) =>
                                prev.map((row) =>
                                  row.clientId === shift.clientId
                                    ? { ...row, estimatedHourlyRateUsd: event.target.value }
                                    : row,
                                ),
                              );
                            }}
                            placeholder={form.watch("defaultHourlyRate") || "Rate"}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            value={shift.notes}
                            onChange={(event) => {
                              setShiftsDirty(true);
                              setShifts((prev) =>
                                prev.map((row) =>
                                  row.clientId === shift.clientId
                                    ? { ...row, notes: event.target.value }
                                    : row,
                                ),
                              );
                            }}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShiftsDirty(true);
                              setShifts((prev) => prev.filter((row) => row.clientId !== shift.clientId));
                            }}
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No shift templates yet.</p>
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
