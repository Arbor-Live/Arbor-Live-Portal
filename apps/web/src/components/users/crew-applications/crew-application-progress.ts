import type { Tone } from "@/components/page-header";

export type CrewApplicationStatus = "submitted" | "trainee" | "converted" | "closed";
export type OutreachStage = "contacted" | "meeting_booked" | "met";

/**
 * Where an applicant is, start to finish: nobody has reached out yet, a
 * Calendly link was sent, the intro meeting is booked, they met, then a
 * training event, a decision once training is over, then membership (or
 * turned away). Submitted applications carry the outreach step; the later
 * steps are the application status, with "decision needed" derived from when
 * the trainee's training shift ends.
 */
export type CrewApplicationProgress =
  | "new"
  | OutreachStage
  | "trainee"
  | "decision_needed"
  | "converted"
  | "closed";

/** Workflow order: the order groups appear on the page. */
export const PROGRESS_ORDER: CrewApplicationProgress[] = [
  "new",
  "contacted",
  "meeting_booked",
  "met",
  "trainee",
  "decision_needed",
  "converted",
  "closed",
];

export const PROGRESS_LABELS: Record<CrewApplicationProgress, string> = {
  new: "Not contacted",
  contacted: "Reached out",
  meeting_booked: "Meeting booked",
  met: "Met",
  trainee: "Trainee",
  decision_needed: "Decision needed",
  converted: "Member",
  closed: "Turned away",
};

export const PROGRESS_TONES: Record<CrewApplicationProgress, Tone> = {
  new: "amber",
  contacted: "blue",
  meeting_booked: "blue",
  met: "blue",
  trainee: "emerald",
  decision_needed: "amber",
  converted: "emerald",
  closed: "neutral",
};

/** One line under each group header. */
export const PROGRESS_DESCRIPTIONS: Record<CrewApplicationProgress, string> = {
  new: "Nobody has reached out yet. Send a Calendly link, then mark them reached out.",
  contacted: "Calendly sent, waiting on them to book.",
  meeting_booked: "Intro meeting on the calendar.",
  met: "Met them. Assign a training event next.",
  trainee: "Scheduled for a training event.",
  decision_needed: "Training is over. Invite them as a member or turn them away.",
  converted: "Invited to the portal as members.",
  closed: "Turned away.",
};

const STATUS_BY_PROGRESS: Record<CrewApplicationProgress, CrewApplicationStatus> = {
  new: "submitted",
  contacted: "submitted",
  meeting_booked: "submitted",
  met: "submitted",
  trainee: "trainee",
  decision_needed: "trainee",
  converted: "converted",
  closed: "closed",
};

/** The outreach steps a submitted application moves through, in order. */
export const OUTREACH_STEPS: Array<{ value: OutreachStage | "new"; label: string; hint: string }> = [
  { value: "new", label: PROGRESS_LABELS.new, hint: "Nobody has reached out yet" },
  { value: "contacted", label: PROGRESS_LABELS.contacted, hint: "Calendly link sent" },
  { value: "meeting_booked", label: PROGRESS_LABELS.meeting_booked, hint: "Intro meeting on the calendar" },
  { value: "met", label: PROGRESS_LABELS.met, hint: "Ready for a training event" },
];

/** The open steps; the page starts filtered to these. */
export const OPEN_PROGRESS: CrewApplicationProgress[] = [
  "new",
  "contacted",
  "meeting_booked",
  "met",
  "trainee",
  "decision_needed",
];

/** Steps waiting on staff; their group headers are highlighted. */
export const ACTION_PROGRESS: ReadonlySet<CrewApplicationProgress> = new Set(["new", "decision_needed"]);

/** A trainee moves to "Decision needed" on their own once their last training shift ends. */
export function applicationProgress(
  row: {
    status: CrewApplicationStatus;
    outreachStage?: OutreachStage;
    trainingEndsAt?: number;
  },
  now: number,
): CrewApplicationProgress {
  if (row.status === "submitted") return row.outreachStage ?? "new";
  if (row.status === "trainee" && row.trainingEndsAt !== undefined && row.trainingEndsAt <= now) {
    return "decision_needed";
  }
  return row.status;
}

/** The statuses to load for a Progress filter chip (`undefined` loads them all). */
export function statusesForProgressFilter(
  filter: { operator: "is" | "is_not"; values: string[] } | undefined,
): CrewApplicationStatus[] | undefined {
  if (!filter || filter.values.length === 0) return undefined;
  const included = PROGRESS_ORDER.filter((progress) =>
    filter.operator === "is" ? filter.values.includes(progress) : !filter.values.includes(progress),
  );
  return [...new Set(included.map((progress) => STATUS_BY_PROGRESS[progress]))];
}
