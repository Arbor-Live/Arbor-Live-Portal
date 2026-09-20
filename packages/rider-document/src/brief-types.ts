import type { RiderDocumentData } from "./types";

/**
 * Everything crew needs for one event, preformatted for print. The backend
 * formats times/labels (portal timezone lives there) so this package stays
 * purely presentational and serializable.
 */
export type EventBriefBlock = {
  dayLabel: string;
  label: string;
  timeLabel: string;
  notes?: string;
};

export type EventBriefShift = {
  role: string;
  person: string;
  timeLabel: string;
  notes?: string;
};

export type EventBriefAssignment = {
  roleLabel: string;
  person: string;
  contact?: string;
  notes?: string;
};

export type EventBriefInstruction = {
  title: string;
  body: string;
};

/** A contact row (venue, host billing, band, or a manually added event contact). */
export type EventBriefContact = {
  roleLabel: string;
  person: string;
  contact?: string;
  notes?: string;
};

export type EventBriefPullItem = {
  label: string;
  quantity: number;
  notes?: string;
};

export type EventBriefDocumentData = {
  title: string;
  generatedAtLabel: string;
  statusLabel: string;
  eventTypeLabel?: string;
  hostLabel?: string;
  whenLabel: string;
  venueName?: string;
  venueAddress?: string;
  notes?: string;
  /** Authenticated event page, encoded as a QR code on the printed brief. */
  briefUrl?: string;
  blocks: EventBriefBlock[];
  shifts: EventBriefShift[];
  assignments: EventBriefAssignment[];
  /**
   * Venue, host billing, band, and manually added event contacts, merged into
   * one section on the printed brief.
   */
  contacts: EventBriefContact[];
  /** Equipment required for the event, sized to the event's pull list. */
  pullList: EventBriefPullItem[];
  instructions: EventBriefInstruction[];
  /**
   * Input list + changeover (and monitor/backline) pages, present only when the
   * event has bands with published riders. The brief itself always renders.
   */
  nightRider?: RiderDocumentData;
};
