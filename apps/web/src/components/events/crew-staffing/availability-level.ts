import type { UserSelectOption } from "@/components/users/user-select";
import {
  SECTION_AVAILABILITY_RANK,
  sectionAvailability,
  type SectionAvailabilityLevel,
  type SectionForAvailability,
} from "@/lib/crew-availability";
import {
  conflictsDuring,
  type AssignableResponder,
  type CrewConflict,
  type QuarterHoursById,
} from "@/lib/crew-shift-assign";
import { formatHours } from "@/lib/crew-hours-windows";

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
 * Person picker options for one section, best fit first: availability (when
 * asked), then the fewest hours this quarter, then name. Each person shows
 * their availability badge and quarter hours.
 */
export function annotateOptionsForWindow(args: {
  options: UserSelectOption[];
  window: SectionForAvailability | null;
  responderById: Map<string, AssignableResponder>;
  conflicts: CrewConflict[];
  askAvailability: boolean;
  quarterHours?: QuarterHoursById;
}): UserSelectOption[] {
  const hoursOf = (option: UserSelectOption) => args.quarterHours?.get(option.value) ?? 0;
  const withHours = (option: UserSelectOption): UserSelectOption => {
    const hours = option.value ? args.quarterHours?.get(option.value) : undefined;
    if (hours === undefined) return option;
    return {
      ...option,
      description: [`${formatHours(hours)} this quarter`, option.description].filter(Boolean).join(" · "),
    };
  };
  const byFit = (a: { option: UserSelectOption; rank: number }, b: { option: UserSelectOption; rank: number }) =>
    a.rank - b.rank || hoursOf(a.option) - hoursOf(b.option) || a.option.label.localeCompare(b.option.label);

  if (!args.askAvailability || !args.window) {
    if (!args.quarterHours) return args.options;
    return args.options
      .map((option) => ({ option, rank: option.value ? 0 : -1 }))
      .sort(byFit)
      .map((entry) => withHours(entry.option));
  }
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
    .sort(byFit)
    .map((entry) => withHours(entry.option));
}
