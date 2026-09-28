import type { Tone } from "@/components/page-header";

export type EventRequestStatus =
  | "submitted"
  | "action_required"
  | "pending_client"
  | "converted"
  | "declined"
  /** @deprecated Migrated to action_required. */
  | "in_review";

export function eventRequestStatusLabel(status: string) {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "action_required":
    case "in_review":
      return "Action required";
    case "pending_client":
      return "Pending";
    case "converted":
      return "Converted";
    case "declined":
      return "Declined";
    default:
      return status;
  }
}

export function eventRequestStatusTone(status: string): Tone {
  switch (status) {
    case "submitted":
    case "action_required":
    case "in_review":
      return "amber";
    case "pending_client":
      return "blue";
    case "converted":
      return "emerald";
    case "declined":
      return "rose";
    default:
      return "neutral";
  }
}
