"use client";

import { useMemo, useState } from "react";
import {
  CaretDownIcon,
  LightningIcon,
  MagicWandIcon,
  PlusIcon,
  TrashIcon,
  UsersThreeIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { DateTimeRangePicker } from "@/components/ui/date-time-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { localDateTimeInputToMs, toLocalDateTimeInput } from "@/lib/crew-availability";
import { formatDate, formatTime, pacificDayIndexFromAnchor } from "@/lib/format";
import {
  actKeyOf,
  buildRunOfShow,
  changeoverNeighbors,
  nestRunOfShow,
  runOfShowIssues,
  suggestedChangeoverMinutes,
  type BuildRunOfShowInput,
  type RunOfShowAct,
  type SwapLookup,
  type TimedBlock,
} from "@/lib/run-of-show";
import {
  SCHEDULE_BLOCK_TYPE_LABELS,
  SECTION_BLOCK_TYPES,
  type ScheduleBlockType,
} from "@/lib/schedule-block-types";
import { cn } from "@/lib/utils";
import { BuildRunOfShowDialog } from "@/components/events/workspace/run-of-show/build-run-of-show-dialog";
import {
  durationLabel,
  MOMENT_ICONS,
  RAIL_STYLES,
  TypeChip,
} from "@/components/events/workspace/run-of-show/run-of-show-styles";

const MINUTE = 60_000;
let clientIdCounter = 0;
function newClientId() {
  clientIdCounter += 1;
  return `ros-${Date.now().toString(36)}-${clientIdCounter}`;
}

function refOf(block: TimelineBlockDraft) {
  return block.clientId ?? block.id ?? "";
}

export type RunOfShowCrewCount = { total: number; filled: number };

export function RunOfShowEditor({
  blocks,
  onChange,
  readOnly,
  eventStartAt,
  acts,
  actName,
  swaps,
  crewFor,
  quickAdd,
  actsEditable = true,
}: {
  blocks: TimelineBlockDraft[];
  onChange: (next: TimelineBlockDraft[]) => void;
  readOnly: boolean;
  /** Event start (ms); anchors day numbers and default times. */
  eventStartAt: number | null;
  acts: RunOfShowAct[];
  actName: (block: TimelineBlockDraft) => string | undefined;
  swaps: SwapLookup;
  /** Crew on a section; omit where crew aren't edited alongside (series template). */
  crewFor?: (block: TimelineBlockDraft) => RunOfShowCrewCount;
  quickAdd: { label: string; disabled: boolean; run: () => void };
  /**
   * False where saves don't write act times back to the lineup (the invoice):
   * soundchecks and sets are shown but only change from the Run of Show tab.
   */
  actsEditable?: boolean;
}) {
  const [buildOpen, setBuildOpen] = useState(false);
  const days = useMemo(() => nestRunOfShow(blocks), [blocks]);
  const issues = useMemo(
    () => runOfShowIssues(blocks, acts, { actName, swaps }),
    [blocks, acts, actName, swaps],
  );

  function update(target: TimelineBlockDraft, patch: Partial<TimelineBlockDraft>) {
    onChange(blocks.map((block) => (block === target ? { ...block, ...patch } : block)));
  }

  function setTimes(target: TimelineBlockDraft, start: string, end: string) {
    const startMs = localDateTimeInputToMs(start);
    update(target, {
      startsAt: start,
      endsAt: end,
      dayIndex:
        eventStartAt != null && startMs != null
          ? pacificDayIndexFromAnchor(eventStartAt, startMs)
          : target.dayIndex,
    });
  }

  function remove(target: TimelineBlockDraft) {
    onChange(blocks.filter((block) => block !== target));
  }

  /** New blocks start where the run of show currently ends (or at event start). */
  function add(
    blockType: ScheduleBlockType,
    label: string,
    minutes: number,
    act?: RunOfShowAct,
  ) {
    const ends = blocks
      .filter((block) => !SECTION_BLOCK_TYPES.includes(block.blockType))
      .map((block) => localDateTimeInputToMs(block.endsAt))
      .filter((ms): ms is number => ms != null);
    const start = ends.length > 0 ? Math.max(...ends) : eventStartAt;
    if (start == null) return;
    const block: TimelineBlockDraft = {
      clientId: newClientId(),
      blockType,
      label,
      dayIndex: eventStartAt != null ? pacificDayIndexFromAnchor(eventStartAt, start) : 0,
      startsAt: toLocalDateTimeInput(start),
      endsAt: toLocalDateTimeInput(start + minutes * MINUTE),
      notes: "",
    };
    if (act) {
      block.actOwned = true;
      if (act.participationId) block.participationId = act.participationId;
      else if (act.needId) block.needId = act.needId;
    }
    onChange([...blocks, block]);
  }

  function build(input: BuildRunOfShowInput) {
    onChange(buildRunOfShow(blocks, input, newClientId));
  }

  const actsWith = (type: "soundcheck" | "set") =>
    new Set(blocks.filter((block) => block.blockType === type).map(actKeyOf).filter(Boolean));
  const withSoundcheck = actsWith("soundcheck");
  const withSet = actsWith("set");
  const multiDay = days.length > 1 || (days[0]?.dayIndex ?? 0) > 0;

  return (
    <div className="space-y-4" data-testid="run-of-show">
      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          {actsEditable ? (
          <Button
            type="button"
            size="sm"
            disabled={acts.length === 0 || eventStartAt == null}
            title={acts.length === 0 ? "Add acts to the lineup first." : undefined}
            onClick={() => setBuildOpen(true)}
          >
            <MagicWandIcon className="size-4" />
            Build run of show
          </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={quickAdd.disabled}
            onClick={quickAdd.run}
          >
            <LightningIcon className="size-4" />
            {quickAdd.label}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                <PlusIcon className="size-4" />
                Add
                <CaretDownIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Section (crew are scheduled per section)</DropdownMenuLabel>
              {SECTION_BLOCK_TYPES.map((type) => (
                <DropdownMenuItem
                  key={type}
                  onSelect={() => add(type, SCHEDULE_BLOCK_TYPE_LABELS[type], 60)}
                >
                  {SCHEDULE_BLOCK_TYPE_LABELS[type]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Moment</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => add("doors", "Doors", 30)}>Doors</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => add("changeover", "Changeover", 15)}>
                Changeover
              </DropdownMenuItem>
              {acts.some((act) => !withSoundcheck.has(act.key) || !withSet.has(act.key)) ? (
                <DropdownMenuSeparator />
              ) : null}
              {acts
                .filter((act) => !withSoundcheck.has(act.key))
                .map((act) => (
                  <DropdownMenuItem
                    key={`sc-${act.key}`}
                    onSelect={() => add("soundcheck", `${act.name} soundcheck`, 30, act)}
                  >
                    Soundcheck · {act.name}
                  </DropdownMenuItem>
                ))}
              {acts
                .filter((act) => !withSet.has(act.key))
                .map((act) => (
                  <DropdownMenuItem
                    key={`set-${act.key}`}
                    onSelect={() => add("set", `${act.name} set`, 45, act)}
                  >
                    Set · {act.name}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      {issues.summary.length > 0 ? (
        <div
          role="note"
          className="flex items-start gap-2 border border-status-amber-500/40 bg-status-amber-500/10 px-3 py-2 text-sm text-status-amber-800 dark:text-status-amber-300"
        >
          <WarningIcon className="mt-0.5 size-4 shrink-0" weight="fill" />
          <ul className="space-y-0.5">
            {issues.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {days.length === 0 ? (
        <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No run of show yet. Build it from the lineup, or quick-add the sections crew work in.
        </p>
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <div key={day.dayIndex} className="space-y-2">
              {multiDay ? (
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Day {day.dayIndex + 1}
                  {day.entries[0]
                    ? ` · ${formatDate(day.entries[0].section?.start ?? day.entries[0].moments[0]!.start)}`
                    : ""}
                </h3>
              ) : null}
              {day.entries.map((entry) =>
                entry.section ? (
                  <SectionCard
                    key={refOf(entry.section.block)}
                    section={entry.section}
                    moments={entry.moments}
                    crew={crewFor?.(entry.section.block)}
                    renderMoment={(moment) => (
                      <MomentRow
                        key={refOf(moment.block)}
                        moment={moment}
                        blocks={blocks}
                        readOnly={readOnly || (!actsEditable && !!moment.block.actOwned)}
                        issues={issues.byRef.get(refOf(moment.block)) ?? []}
                        actName={actName}
                        swaps={swaps}
                        onTimes={setTimes}
                        onLabel={(block, label) => update(block, { label })}
                        onRemove={remove}
                      />
                    )}
                    readOnly={readOnly}
                    issues={issues.byRef.get(refOf(entry.section.block)) ?? []}
                    onTimes={setTimes}
                    onLabel={(block, label) => update(block, { label })}
                    onRemove={remove}
                  />
                ) : (
                  <div key={refOf(entry.moments[0]!.block)} className="border border-dashed">
                    <MomentRow
                      moment={entry.moments[0]!}
                      blocks={blocks}
                      readOnly={readOnly || (!actsEditable && !!entry.moments[0]!.block.actOwned)}
                      issues={issues.byRef.get(refOf(entry.moments[0]!.block)) ?? []}
                      actName={actName}
                      swaps={swaps}
                      onTimes={setTimes}
                      onLabel={(block, label) => update(block, { label })}
                      onRemove={remove}
                    />
                  </div>
                ),
              )}
            </div>
          ))}
        </div>
      )}

      {buildOpen && eventStartAt != null ? (
        <BuildRunOfShowDialog
          open={buildOpen}
          onOpenChange={setBuildOpen}
          acts={acts}
          blocks={blocks}
          eventStartAt={eventStartAt}
          onBuild={build}
        />
      ) : null}
    </div>
  );
}

type RowHandlers = {
  readOnly: boolean;
  issues: string[];
  onTimes: (block: TimelineBlockDraft, start: string, end: string) => void;
  onLabel: (block: TimelineBlockDraft, label: string) => void;
  onRemove: (block: TimelineBlockDraft) => void;
};

function IssueList({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-0.5">
      {issues.map((issue) => (
        <li
          key={issue}
          className="flex items-center gap-1 text-xs text-status-amber-800 dark:text-status-amber-300"
        >
          <WarningIcon className="size-3.5 shrink-0" weight="fill" />
          {issue}
        </li>
      ))}
    </ul>
  );
}

function RowControls({
  block,
  readOnly,
  onTimes,
  onRemove,
  removeLabel,
}: {
  block: TimelineBlockDraft;
  readOnly: boolean;
  onTimes: RowHandlers["onTimes"];
  onRemove: RowHandlers["onRemove"];
  removeLabel: string;
}) {
  if (readOnly) return null;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <DateTimeRangePicker
        className="w-64"
        startValue={block.startsAt}
        endValue={block.endsAt}
        onChange={({ start, end }) => onTimes(block, start, end)}
        placeholder="Start and end"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={removeLabel}
        onClick={() => onRemove(block)}
      >
        <TrashIcon className="size-4" />
      </Button>
    </div>
  );
}

function SectionCard({
  section,
  moments,
  crew,
  renderMoment,
  readOnly,
  issues,
  onTimes,
  onLabel,
  onRemove,
}: RowHandlers & {
  section: TimedBlock;
  moments: TimedBlock[];
  crew?: RunOfShowCrewCount;
  renderMoment: (moment: TimedBlock) => React.ReactNode;
}) {
  const { block, start, end } = section;
  return (
    <section className="border" data-block-type={block.blockType}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-muted/20 px-3 py-2">
        <div className="w-24 shrink-0 tabular-nums">
          <p className="text-sm font-semibold">{formatTime(start)}</p>
          <p className="text-xs text-muted-foreground">
            to {formatTime(end)} · {durationLabel(start, end)}
          </p>
        </div>
        <span className={cn("h-8 w-1 shrink-0", RAIL_STYLES[block.blockType])} aria-hidden />
        <TypeChip type={block.blockType} />
        <div className="min-w-40 flex-1">
          {readOnly ? (
            <p className="truncate text-sm font-medium">{block.label}</p>
          ) : (
            <Input
              aria-label="Section name"
              className="h-8"
              value={block.label}
              onChange={(event) => onLabel(block, event.target.value)}
            />
          )}
        </div>
        {crew ? (
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 text-xs tabular-nums",
              crew.total === 0
                ? "text-muted-foreground"
                : crew.filled < crew.total
                  ? "text-status-amber-700"
                  : "text-status-emerald-700",
            )}
          >
            <UsersThreeIcon className="size-3.5" />
            {crew.total === 0 ? "No crew" : `${crew.filled}/${crew.total} crew`}
          </span>
        ) : null}
        <RowControls
          block={block}
          readOnly={readOnly}
          onTimes={onTimes}
          onRemove={onRemove}
          removeLabel={`Remove ${block.label || "section"}`}
        />
        {issues.length > 0 ? (
          <div className="basis-full">
            <IssueList issues={issues} />
          </div>
        ) : null}
      </header>
      {moments.length > 0 ? (
        <div className="divide-y border-t">{moments.map((moment) => renderMoment(moment))}</div>
      ) : null}
    </section>
  );
}

function MomentRow({
  moment,
  blocks,
  readOnly,
  issues,
  actName,
  swaps,
  onTimes,
  onLabel,
  onRemove,
}: RowHandlers & {
  moment: TimedBlock;
  blocks: TimelineBlockDraft[];
  actName: (block: TimelineBlockDraft) => string | undefined;
  swaps: SwapLookup;
}) {
  const { block, start, end } = moment;
  const Icon = MOMENT_ICONS[block.blockType as keyof typeof MOMENT_ICONS];
  const name = block.actOwned ? actName(block) : undefined;
  const title = block.actOwned
    ? `${name ?? block.label.replace(/ (soundcheck|set)$/, "")}`
    : block.label;

  let swapLines: string[] | undefined;
  if (block.blockType === "changeover") {
    const { before, after } = changeoverNeighbors(blocks, block);
    const from = before ? actName(before) : undefined;
    const to = after ? actName(after) : undefined;
    swapLines = from && to ? swaps(from, to) : undefined;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 pr-3 pl-6" data-block-type={block.blockType}>
      <div className="w-18 shrink-0 tabular-nums">
        <p className="text-sm">{formatTime(start)}</p>
        <p className="text-xs text-muted-foreground">{durationLabel(start, end)}</p>
      </div>
      <span className={cn("h-6 w-1 shrink-0", RAIL_STYLES[block.blockType])} aria-hidden />
      {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
      <TypeChip type={block.blockType} />
      <div className="min-w-40 flex-1">
        {block.actOwned || readOnly ? (
          <p className="truncate text-sm font-medium">{title}</p>
        ) : (
          <Input
            aria-label={`${SCHEDULE_BLOCK_TYPE_LABELS[block.blockType]} name`}
            className="h-8"
            value={block.label}
            onChange={(event) => onLabel(block, event.target.value)}
          />
        )}
      </div>
      <RowControls
        block={block}
        readOnly={readOnly}
        onTimes={onTimes}
        onRemove={onRemove}
        removeLabel={`Remove ${block.actOwned ? `${title} ${block.blockType}` : block.label}`}
      />
      {swapLines || issues.length > 0 ? (
        <div className="basis-full space-y-1 pl-22">
          {swapLines ? (
            swapLines.length === 0 ? (
              <p className="text-xs text-muted-foreground">No cable swaps on the stage box.</p>
            ) : (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  {swapLines.length} cable swap{swapLines.length === 1 ? "" : "s"} · ~
                  {suggestedChangeoverMinutes(swapLines.length)} min suggested
                </summary>
                <ul className="mt-1 space-y-0.5 font-mono">
                  {swapLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </details>
            )
          ) : null}
          <IssueList issues={issues} />
        </div>
      ) : null}
    </div>
  );
}
