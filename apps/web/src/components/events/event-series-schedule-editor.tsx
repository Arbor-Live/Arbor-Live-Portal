"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  EventTimelineScheduler,
  type TimelineBlockDraft,
} from "@/components/events/event-timeline-scheduler";
import {
  SERIES_EDIT_SCOPE_LABELS,
  type SeriesEditScope,
} from "@/lib/event-series";
import {
  buildSeriesQuickAddBlocks,
  seriesDayCount,
  templatesToTimelineDrafts,
  timelineDraftsToTemplates,
  type SeriesBlockTemplate,
} from "@/lib/event-series-schedule";
import { formatOccurrencePreview } from "@/lib/event-series";
import {
  seriesScheduleEditorSchema,
  type SeriesScheduleEditorFormValues,
} from "@/lib/validations/event";

type SeriesScheduleEditorProps = {
  seriesId: Id<"eventSeries">;
  anchorStartAt: number;
  anchorEndAt: number;
  eventType?: string;
  rentalFulfillmentMode?: "delivery" | "will_call" | "pickup";
  blockTemplates?: SeriesBlockTemplate[];
  occurrences: Array<{ _id: Id<"events">; occurrenceIndex?: number; startAt: number }>;
  onMessage: (message: string) => void;
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

function normalizeFulfillment(value: SeriesScheduleEditorProps["rentalFulfillmentMode"]) {
  if (value === "will_call") return "will_call" as const;
  return "delivery" as const;
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

export function EventSeriesScheduleEditor({
  seriesId,
  anchorStartAt,
  anchorEndAt,
  eventType,
  rentalFulfillmentMode,
  blockTemplates,
  occurrences,
  onMessage,
}: SeriesScheduleEditorProps) {
  const regenerateBlocks = useMutation(api.eventSeries.regenerateFutureBlocks);
  const importSchedule = useMutation(api.eventSeries.importScheduleFromOccurrence);
  const localBlockCounterRef = useRef(0);
  const [blocks, setBlocks] = useState<TimelineBlockDraft[]>([]);
  const [blocksDirty, setBlocksDirty] = useState(false);

  const form = useConvexForm<SeriesScheduleEditorFormValues>({
    schema: seriesScheduleEditorSchema,
    defaultValues: {
      applyScope: "all",
      fromOccurrenceIndex: "0",
      importOccurrenceId: "",
    },
    mode: "onChange",
  });

  const resolvedEventType = normalizeEventType(eventType);
  const resolvedFulfillment = normalizeFulfillment(rentalFulfillmentMode);
  const dayCount = seriesDayCount(anchorStartAt, anchorEndAt);
  const hideSchedule = resolvedEventType === "Services Only";

  const initialBlocks = useMemo(
    () => blocksFromTemplates(blockTemplates, anchorStartAt),
    [blockTemplates, anchorStartAt],
  );

  useEffect(() => {
    setBlocks(initialBlocks);
    setBlocksDirty(false);
    form.reset({
      applyScope: "all",
      fromOccurrenceIndex: "0",
      importOccurrenceId: "",
    });
  }, [initialBlocks, form]);

  const occurrenceOptions = useMemo(
    () =>
      occurrences.map((row) => ({
        value: row._id,
        label: `#${(row.occurrenceIndex ?? 0) + 1} · ${formatOccurrencePreview(row.startAt)}`,
      })),
    [occurrences],
  );

  function withStableBlockRefs(nextBlocks: TimelineBlockDraft[]) {
    return nextBlocks.map((block) =>
      block.clientId || block.id
        ? block
        : {
            ...block,
            clientId: `local-block-${(localBlockCounterRef.current += 1)}`,
          },
    );
  }

  const quickAddLabel =
    resolvedEventType === "Dry Hire"
      ? resolvedFulfillment === "will_call"
        ? "Quick Add: Check-out + Return"
        : "Quick Add: Drop-off + Pickup"
      : resolvedEventType === "Rental with Crew"
        ? "Quick Add: Setup + Strike"
        : "Quick Add: Setup + Show + Strike";

  const isDirty = form.formState.isDirty || blocksDirty;

  async function applyTemplate(values: SeriesScheduleEditorFormValues) {
    if (blocks.length === 0) {
      throw new Error("Add at least one schedule block to the series template.");
    }
    const parsedFromIndex = Number(values.fromOccurrenceIndex);
    if (!Number.isFinite(parsedFromIndex) || parsedFromIndex < 0) {
      throw new Error("Enter a valid occurrence index.");
    }
    const templates = timelineDraftsToTemplates(blocks, anchorStartAt);
    const result = await regenerateBlocks({
      id: seriesId,
      scope: values.applyScope,
      fromOccurrenceIndex: parsedFromIndex,
      blockTemplates: templates,
    });
    onMessage(
      `Saved template and updated schedule blocks on ${result.updatedCount} occurrence${result.updatedCount === 1 ? "" : "s"}. Crew shifts were not changed.`,
    );
    setBlocksDirty(false);
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
      const result = await importSchedule({
        id: seriesId,
        eventId: importOccurrenceId as Id<"events">,
      });
      onMessage(
        `Imported ${result.templateCount} block${result.templateCount === 1 ? "" : "s"} into the series template.`,
      );
    });
  }

  function handleDiscard() {
    setBlocks(initialBlocks);
    setBlocksDirty(false);
    form.reset({
      applyScope: "all",
      fromOccurrenceIndex: "0",
      importOccurrenceId: "",
    });
  }

  if (hideSchedule) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Series schedule template</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Services Only events do not use schedule blocks.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Series schedule template</CardTitle>
          <p className="text-sm text-muted-foreground">
            Edit once, then apply to many occurrences. Per-event crew assignment stays separate on each event.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form {...form}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Import blocks from occurrence</Label>
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

          <EventTimelineScheduler
            dayCount={dayCount}
            blocks={blocks}
            onChange={(next) => {
              setBlocks(withStableBlockRefs(next));
              setBlocksDirty(true);
            }}
            quickAddLabel={quickAddLabel}
            quickAddDisabled={false}
            onQuickAdd={() => {
              setBlocks(
                withStableBlockRefs(
                  buildSeriesQuickAddBlocks({
                    eventType: resolvedEventType,
                    rentalFulfillmentMode: resolvedFulfillment,
                    anchorStartAt,
                    anchorEndAt,
                  }),
                ),
              );
              setBlocksDirty(true);
            }}
          />

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
                  Save template &amp; apply blocks
                </Button>
              </div>
            </div>
          </Form>
          <p className="text-xs text-muted-foreground">
            Applying replaces schedule blocks on selected occurrences. Existing crew shifts are kept but may reference removed blocks.
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
        saveLabel="Save template & apply blocks"
        onSave={() => void form.handleSubmit(onSaveTemplate)()}
        onDiscard={handleDiscard}
        onRetry={() => void form.handleSubmit(onSaveTemplate)()}
      />
    </>
  );
}
