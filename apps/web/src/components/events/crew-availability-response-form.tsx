"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScheduleBlockWindowFields } from "@/components/events/schedule-block-window-fields";
import { getConvexErrorMessage } from "@/lib/convex-error";
import {
  type CrewAvailabilityResponseStatus,
  formatCrewResponseLabel,
  localDateTimeInputToMs,
  toLocalDateTimeInput,
} from "@/lib/crew-availability";

type ScheduleBlock = {
  _id: Id<"eventScheduleBlocks">;
  blockType: string;
  label: string;
  startsAt: number;
  endsAt: number;
};

type PartialWindowDraft = {
  scheduleBlockId?: Id<"eventScheduleBlocks">;
  startsAtInput: string;
  endsAtInput: string;
  notes: string;
};

type ExistingResponse = {
  responseStatus: CrewAvailabilityResponseStatus;
  partialWindows?: Array<{
    scheduleBlockId?: Id<"eventScheduleBlocks">;
    startsAt: number;
    endsAt: number;
    notes?: string;
  }>;
  notes?: string;
} | null;

const RESPONSE_OPTIONS: Array<{ value: CrewAvailabilityResponseStatus; label: string }> = [
  { value: "yes", label: "Yes — available for entire event" },
  { value: "partial", label: "Partial — specific time block(s)" },
  { value: "only_if_necessary", label: "Only if necessary" },
  { value: "no", label: "No — not available" },
];

function buildInitialPartialWindows(
  existing: ExistingResponse,
  scheduleBlocks: ScheduleBlock[],
): PartialWindowDraft[] {
  if (existing?.partialWindows?.length) {
    return existing.partialWindows.map((window) => ({
      scheduleBlockId: window.scheduleBlockId,
      startsAtInput: toLocalDateTimeInput(new Date(window.startsAt)),
      endsAtInput: toLocalDateTimeInput(new Date(window.endsAt)),
      notes: window.notes ?? "",
    }));
  }
  const firstBlock = scheduleBlocks[0];
  if (!firstBlock) {
    return [{ startsAtInput: "", endsAtInput: "", notes: "" }];
  }
  return [
    {
      scheduleBlockId: firstBlock._id,
      startsAtInput: toLocalDateTimeInput(new Date(firstBlock.startsAt)),
      endsAtInput: toLocalDateTimeInput(new Date(firstBlock.endsAt)),
      notes: "",
    },
  ];
}

export function CrewAvailabilityResponseForm({
  eventId,
  scheduleBlocks,
  existingResponse,
  onSaved,
}: {
  eventId: Id<"events">;
  scheduleBlocks: ScheduleBlock[];
  existingResponse: ExistingResponse;
  onSaved?: (message: string) => void;
}) {
  const submitResponse = useMutation(api.eventCrewAvailability.submitResponse);
  const [responseStatus, setResponseStatus] = useState<CrewAvailabilityResponseStatus>(
    existingResponse?.responseStatus ?? "yes",
  );
  const [notes, setNotes] = useState(existingResponse?.notes ?? "");
  const [partialWindows, setPartialWindows] = useState<PartialWindowDraft[]>(() =>
    buildInitialPartialWindows(existingResponse, scheduleBlocks),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSubmit() {
    setSaving(true);
    setSaveError(null);
    try {
      const partialPayload =
        responseStatus === "partial"
          ? partialWindows.map((window) => {
              const startsAt = localDateTimeInputToMs(window.startsAtInput);
              const endsAt = localDateTimeInputToMs(window.endsAtInput);
              if (startsAt === null || endsAt === null) {
                throw new Error("Partial availability requires valid start and end times.");
              }
              return {
                scheduleBlockId: window.scheduleBlockId,
                startsAt,
                endsAt,
                notes: window.notes.trim() || undefined,
              };
            })
          : undefined;

      await submitResponse({
        eventId,
        responseStatus,
        partialWindows: partialPayload,
        notes: notes.trim() || undefined,
      });
      onSaved?.(`Saved ${formatCrewResponseLabel(responseStatus)} response.`);
    } catch (submitError) {
      setSaveError(getConvexErrorMessage(submitError, "Failed to save response."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">Your availability</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {RESPONSE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm ${
              responseStatus === option.value ? "border-primary bg-primary/5" : ""
            }`}
          >
            <input
              type="radio"
              name={`response-${eventId}`}
              checked={responseStatus === option.value}
              onChange={() => setResponseStatus(option.value)}
              className="mt-1"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>

      {responseStatus === "partial" ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Add one or more time windows you can work. You can tie each window to a schedule block or set custom times.
          </p>
          {partialWindows.map((window, index) => (
            <div key={index} className="space-y-2 rounded-md border p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">Window {index + 1}</p>
                {partialWindows.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPartialWindows((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <ScheduleBlockWindowFields
                scheduleBlocks={scheduleBlocks}
                scheduleBlockId={window.scheduleBlockId}
                startsAtInput={window.startsAtInput}
                endsAtInput={window.endsAtInput}
                notes={window.notes}
                onNotesChange={(value) =>
                  setPartialWindows((prev) =>
                    prev.map((entry, i) => (i === index ? { ...entry, notes: value } : entry)),
                  )
                }
                onChange={(next) =>
                  setPartialWindows((prev) =>
                    prev.map((entry, i) =>
                      i === index
                        ? {
                            ...entry,
                            scheduleBlockId: next.scheduleBlockId
                              ? (next.scheduleBlockId as Id<"eventScheduleBlocks">)
                              : undefined,
                            startsAtInput: next.startsAtInput,
                            endsAtInput: next.endsAtInput,
                          }
                        : entry,
                    ),
                  )
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setPartialWindows((prev) => [...prev, { startsAtInput: "", endsAtInput: "", notes: "" }])
            }
          >
            Add another window
          </Button>
        </div>
      ) : null}

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Notes (optional)</p>
        <Input
          placeholder="Anything the scheduler should know..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <Button type="button" disabled={saving} onClick={() => void handleSubmit()}>
        {saving ? "Saving..." : existingResponse ? "Update response" : "Submit response"}
      </Button>

      {saveError ? (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
