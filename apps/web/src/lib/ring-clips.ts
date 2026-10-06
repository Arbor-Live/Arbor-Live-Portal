import {
  BellRingingIcon,
  BroadcastIcon,
  PersonSimpleWalkIcon,
  VideoCameraIcon,
  type Icon,
} from "@phosphor-icons/react";
import { formatDate, pacificDateKey } from "@/lib/format";

export type RingClipKind = "motion" | "ding" | "live" | "other";

export const RING_CLIP_KIND_LABELS: Record<RingClipKind, string> = {
  motion: "Motion",
  ding: "Doorbell",
  live: "Live view",
  other: "Other",
};

export const RING_CLIP_KIND_ICONS: Record<RingClipKind, Icon> = {
  motion: PersonSimpleWalkIcon,
  ding: BellRingingIcon,
  live: BroadcastIcon,
  other: VideoCameraIcon,
};

export const RING_CLIP_KINDS = Object.keys(RING_CLIP_KIND_LABELS) as RingClipKind[];

/** `0:31`, `2:05`. */
export function formatClipDuration(seconds: number | null | undefined) {
  if (seconds == null) return null;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** "Today", "Yesterday", or the date, for a day group header. */
export function clipDayLabel(dayKey: string, now: number) {
  if (dayKey === pacificDateKey(now)) return "Today";
  if (dayKey === pacificDateKey(now - 24 * 60 * 60 * 1000)) return "Yesterday";
  const [year, month, day] = dayKey.split("-").map(Number);
  return formatDate(Date.UTC(year, month - 1, day, 20));
}

/** Consecutive clips grouped by Pacific day, keeping their order. */
export function groupClipsByDay<T extends { createdAt: number }>(clips: T[]) {
  const groups: { dayKey: string; clips: T[] }[] = [];
  for (const clip of clips) {
    const dayKey = pacificDateKey(clip.createdAt);
    const last = groups.at(-1);
    if (last?.dayKey === dayKey) last.clips.push(clip);
    else groups.push({ dayKey, clips: [clip] });
  }
  return groups;
}
