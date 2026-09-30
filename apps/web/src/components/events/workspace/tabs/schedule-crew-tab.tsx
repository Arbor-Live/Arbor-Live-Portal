"use client";

import { ListChecksIcon, RepeatIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CrewStaffingBoard } from "@/components/events/crew-staffing/crew-staffing-board";
import { RunOfShowEditor } from "@/components/events/workspace/run-of-show/run-of-show-editor";
import { useRunOfShowData } from "@/components/events/workspace/run-of-show/use-run-of-show-data";
import { isSectionBlockType } from "@/lib/schedule-block-types";
import { countStaffing } from "@/lib/crew-shift-kinds";
import {
  buildQuickAddScheduleBlocks,
  sortScheduleBlocksByTime,
  eventTypeHasCrewAssignment,
  reconcileShiftsForReplacedBlocks,
  shiftBelongsToBlock,
  syncShiftsToBlockTimes,
} from "@/lib/event-schedule-draft";
import { localDateTimeInputToMs } from "@/lib/crew-availability";
import { useEventWorkspace } from "@/components/events/workspace/event-workspace-provider";

export function ScheduleCrewTab() {
  const {
    eventId,
    draft,
    readOnly,
    seriesMeta: groupMeta,
    blocks,
    setBlocks,
    shifts,
    setShifts,
    withStableBlockRefs,
    getBlockRef,
    removeUnlinkedShifts,
    userSelectOptions,
  } = useEventWorkspace();
  // Series costs, crew notes and the series pull list are recurring-only; a
  // multi-day booking's days bill and staff as ordinary linked days.
  const seriesMeta = groupMeta?.kind === "multi_day" ? null : groupMeta;
  const runOfShow = useRunOfShowData(eventId);
  const hasCrew = eventTypeHasCrewAssignment(draft.eventType);

  const quickAddDisabled = !draft.startAt || !draft.endAt;
  const quickAddLabel =
    draft.eventType === "Dry Hire"
      ? draft.rentalFulfillmentMode === "will_call"
        ? "Quick Add: Check-out + Return"
        : "Quick Add: Drop-off + Pickup"
      : draft.eventType === "Rental with Crew"
        ? "Quick Add: Setup + Strike"
        : "Quick Add: Setup + Show + Strike";

  // Crew are scheduled per section; soundchecks, sets, and other moments sit inside one.
  const sectionBlocks = blocks.filter((block) => isSectionBlockType(block.blockType));

  return (
    <fieldset disabled={readOnly} className="space-y-4">
      {seriesMeta ? (
        <p className="flex items-center gap-2 border border-dashed px-3 py-2 text-sm text-muted-foreground">
          <RepeatIcon className="size-4 shrink-0" />
          Crew is scheduled separately for each occurrence in this series.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecksIcon className="size-4 text-muted-foreground" />
            Run of Show
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RunOfShowEditor
            blocks={blocks}
            onChange={(next) => {
              const nextBlocks = withStableBlockRefs(next);
              setBlocks(nextBlocks);
              setShifts((prev) => syncShiftsToBlockTimes(prev, nextBlocks));
            }}
            readOnly={readOnly}
            eventStartAt={localDateTimeInputToMs(draft.startAt)}
            acts={runOfShow.acts}
            actName={runOfShow.actName}
            swaps={runOfShow.swaps}
            crewFor={(block) => {
              const staffing = countStaffing(shifts.filter((shift) => shiftBelongsToBlock(shift, block)));
              return { total: staffing.slots, filled: staffing.filled };
            }}
            quickAdd={{
              label: quickAddLabel,
              disabled: quickAddDisabled,
              run: () => {
                if (quickAddDisabled) return;
                const quickAddBlocks = buildQuickAddScheduleBlocks({
                  eventType: draft.eventType,
                  startAt: draft.startAt,
                  endAt: draft.endAt,
                  rentalFulfillmentMode: draft.rentalFulfillmentMode,
                  withStableRefs: withStableBlockRefs,
                });
                // Quick Add rebuilds sections only; the run of show's moments stay.
                const nextBlocks = sortScheduleBlocksByTime([
                  ...quickAddBlocks,
                  ...blocks.filter((block) => !isSectionBlockType(block.blockType)),
                ]);
                setBlocks(nextBlocks);
                setShifts((prev) => reconcileShiftsForReplacedBlocks(blocks, nextBlocks, prev));
              },
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersThreeIcon className="size-4 text-muted-foreground" />
            Crew
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CrewStaffingBoard
            eventId={eventId}
            sectionBlocks={sectionBlocks}
            shifts={shifts}
            setShifts={setShifts}
            getBlockRef={getBlockRef}
            userSelectOptions={userSelectOptions}
            askAvailability={hasCrew}
            readOnly={readOnly}
            onDeleteUnlinked={() => void removeUnlinkedShifts()}
          />
        </CardContent>
      </Card>
    </fieldset>
  );
}
