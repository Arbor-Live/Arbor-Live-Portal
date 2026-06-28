"use client";

import {
  eventStatusBadgeTone,
  formatEventStatusLabel,
  normalizeEventStatus,
  type EventStatus,
} from "@/lib/event-status";

type LifecycleState = "upcoming" | "live" | "wrap" | "done" | "cancelled";

function badgeClassName(tone: "neutral" | "blue" | "emerald" | "amber" | "rose") {
  if (tone === "blue") return "bg-blue-500/15 text-blue-700 border-blue-500/30";
  if (tone === "emerald") return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
  if (tone === "amber") return "bg-amber-500/15 text-amber-700 border-amber-500/30";
  if (tone === "rose") return "bg-rose-500/15 text-rose-700 border-rose-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function StatusBadge({ status }: { status: EventStatus }) {
  const tone = eventStatusBadgeTone(status);
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClassName(tone)}`}>
      {formatEventStatusLabel(status)}
    </span>
  );
}

function LifecycleBadge({ lifecycle }: { lifecycle: LifecycleState }) {
  const tone =
    lifecycle === "cancelled"
      ? "rose"
      : lifecycle === "done"
        ? "emerald"
        : lifecycle === "live"
          ? "blue"
          : lifecycle === "wrap"
            ? "amber"
            : "neutral";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClassName(tone)}`}>
      {lifecycle[0].toUpperCase() + lifecycle.slice(1)}
    </span>
  );
}

export function getDerivedLifecycleState({
  status,
  startAt,
  endAt,
  now = Date.now(),
}: {
  status: string;
  startAt: number;
  endAt: number;
  now?: number;
}): LifecycleState {
  const normalized = normalizeEventStatus(status);
  if (normalized === "cancelled") return "cancelled";
  if (now < startAt) return "upcoming";
  if (now >= startAt && now < endAt) return "live";
  if (now >= endAt) return "done";
  return "wrap";
}

export function EventStateBadges({
  status,
  startAt,
  endAt,
}: {
  status: string;
  startAt: number;
  endAt: number;
}) {
  const normalizedStatus = normalizeEventStatus(status);
  const lifecycle = getDerivedLifecycleState({ status: normalizedStatus, startAt, endAt });
  return (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status={normalizedStatus} />
      <LifecycleBadge lifecycle={lifecycle} />
    </div>
  );
}
