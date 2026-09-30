import type { UserSelectOption } from "@/components/users/user-select";
import {
  SECTION_AVAILABILITY_RANK,
  sectionAvailability,
  type SectionAvailabilityLevel,
  type SectionForAvailability,
} from "@/lib/crew-availability";
import { conflictsDuring, type AssignableResponder, type CrewConflict } from "@/lib/crew-shift-assign";

export const LEVEL_LABELS: Record<SectionAvailabilityLevel, string> = {
  available: "Available",
  part: "Part",
  backup: "Backup",
  pending: "No answer",
  unavailable: "Unavailable",
};

export const LEVEL_CLASSES: Record<SectionAvailabilityLevel, string> = {
  available:
    "border-status-emerald-500/40 bg-status-emerald-500/10 text-status-emerald-700 dark:text-status-emerald-300",
  part: "border-status-blue-500/40 bg-status-blue-500/10 text-status-blue-700 dark:text-status-blue-200",
  backup:
    "border-status-amber-500/40 bg-status-amber-500/10 text-status-amber-700 dark:text-status-amber-300",
  pending: "border-border bg-muted text-muted-foreground",
  unavailable:
    "border-status-rose-500/40 bg-status-rose-500/10 text-status-rose-700 dark:text-status-rose-200",
};

export const CONFLICT_CLASS =
  "border-status-rose-500/40 bg-status-rose-500/10 text-status-rose-700 dark:text-status-rose-200";

/**
 * Person picker options for one section: availability badge on each person,
 * best fit first. With no availability asked (e.g. non-crewed event types),
 * the options come back unchanged.
 */
export function annotateOptionsForWindow(args: {
  options: UserSelectOption[];
  window: SectionForAvailability | null;
  responderById: Map<string, AssignableResponder>;
  conflicts: CrewConflict[];
  askAvailability: boolean;
}): UserSelectOption[] {
  if (!args.askAvailability || !args.window) return args.options;
  const window = args.window;
  return args.options
    .map((option) => {
      if (!option.value) return { option, rank: -1 };
      const availability = sectionAvailability(args.responderById.get(option.value), window);
      const booked = conflictsDuring(args.conflicts, option.value, window);
      const badge = booked.length
        ? { label: "Booked", className: CONFLICT_CLASS }
        : { label: LEVEL_LABELS[availability.level], className: LEVEL_CLASSES[availability.level] };
      const detail = booked.length
        ? `On ${booked.map((conflict) => conflict.eventTitle).join(", ")}`
        : availability.detail;
      return {
        option: {
          ...option,
          badge,
          description: [detail, option.description].filter(Boolean).join(" · "),
        },
        rank: SECTION_AVAILABILITY_RANK[availability.level] + (booked.length ? 10 : 0),
      };
    })
    .sort((a, b) => a.rank - b.rank || a.option.label.localeCompare(b.option.label))
    .map((entry) => entry.option);
}
