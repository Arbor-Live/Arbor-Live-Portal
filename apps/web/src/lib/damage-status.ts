import type { Tone } from "@/components/page-header";

export type DamageStatus = "open" | "in_progress" | "resolved";

export const DAMAGE_STATUS_LABELS: Record<DamageStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

/** Open needs someone, in progress is being worked on, resolved is done. */
export function damageStatusTone(status: DamageStatus): Tone {
  if (status === "open") return "amber";
  if (status === "in_progress") return "blue";
  return "emerald";
}

export const DAMAGE_STATUS_OPTIONS = (Object.keys(DAMAGE_STATUS_LABELS) as DamageStatus[]).map((value) => ({
  value,
  label: DAMAGE_STATUS_LABELS[value],
  tone: damageStatusTone(value),
}));

export const OPERABILITY_LABELS = {
  functional: "Still works",
  needs_repair: "Needs repair",
} as const;

/** 4 and up is urgent; 3 needs attention. */
export function severityTone(severity: number): Tone {
  if (severity >= 4) return "rose";
  if (severity === 3) return "amber";
  return "neutral";
}
