import type { FunctionReturnType } from "convex/server";
import type { Tone } from "@/components/page-header";
import { api } from "@/lib/convex-api";

/** One payout row, as the pipeline and the side panel read it. */
export type PayoutRow = FunctionReturnType<typeof api.bandPayments.listPipeline>[number];
export type PayoutStatus = PayoutRow["status"];
export type PayoutStage = NonNullable<PayoutRow["stage"]>;

/** Stages in workflow order; the pipeline groups rows this way. */
export const PAYOUT_STAGES: PayoutStage[] = [
  "upcoming",
  "waiting_on_artist",
  "ready_to_send",
  "waiting_on_signature",
  "ready_to_pay",
  "paid",
];

export const PAYOUT_STAGE_LABELS: Record<PayoutStage, string> = {
  upcoming: "Upcoming",
  waiting_on_artist: "Waiting on artist",
  ready_to_send: "Ready to send",
  waiting_on_signature: "Waiting on signature",
  ready_to_pay: "Ready to pay",
  paid: "Paid",
};

/** Who has to act for a payout to move on, shown next to each stage. */
export const PAYOUT_STAGE_WHO: Record<PayoutStage, string> = {
  upcoming: "The event isn't over",
  waiting_on_artist: "Artist: onboarding or payee info",
  ready_to_send: "Arbor: send the signature request",
  waiting_on_signature: "Artist: sign the agreement",
  ready_to_pay: "Arbor: pay and record the transfer",
  paid: "Done",
};

/** Amber where Arbor has to act, blue while we wait on someone else. */
export function payoutStageTone(stage: PayoutStage): Tone {
  switch (stage) {
    case "upcoming":
      return "neutral";
    case "waiting_on_artist":
    case "waiting_on_signature":
      return "blue";
    case "ready_to_send":
    case "ready_to_pay":
      return "amber";
    case "paid":
      return "emerald";
  }
}

/** The row's status chip: the stage, split where one stage holds two statuses. */
export function payoutStatusLabel(status: PayoutStatus) {
  switch (status) {
    case "draft":
      return "Upcoming";
    case "pending_onboarding":
      return "Onboarding";
    case "pending_payee":
      return "Payee info";
    case "pending_email":
      return "Ready to send";
    case "awaiting_confirmation":
      return "Awaiting signature";
    case "confirmed":
      return "Ready to pay";
    case "paid":
      return "Paid";
    case "cancelled":
      return "Removed";
  }
}

export type PayoutAction = "remind_onboarding" | "remind_payee" | "send_request" | "resend_request" | "mark_paid";

/** Each status has exactly one primary action, or none (upcoming, paid). */
export function payoutPrimaryAction(status: PayoutStatus): { action: PayoutAction; label: string } | null {
  switch (status) {
    case "pending_onboarding":
      return { action: "remind_onboarding", label: "Send reminder" };
    case "pending_payee":
      return { action: "remind_payee", label: "Send reminder" };
    case "pending_email":
      return { action: "send_request", label: "Send signature request" };
    case "awaiting_confirmation":
      return { action: "resend_request", label: "Resend" };
    case "confirmed":
      return { action: "mark_paid", label: "Mark paid" };
    case "draft":
    case "paid":
    case "cancelled":
      return null;
  }
}

/** Stages whose rows can be selected and actioned together. */
export const BATCH_STAGES: ReadonlySet<PayoutStage> = new Set(["ready_to_send", "ready_to_pay"]);

const DAY_MS = 24 * 60 * 60 * 1000;

function dayCount(ms: number) {
  return Math.floor(ms / DAY_MS);
}

/** "Waiting 6 days", or for upcoming payouts how far off the event is. */
export function payoutAgeLabel(row: PayoutRow, nowMs: number) {
  if (row.stage === "upcoming") {
    const days = dayCount(row.eventStartAt - nowMs);
    if (row.eventStartAt <= nowMs) return "Event in progress";
    if (days < 1) return "Event today";
    return `Event in ${days} day${days === 1 ? "" : "s"}`;
  }
  const days = dayCount(nowMs - row.stageEnteredAt);
  if (row.stage === "paid") {
    if (days < 1) return "Paid today";
    return `Paid ${days} day${days === 1 ? "" : "s"} ago`;
  }
  if (days < 1) return "New today";
  return `Waiting ${days} day${days === 1 ? "" : "s"}`;
}

/** The act in the event's Lineup: its position when it fills one, else the act itself. */
export function payoutLineupHref(row: Pick<PayoutRow, "eventId" | "lineupNeedId" | "organizationId">) {
  const base = `/dashboard/events/${row.eventId}/artists`;
  return row.lineupNeedId
    ? `${base}?position=${row.lineupNeedId}`
    : `${base}?act=${encodeURIComponent(row.organizationId)}`;
}

export type PayoutGroup = {
  id: "action_needed" | "no_action_needed";
  label: string;
  description: string;
  stages: PayoutStage[];
};

/**
 * The page's two blocks: what Arbor has to do, and everything waiting on
 * someone else (or already done). Stages stay in workflow order inside each.
 */
export const PAYOUT_GROUPS: PayoutGroup[] = [
  {
    id: "action_needed",
    label: "Action needed",
    description: "Arbor has to act: send the signature request, then pay once it's signed.",
    stages: ["ready_to_send", "ready_to_pay"],
  },
  {
    id: "no_action_needed",
    label: "No action needed",
    description:
      "Waiting on the show to end or on the artist, or already paid. You can still nudge an artist with a reminder.",
    stages: ["upcoming", "waiting_on_artist", "waiting_on_signature", "paid"],
  },
];

/** Rows `listPipeline` reads per status (server budget). */
export const PIPELINE_STATUS_CAP = 200;

/** Most payouts a batch send or batch mark-paid takes (matches the server limit). */
export const MAX_BATCH_PAYOUTS = 50;

type QueueCounts = FunctionReturnType<typeof api.bandPayments.getQueueCounts>;

/** Exact per-stage counts and totals from `getQueueCounts` (paid covers all time). */
export function payoutStageCounts(
  counts: QueueCounts,
): Record<PayoutStage, { count: number; totalUsd: number }> {
  return {
    upcoming: { count: counts.upcoming, totalUsd: counts.totalsUsd.upcoming },
    waiting_on_artist: {
      count: counts.needs_onboarding + counts.needs_payee,
      totalUsd: counts.totalsUsd.needs_onboarding + counts.totalsUsd.needs_payee,
    },
    ready_to_send: { count: counts.needs_email, totalUsd: counts.totalsUsd.needs_email },
    waiting_on_signature: { count: counts.awaiting_reply, totalUsd: counts.totalsUsd.awaiting_reply },
    ready_to_pay: { count: counts.ready_to_pay, totalUsd: counts.totalsUsd.ready_to_pay },
    paid: { count: counts.paid, totalUsd: counts.totalsUsd.paid },
  };
}
