import {
  ArrowsLeftRightIcon,
  DoorOpenIcon,
  MicrophoneStageIcon,
  SpeakerHighIcon,
} from "@phosphor-icons/react";
import { SCHEDULE_BLOCK_TYPE_LABELS, type ScheduleBlockType } from "@/lib/schedule-block-types";
import { cn } from "@/lib/utils";

/** Shared look for the Run of Show editor and its read-only views. */

const TYPE_STYLES: Record<ScheduleBlockType, string> = {
  setup: "border-status-blue-500/40 bg-status-blue-500/10 text-status-blue-700",
  show: "border-status-emerald-500/40 bg-status-emerald-500/10 text-status-emerald-700",
  strike: "border-status-amber-500/40 bg-status-amber-500/10 text-status-amber-700",
  custom: "border-border bg-muted text-muted-foreground",
  doors: "border-status-slate-500/40 bg-status-slate-500/10 text-status-slate-700 dark:text-status-slate-200",
  soundcheck: "border-status-sky-500/40 bg-status-sky-500/10 text-status-sky-700",
  set: "border-status-violet-500/40 bg-status-violet-500/10 text-status-violet-700",
  changeover: "border-status-orange-500/40 bg-status-orange-500/10 text-status-orange-800",
};

export const RAIL_STYLES: Record<ScheduleBlockType, string> = {
  setup: "bg-status-blue-500",
  show: "bg-status-emerald-500",
  strike: "bg-status-amber-500",
  custom: "bg-border",
  doors: "bg-status-slate-500",
  soundcheck: "bg-status-sky-500",
  set: "bg-status-violet-500",
  changeover: "bg-status-orange-500",
};

export const MOMENT_ICONS = {
  doors: DoorOpenIcon,
  soundcheck: SpeakerHighIcon,
  set: MicrophoneStageIcon,
  changeover: ArrowsLeftRightIcon,
} as const;

const MINUTE = 60_000;

export function durationLabel(start: number, end: number) {
  const minutes = Math.round((end - start) / MINUTE);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function TypeChip({ type }: { type: ScheduleBlockType }) {
  return (
    <span
      className={cn(
        "shrink-0 border px-1.5 py-0.5 text-2xs font-semibold tracking-wide uppercase",
        TYPE_STYLES[type],
      )}
    >
      {SCHEDULE_BLOCK_TYPE_LABELS[type]}
    </span>
  );
}
