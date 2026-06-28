"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/inventory/searchable-select";
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
  const [defaultHourlyRate, setDefaultHourlyRate] = useState("");
  const [applyScope, setApplyScope] = useState<SeriesEditScope>("all");
  const [fromOccurrenceIndex, setFromOccurrenceIndex] = useState("0");
  const [importOccurrenceId, setImportOccurrenceId] = useState("");
  const [saving, setSaving] = useState(false);

  const blockOptions = useMemo(
    () => sortedBlockTemplateOptions(blockTemplates ?? []),
    [blockTemplates],
  );

  useEffect(() => {
    setShifts(shiftTemplatesToDrafts(shiftTemplates ?? [], budgetCrewHourlyRateUsd));
    setDefaultHourlyRate(
      budgetCrewHourlyRateUsd !== undefined ? String(budgetCrewHourlyRateUsd) : "",
    );
  }, [shiftTemplates, budgetCrewHourlyRateUsd]);

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

  function addShiftForBlock(blockTemplateIndex: number) {
    const block = blockOptions.find((option) => option.index === blockTemplateIndex);
    if (!block) return;
    const defaultRate = defaultHourlyRate.trim() ? Number(defaultHourlyRate) : budgetCrewHourlyRateUsd;
    setShifts((prev) => [
      ...prev,
      createShiftDraftForBlock({
        blockTemplateIndex,
        block,
        defaultHourlyRateUsd: defaultRate,
        clientId: `local-shift-${(localShiftCounterRef.current += 1)}`,
      }),
    ]);
  }

  async function handleApplyTemplate() {
    if (shifts.length === 0) {
      onMessage("Add at least one empty crew shift to the series template.");
      return;
    }
    if (blockOptions.length === 0) {
      onMessage("Save schedule block templates before applying crew shift templates.");
      return;
    }
    const parsedFromIndex = Number(fromOccurrenceIndex);
    if (!Number.isFinite(parsedFromIndex) || parsedFromIndex < 0) {
      onMessage("Enter a valid occurrence index.");
      return;
    }
    setSaving(true);
    try {
      const templates = shiftDraftsToTemplates(shifts);
      const result = await regenerateShifts({
        id: seriesId,
        scope: applyScope,
        fromOccurrenceIndex: parsedFromIndex,
        shiftTemplates: templates,
        budgetCrewHourlyRateUsd: defaultHourlyRate.trim() ? Number(defaultHourlyRate) : undefined,
      });
      onMessage(
        `Saved shift template and applied empty shifts on ${result.updatedCount} occurrence${result.updatedCount === 1 ? "" : "s"}. Assigned crew were kept.`,
      );
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Failed to apply crew shift template.");
    } finally {
      setSaving(false);
    }
  }

  async function handleImportFromOccurrence() {
    if (!importOccurrenceId) {
      onMessage("Select an occurrence to import from.");
      return;
    }
    setSaving(true);
    try {
      const result = await importShifts({
        id: seriesId,
        eventId: importOccurrenceId as Id<"events">,
      });
      onMessage(
        `Imported ${result.templateCount} empty shift${result.templateCount === 1 ? "" : "s"} into the series template.`,
      );
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Failed to import crew shifts.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Series crew shift template</CardTitle>
        <p className="text-sm text-muted-foreground">
          Define empty shifts once for cost estimation. Applying replaces unassigned shifts on selected
          occurrences; staffed shifts are kept.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Default hourly rate (USD)</Label>
            <Input
              value={defaultHourlyRate}
              onChange={(event) => setDefaultHourlyRate(event.target.value)}
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

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Import empty shifts from occurrence</Label>
            <SearchableSelect
              value={importOccurrenceId}
              onChange={setImportOccurrenceId}
              options={occurrenceOptions}
              placeholder="Select occurrence..."
              emptyLabel="Select occurrence"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => void handleImportFromOccurrence()}
            >
              Import into template
            </Button>
          </div>
        </div>

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
                          onChange={(event) =>
                            setShifts((prev) =>
                              prev.map((row) =>
                                row.clientId === shift.clientId
                                  ? { ...row, role: event.target.value }
                                  : row,
                              ),
                            )
                          }
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
                          onChange={(event) =>
                            setShifts((prev) =>
                              prev.map((row) =>
                                row.clientId === shift.clientId
                                  ? { ...row, estimatedHourlyRateUsd: event.target.value }
                                  : row,
                              ),
                            )
                          }
                          placeholder={defaultHourlyRate || "Rate"}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          value={shift.notes}
                          onChange={(event) =>
                            setShifts((prev) =>
                              prev.map((row) =>
                                row.clientId === shift.clientId
                                  ? { ...row, notes: event.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setShifts((prev) => prev.filter((row) => row.clientId !== shift.clientId))
                          }
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

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Apply to</Label>
            <SearchableSelect
              value={applyScope}
              onChange={(value) => setApplyScope(value as SeriesEditScope)}
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
              value={fromOccurrenceIndex}
              onChange={setFromOccurrenceIndex}
              options={occurrences.map((row) => ({
                value: String(row.occurrenceIndex ?? 0),
                label: `#${(row.occurrenceIndex ?? 0) + 1}`,
              }))}
              placeholder="Select index..."
              emptyLabel="Select index"
            />
          </div>
          <div className="flex items-end">
            <Button type="button" disabled={saving} onClick={() => void handleApplyTemplate()}>
              Save template &amp; apply shifts
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
