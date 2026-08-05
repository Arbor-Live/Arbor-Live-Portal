/**
 * Shared shape of a band technical rider.
 *
 * The same structure is stored in Convex (`bandRiders`), edited in the web
 * stage-plot editor, exported to PDF, and consumed by show-file generation.
 * Keep it serializable: plain JSON only, no dates or class instances.
 */

/** Stage footprint in feet. Plots are always drawn from the audience's view. */
export type RiderStage = {
  widthFt: number;
  depthFt: number;
};

export type RiderInputType = "mic" | "di" | "line" | "wireless" | "playback";

export type RiderStandType =
  | "none"
  | "tall_boom"
  | "short_boom"
  | "straight"
  | "clip";

export type RiderProvidedBy = "band" | "arbor" | "venue" | "unknown";

export type RiderMonitorType = "wedge" | "iem" | "side_fill";

/**
 * One placed symbol on the stage plot.
 *
 * `xFt` / `yFt` are the item centre in feet from the upstage-left corner of the
 * drawing (audience view), so `yFt` grows toward the audience. `rotation` is
 * degrees clockwise, where 0 faces the audience.
 */
export type RiderStageItem = {
  id: string;
  symbol: string;
  label: string;
  xFt: number;
  yFt: number;
  rotation: number;
  scale: number;
  notes?: string;
  /** Set on monitor symbols to bind the item to a mix in `monitorMixes`. */
  monitorMixId?: string;
};

export type RiderInputChannel = {
  id: string;
  channel: number;
  source: string;
  inputType: RiderInputType;
  /** Free text, e.g. "SM58" or "any dynamic". */
  micPreference?: string;
  stand: RiderStandType;
  phantom: boolean;
  providedBy: RiderProvidedBy;
  notes?: string;
  /** Links the channel back to the plot item that produces it. */
  stageItemId?: string;
  /**
   * Stereo L/R source. One strip fed by two adjacent physical inputs on the
   * Wing (`mode:"ST"`), not two linked strips.
   */
  stereo?: boolean;
  /** DCA group label, e.g. "Drums" or "Vox". Empty = no DCA for this input. */
  group?: string;
};

export type RiderMonitorMix = {
  id: string;
  mixNumber: number;
  label: string;
  type: RiderMonitorType;
  /** Number of wedges fed by this mix (ignored for IEM). */
  sends: number;
  notes?: string;
};

export type RiderBacklineItem = {
  id: string;
  label: string;
  quantity: number;
  providedBy: RiderProvidedBy;
  notes?: string;
};

/** Everything a band edits — the persisted rider minus its database envelope. */
export type RiderContent = {
  stage: RiderStage;
  items: RiderStageItem[];
  inputs: RiderInputChannel[];
  monitorMixes: RiderMonitorMix[];
  backline: RiderBacklineItem[];
  performerCount?: number;
  setLengthMinutes?: number;
  powerNotes?: string;
  generalNotes?: string;
  hospitalityNotes?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
};

/** Input to the PDF renderer. */
export type RiderDocumentData = RiderContent & {
  bandName: string;
  riderName: string;
  updatedAtLabel: string;
};

export const INPUT_TYPE_LABELS: Record<RiderInputType, string> = {
  mic: "Mic",
  di: "DI",
  line: "Line",
  wireless: "Wireless",
  playback: "Playback",
};

export const STAND_LABELS: Record<RiderStandType, string> = {
  none: "No stand",
  tall_boom: "Tall boom",
  short_boom: "Short boom",
  straight: "Straight",
  clip: "Clip / mount",
};

/** Short, venue-neutral labels — riders get shared outside Arbor. */
export const PROVIDED_BY_LABELS: Record<RiderProvidedBy, string> = {
  band: "Band",
  arbor: "Production",
  venue: "Venue",
  unknown: "TBD",
};

/** Longer wording for the editor, where there is room to explain. */
export const PROVIDED_BY_EDITOR_LABELS: Record<RiderProvidedBy, string> = {
  band: "Band brings it",
  arbor: "Production provides",
  venue: "Venue provides",
  unknown: "Not sure yet",
};

export const MONITOR_TYPE_LABELS: Record<RiderMonitorType, string> = {
  wedge: "Wedge",
  iem: "In-ear",
  // Kept for legacy mixes; no longer offered in the palette.
  side_fill: "Side fill",
};

/** Monitor types offered when creating/editing mixes (side fill removed). */
export const MONITOR_TYPE_OPTIONS: Array<Exclude<RiderMonitorType, "side_fill">> = [
  "wedge",
  "iem",
];

/**
 * Suggested DCA group labels for the editor. Kept free-text on the input so
 * bands can use any label; these just speed up entry.
 */
export const RIDER_GROUP_SUGGESTIONS = [
  "Drums",
  "Aux Perc",
  "Melody",
  "Vox",
  "Keys",
  "Guitars",
  "Brass",
  "Strings",
  "Playback",
  "FX",
] as const;
