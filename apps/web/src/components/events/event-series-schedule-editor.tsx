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
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { RunOfShowEditor } from "@/components/events/workspace/run-of-show/run-of-show-editor";
import {
  buildSeriesQuickAddBlocks,
  templatesToTimelineDrafts,
  timelineDraftsToTemplates,
  type SeriesBlockTemplate,
} from "@/lib/event-series-schedule";
import type { RunOfShowAct } from "@/lib/run-of-show";
import { GroupApplyScopeFields } from "@/components/events/group-apply-scope-fields";
import {
  formatOccurrencePreview,
  groupDayLabel,
  groupDayNoun,
  type EventGroupKind,
} from "@/lib/event-series";
import { notify } from "@/lib/notify";
import {
  seriesScheduleEditorSchema,
  type SeriesScheduleEditorFormValues,
} from "@/lib/validations/event";

type SeriesScheduleEditorProps = {
  seriesId: Id<"eventSeries">;
  kind?: EventGroupKind;
  anchorStartAt: number;
  anchorEndAt: number;
  eventType?: string;
  rentalFulfillmentMode?: "delivery" | "will_call" | "pickup";
  blockTemplates?: SeriesBlockTemplate[];
  occurrences: Array<{ _id: Id<"events">; occurrenceIndex?: number; startAt: number }>;
  onMessage: (message: string) => void;
  /** Reports unsaved edits (the group page marks the tab). */
  onDirtyChange?: (dirty: boolean) => void;
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

const NO_ACTS: RunOfShowAct[] = [];
const noActName = () => undefined;
const noSwaps = () => undefined;

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
  onDirtyChange,
  seriesId,
  kind = "recurring",
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
  const [blocksOverride, setBlocksOverride] = useState<TimelineBlockDraft[] | null>(null);
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
  const hideSchedule = resolvedEventType === "Services Only";

  const initialBlocks = useMemo(
    () => blocksFromTemplates(blockTemplates, anchorStartAt),
    [blockTemplates, anchorStartAt],
  );

  // Reset local block edits whenever the template identity changes (adjusting
  // state in response to a prop change, computed during render rather than in
  // an effect). Keeps form.reset — a library call, not React state — in the
  // effect below.
  const [syncedInitialBlocks, setSyncedInitialBlocks] = useState(initialBlocks);
  if (initialBlocks !== syncedInitialBlocks) {
    setSyncedInitialBlocks(initialBlocks);
    setBlocksOverride(null);
    setBlocksDirty(false);
  }
  const blocks = blocksOverride ?? initialBlocks;

  useEffect(() => {
    if (form.formState.isDirty) return;
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
        label: `${groupDayLabel(kind, row.occurrenceIndex)} · ${formatOccurrencePreview(row.startAt)}`,
      })),
    [kind, occurrences],
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

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  async function applyTemplate(values: SeriesScheduleEditorFormValues) {
    if (blocks.length === 0) {
      throw new Error("Add at least one schedule block to the series template.");
    }
    const parsedFromIndex = Number(values.fromOccurrenceIndex);
    if (!Number.isFinite(parsedFromIndex) || parsedFromIndex < 0) {
      throw new Error(`Pick a ${groupDayNoun(kind)} to apply from.`);
    }
    const templates = timelineDraftsToTemplates(blocks, anchorStartAt);
    const result = await regenerateBlocks({
      id: seriesId,
      scope: values.applyScope,
      fromOccurrenceIndex: parsedFromIndex,
      blockTemplates: templates,
    });
    onMessage(
      `Saved template and updated the Run of Show on ${result.updatedCount} ${groupDayNoun(kind, result.updatedCount !== 1)}. Crew shifts were not changed.`,
    );
    setBlocksDirty(false);
    form.reset(values);
  }

  const onSaveTemplate = form.submitMutation(applyTemplate);

  async function handleImportFromOccurrence() {
    const importOccurrenceId = form.getValues("importOccurrenceId");
    if (!importOccurrenceId) {
      notify.error(`Select a ${groupDayNoun(kind)} to import from.`);
      return;
    }
    await form.runMutation(async () => {
      const result = await importSchedule({
        id: seriesId,
        eventId: importOccurrenceId as Id<"events">,
      });
      onMessage(
        `Imported ${result.templateCount} block${result.templateCount === 1 ? "" : "s"} into the ${kind === "multi_day" ? "booking" : "series"} template.`,
      );
    });
  }

  function handleDiscard() {
    setBlocksOverride(null);
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
          <CardTitle>{kind === "multi_day" ? "Booking Run of Show template" : "Series schedule template"}</CardTitle>
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
          <CardTitle>{kind === "multi_day" ? "Booking Run of Show template" : "Series schedule template"}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Edit once, then apply to many {groupDayNoun(kind, true)}. Acts&apos; soundchecks and sets stay
            on each {groupDayNoun(kind)}.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form {...form}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Import sections from {groupDayNoun(kind)}</Label>
                <SearchableSelect
                  value={form.watch("importOccurrenceId")}
                  onChange={(value) =>
                    form.setValue("importOccurrenceId", value, { shouldDirty: true })
                  }
                  options={occurrenceOptions}
                  placeholder={`Select ${groupDayNoun(kind)}...`}
                  emptyLabel={`Select ${groupDayNoun(kind)}`}
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

          {/* A series has no lineup: the template holds sections, doors, and
              changeovers; each occurrence adds its own acts' soundchecks and sets. */}
          <RunOfShowEditor
            blocks={blocks}
            onChange={(next) => {
              setBlocksOverride(withStableBlockRefs(next));
              setBlocksDirty(true);
            }}
            readOnly={false}
            actsEditable={false}
            eventStartAt={anchorStartAt}
            acts={NO_ACTS}
            actName={noActName}
            swaps={noSwaps}
            quickAdd={{
              label: quickAddLabel,
              disabled: false,
              run: () => {
                setBlocksOverride(
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
              },
            }}
          />

          <Form {...form}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <GroupApplyScopeFields
                  idPrefix="series-schedule"
                  kind={kind}
                  days={occurrences}
                  scope={form.watch("applyScope")}
                  dayIndex={form.watch("fromOccurrenceIndex")}
                  onScopeChange={(value) => form.setValue("applyScope", value, { shouldDirty: true })}
                  onDayIndexChange={(value) =>
                    form.setValue("fromOccurrenceIndex", value, { shouldDirty: true })
                  }
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
            Applying replaces the sections on the selected {groupDayNoun(kind, true)}. Detached and
            cancelled {groupDayNoun(kind, true)} are skipped.
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
