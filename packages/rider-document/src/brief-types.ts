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
  callLabel?: string;
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
  blocks: EventBriefBlock[];
  shifts: EventBriefShift[];
  assignments: EventBriefAssignment[];
  instructions: EventBriefInstruction[];
  /**
   * Input list + changeover (and monitor/backline) pages, present only when the
   * event has bands with published riders. The brief itself always renders.
   */
  nightRider?: RiderDocumentData;
};
