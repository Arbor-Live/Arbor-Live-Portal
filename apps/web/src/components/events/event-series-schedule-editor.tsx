"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/inventory/searchable-select";
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
  const [applyScope, setApplyScope] = useState<SeriesEditScope>("all");
  const [fromOccurrenceIndex, setFromOccurrenceIndex] = useState("0");
  const [importOccurrenceId, setImportOccurrenceId] = useState("");
  const [saving, setSaving] = useState(false);

  const resolvedEventType = normalizeEventType(eventType);
  const resolvedFulfillment = normalizeFulfillment(rentalFulfillmentMode);
  const dayCount = seriesDayCount(anchorStartAt, anchorEndAt);
  const hideSchedule = resolvedEventType === "Services Only";

  useEffect(() => {
    setBlocks(
      templatesToTimelineDrafts(blockTemplates ?? [], anchorStartAt).map((block, index) => ({
        ...block,
        clientId: block.clientId ?? `template-${index}`,
      })),
    );
  }, [blockTemplates, anchorStartAt]);

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

  async function handleApplyTemplate() {
    if (blocks.length === 0) {
      onMessage("Add at least one schedule block to the series template.");
      return;
    }
    const parsedFromIndex = Number(fromOccurrenceIndex);
    if (!Number.isFinite(parsedFromIndex) || parsedFromIndex < 0) {
      onMessage("Enter a valid occurrence index.");
      return;
    }
    setSaving(true);
    try {
      const templates = timelineDraftsToTemplates(blocks, anchorStartAt);
      const result = await regenerateBlocks({
        id: seriesId,
        scope: applyScope,
        fromOccurrenceIndex: parsedFromIndex,
        blockTemplates: templates,
      });
      onMessage(
        `Saved template and updated schedule blocks on ${result.updatedCount} occurrence${result.updatedCount === 1 ? "" : "s"}. Crew shifts were not changed.`,
      );
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Failed to apply schedule template.");
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
      const result = await importSchedule({
        id: seriesId,
        eventId: importOccurrenceId as Id<"events">,
      });
      onMessage(`Imported ${result.templateCount} block${result.templateCount === 1 ? "" : "s"} into the series template.`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Failed to import schedule.");
    } finally {
      setSaving(false);
    }
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
    <Card>
      <CardHeader>
        <CardTitle>Series schedule template</CardTitle>
        <p className="text-sm text-muted-foreground">
          Edit once, then apply to many occurrences. Per-event crew assignment stays separate on each event.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Import blocks from occurrence</Label>
            <SearchableSelect
              value={importOccurrenceId}
              onChange={setImportOccurrenceId}
              options={occurrenceOptions}
              placeholder="Select occurrence..."
              emptyLabel="Select occurrence"
            />
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" disabled={saving} onClick={() => void handleImportFromOccurrence()}>
              Import into template
            </Button>
          </div>
        </div>

        <EventTimelineScheduler
          dayCount={dayCount}
          blocks={blocks}
          onChange={(next) => setBlocks(withStableBlockRefs(next))}
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
          }}
        />

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
              Save template &amp; apply blocks
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Applying replaces schedule blocks on selected occurrences. Existing crew shifts are kept but may reference removed blocks.
        </p>
      </CardContent>
    </Card>
  );
}
