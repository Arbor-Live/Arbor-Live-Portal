import type {
  RiderInputChannel,
  RiderMonitorMix,
  RiderBacklineItem,
  RiderStage,
  RiderStageItem,
} from "@arbor/rider-document";

/** One band’s rider inputs as consumed by show-file generation. */
export type ShowBandInput = {
  bandName: string;
  /** Safe filename stem (no extension). */
  fileStem: string;
  role: "headliner" | "support" | "other";
  inputs: RiderInputChannel[];
  /** Optional plot used when building the night rider PDF (prefer headliner). */
  stage?: RiderStage;
  items?: RiderStageItem[];
  monitorMixes?: RiderMonitorMix[];
  backline?: RiderBacklineItem[];
};

/**
 * Template AES50 A port families. Matches Default.snap organization:
 * Vox 1–4 · Guitar/Bass/Flex/Keys · Kick/Snare/Toms/OH.
 */
export type SlotFamily =
  | "vox"
  | "guitar"
  | "bass"
  | "flex"
  | "keys"
  | "kick"
  | "snare"
  | "tom"
  | "oh";

export type PortAssignment = {
  port: number;
  /** Event-wide snake label (stable all night — e.g. "Vox 1", not singer names). */
  label: string;
  /** Default.snap role name for this port (always set). */
  templateLabel: string;
  family: SlotFamily;
  stereo: boolean;
  /** True only for overheads (A.15–A.16). */
  phantom: boolean;
  /** True when the night consensus capture is DI (shown as a faceplate tag). */
  di: boolean;
  /**
   * Band fileStem → stable strip name when live. Same as `label` — we do not
   * rename for different singers on the same vocal mic.
   */
  bandLabels: Record<string, string>;
  /**
   * Band fileStem → instrument identity for changeover diffs.
   * Family for fixed roles; sourceKey for flex overflow.
   */
  bandInstruments: Record<string, string>;
  /** Band fileStem → human detail name when the instrument actually differs (yellow). */
  bandDetailLabels: Record<string, string>;
  /** Band fileStem → capture type for DI/mic tags. */
  bandInputTypes: Record<string, string>;
};

export type EventPatchAllocation = {
  ports: PortAssignment[];
  warnings: string[];
  /** Bands in show order (support → other → headliner). */
  bandOrder: Array<{ bandName: string; fileStem: string }>;
};

export type StageBoxPort = {
  port: number;
  aes50: string;
  label: string;
  templateLabel: string;
  family: SlotFamily;
  stereo: boolean;
  phantom: boolean;
  di: boolean;
  usedBy: string[];
  /**
   * - same: stays as-is (green)
   * - mute: patched but muted this set (strikethrough)
   * - physical: needs a real stage move / instrument swap (yellow)
   */
  change?: "same" | "mute" | "physical";
  /** Prior instrument detail when `change === "physical"`. */
  previousLabel?: string;
};

export type StageBoxDiagramModel = {
  title: string;
  subtitle: string;
  ports: StageBoxPort[];
  warnings: string[];
};

export type PatchDiffStep = {
  bandName: string;
  fileStem: string;
  /** What this step is compared against. */
  comparedTo: string;
  /** Ports that differ from the baseline; empty if identical. */
  changes: StageBoxPort[];
  /** Full 16-port state for this band (live labels + muted snake). */
  ports: StageBoxPort[];
};

export type PatchDiffPlan = {
  /** Night-wide physical snake (Default.snap layout). */
  night: StageBoxDiagramModel;
  /** Per-band diffs (first vs night mute/live; later vs previous set). */
  steps: PatchDiffStep[];
};

/** Minimal Wing snap shape we read/write. Full template is opaque JSON. */
export type WingSnap = {
  type: string;
  ae_data: {
    io: {
      in: {
        A: Record<
          string,
          {
            mode?: string;
            name?: string;
            icon?: number;
            col?: number;
            tags?: string;
            g?: number;
            vph?: boolean;
            mute?: boolean;
            [key: string]: unknown;
          }
        >;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    ch: Record<
      string,
      {
        name?: string;
        tags?: string;
        mute?: boolean;
        in?: {
          conn?: { grp?: string; in?: number; altgrp?: string; altin?: number };
          [key: string]: unknown;
        };
        [key: string]: unknown;
      }
    >;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type ShowFileScene = {
  name: string;
  skip: boolean;
  link: boolean;
  type: "SNAP";
  info: string;
  tag: string;
  midi_tx: string;
  file: string;
};

export type ShowFileDocument = {
  type: "showfile.1";
  creator_fw: string;
  creator_sn: string;
  creator_model: string;
  creator_version: string;
  creator_name: string;
  created: string;
  scenes: { count: number } & Record<string, ShowFileScene | number>;
};
