import type { RiderDocumentData, RiderStage, RiderStageItem } from "./types";

/**
 * Everything crew needs for one event, preformatted for print. The backend
 * formats times/labels (portal timezone lives there) so this package stays
 * purely presentational and serializable.
 */
export type EventBriefShift = {
  role: string;
  person: string;
  timeLabel: string;
  notes?: string;
  /** Nobody is assigned yet. */
  open?: boolean;
};

/** Doors, a soundcheck, a set, or a changeover inside a section. */
export type EventBriefMoment = {
  typeLabel: string;
  label: string;
  startLabel: string;
  durationLabel: string;
  notes?: string;
  /** Changeovers: the night rider's cable swaps between the two acts. */
  swaps?: string[];
};

/** Setup, show, strike, or a custom section, with the crew who work it. */
export type EventBriefSection = {
  typeLabel: string;
  label: string;
  timeLabel: string;
  notes?: string;
  crew: EventBriefShift[];
};

/**
 * One row of the run of show: a section and the moments inside it, or a
 * moment that falls outside every section (`section` is absent).
 */
export type EventBriefRunOfShowEntry = {
  section?: EventBriefSection;
  moments: EventBriefMoment[];
};

export type EventBriefRunOfShowDay = {
  /** Present on multi-day events ("Day 2 · Sat, Oct 17"). */
  dayLabel?: string;
  entries: EventBriefRunOfShowEntry[];
};

/** An act on the bill, in show order. */
export type EventBriefAct = {
  name: string;
  soundcheckLabel?: string;
  setLabel?: string;
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

/** One act's stage plot, drawn on its own page in the brief. */
export type EventBriefPlot = {
  bandName: string;
  stage: RiderStage;
  items: RiderStageItem[];
};

/** A patched socket on a snake faceplate, in Default.snap layout order. */
export type EventBriefPatchPort = {
  snake: "A" | "B";
  port: number;
  /** Stage-box reading, e.g. "7 (23)". */
  portLabel: string;
  /** Console strip, or null for the right half of a stereo pair. */
  strip: number | null;
  label: string;
  region: "vox" | "mid" | "drums";
  stereo: boolean;
  phantom: boolean;
  di: boolean;
  usedBy: string[];
};

/** The night snake faceplate(s): what plugs in where, and what stays empty. */
export type EventBriefPatch = {
  title: string;
  subtitle: string;
  /** Only snakes with any used port are listed. */
  snakes: Array<{
    snake: "A" | "B";
    label: string;
    ports: EventBriefPatchPort[];
  }>;
  spare: string[];
  warnings: string[];
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
  runOfShow: EventBriefRunOfShowDay[];
  acts: EventBriefAct[];
  /** Shifts not on a section (no block, or on a doors/soundcheck/set block). */
  otherShifts: EventBriefShift[];
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
   * Its own single stage plot is suppressed when `nightPlots` is set.
   */
  nightRider?: RiderDocumentData;
  /** Every act's stage plot, in show order. */
  nightPlots?: EventBriefPlot[];
  /** The night snake faceplate(s). */
  nightPatch?: EventBriefPatch;
};
