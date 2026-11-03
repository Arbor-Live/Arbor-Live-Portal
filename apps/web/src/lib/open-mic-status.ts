import type { Tone } from "@/components/page-header";
import { dateTimeFormat, formatTime, PORTAL_TIMEZONE } from "@/lib/format";

export type OpenMicStatus = "scheduled" | "live" | "completed" | "cancelled";

export const OPEN_MIC_STATUS: Record<OpenMicStatus, { label: string; tone: Tone }> = {
  scheduled: { label: "Scheduled", tone: "blue" },
  live: { label: "Live", tone: "emerald" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "rose" },
};

/** What each status can do next. The runner header and the list menu both read this. */
export const OPEN_MIC_MOVES: Record<
  OpenMicStatus,
  { next: "live" | "completed" | null; canCancel: boolean; canRun: boolean }
> = {
  scheduled: { next: "live", canCancel: true, canRun: true },
  live: { next: "completed", canCancel: true, canRun: true },
  completed: { next: null, canCancel: false, canRun: false },
  cancelled: { next: null, canCancel: false, canRun: false },
};

/** "Tue, Nov 3 · 7:00 PM" */
export function formatNightStart(ms: number) {
  const day = dateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
  return `${day} · ${formatTime(ms)}`;
}

export type RunnerWindow = "before" | "open" | "after";

/**
 * Where `now` sits against the runner window (1h before start to 1h after end).
 * Follows `runnerWindowOpenAt` in the backend to within one `useNow` step; the
 * mutations enforce the exact boundary.
 */
export function runnerWindowAt(night: { runnerOpensAt: number; runnerClosesAt: number }, now: number): RunnerWindow {
  if (now < night.runnerOpensAt) return "before";
  return now <= night.runnerClosesAt ? "open" : "after";
}

/** Whether Go live is offered at all; the runner window then decides if it's enabled. */
export function canGoLive(night: { status: OpenMicStatus; eventStatus: string }) {
  return OPEN_MIC_MOVES[night.status].next === "live" && night.eventStatus !== "cancelled";
}

/** The public sign-up form, pinned to one night. */
export function openMicSignupPath(eventId: string) {
  return `/open-mic?event=${eventId}`;
}
