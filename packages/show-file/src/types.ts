import type {
  RiderInputChannel,
  RiderMonitorMix,
  RiderBacklineItem,
  RiderSourceFamily,
  RiderStage,
  RiderStageItem,
} from "@arbor/rider-document";
import type { DeskGroup, FxDca } from "./groups";
import type { LayerPage } from "./layers";

/**
 * Which console family a show package is built for.
 * - `wing`  — Behringer WING `.show` + `.snap` (Arbor’s native rig).
 * - `x32`   — Behringer X32 / Midas M32 `.scn` scene.
 * - `xair`  — Behringer X Air / Midas MR `.scn` scene (XR12/16/18).
 */
export type ShowTarget = "wing" | "x32" | "xair";

/** One channel as it lands on a target desk, for the pre-download report. */
export type ConsolePreviewRow = {
  /** Console channel, or “9+10” for a linked stereo pair. */
  span: string;
  name: string;
  /** Target socket for the input, e.g. “A.9” (WING) · “A9” (X32) · “In09”. */
  patch: string;
  stereo: boolean;
  phantom: boolean;
  /** Bands that use this channel tonight. */
  bands: string[];
};

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

/** Physical stage box. A = AES50 A (always used), B = the second snake. */
export type SnakeId = "A" | "B";

/** What an engineer picks a snake for. Drums always move as one block. */
export type SnakeGroup = "vox" | "guitar" | "bass" | "flex" | "keys" | "drums";

/** Per-event choice of how the two snakes are used. */
export type PatchPlan = {
  /** Second stage box patched tonight. */
  secondSnake: boolean;
  /**
   * Legacy per-group snake picks. Placement is deterministic now (families pack
   * box A, then overflow to B), so this is accepted for stored plans but unused.
   */
  sides?: Partial<Record<SnakeGroup, SnakeId>>;
  /**
   * Scope band scenes down to what changes (default). Off makes every scene a
   * full recall — the escape hatch if a desk ignores the scope block.
   */
  scopeScenes?: boolean;
};

export type PortAssignment = {
  snake: SnakeId;
  port: number;
  /**
   * Console channel strip patched to this port, or null for the right half of
   * a stereo pair (it rides the left socket's strip).
   */
  strip: number | null;
  /** Rider's name for this input ("Kick In", "OH SR") — what goes on the desk. */
  label: string;
  /** Bucket the input sits in, for the faceplate tags and DCA rollup. */
  family: SlotFamily;
  stereo: boolean;
  /** True only for overheads; 48V never reaches anything else. */
  phantom: boolean;
  /** True when the majority capture for this input is DI (faceplate tag). */
  di: boolean;
  /**
   * Band fileStem → that band's channel name for this row. The night label is
   * the anchor band's; a band whose input differs shows its own name.
   */
  bandLabels: Record<string, string>;
  /** Band fileStem → instrument identity (drives the changeover diff). */
  bandInstruments: Record<string, string>;
  /** Band fileStem → human detail name (yellow changeover label). */
  bandDetailLabels: Record<string, string>;
  /** Band fileStem → capture type for DI/mic tags. */
  bandInputTypes: Record<string, string>;
  /**
   * The one sourceKey every band uses this input for, or null when it changes
   * across the bill. Lets the brief tag a role only when the night agrees.
   */
  nightSourceKey: string | null;
  /** DCA/mute tags to write on the strip ("#D3,#M1,#M3"). */
  tags: string;
  /** Desk-group id ("vocals", "playback", …) this input rolls up into. */
  groupId: RiderSourceFamily;
  /** False when no band plugs anything in here — socket left unpatched. */
  used: boolean;
};

export type EventPatchAllocation = {
  ports: PortAssignment[];
  warnings: string[];
  /** Bands in show order (support → other → headliner). */
  bandOrder: Array<{ bandName: string; fileStem: string }>;
  /** Stage boxes patched tonight, in order. */
  snakes: SnakeId[];
  /** Desk groups that exist for this bill (only where channels are present). */
  groups: DeskGroup[];
  /** The vocal FX DCA (rides the reverb returns), or null when none. */
  fxDca: FxDca | null;
  /** The Melody DCA when the melodic frontline is compressed, else null. */
  melodyDca: FxDca | null;
  /** Fader-bank pages for the surface, in the order an operator reads them. */
  layers: LayerPage[];
  /**
   * Whether the whole bill fits on a single stage box. False means the crew
   * must either drop an input or run two snakes — one snake is not an option.
   */
  fitsOneBox: boolean;
};

export type StageBoxPort = {
  snake: SnakeId;
  port: number;
  strip: number | null;
  /** Absolute socket, e.g. "A.23" — unique across both boxes. */
  aes50: string;
  /** Stage-box reading, e.g. "7 (23)". See `portLabel()`. */
  portLabel: string;
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
  /** Only ports something plugs into tonight — spares are listed separately. */
  ports: StageBoxPort[];
  /** AES50 labels ("A.8") left unpatched tonight. */
  spare: string[];
  snakes: SnakeId[];
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

export type WingSocket = {
  mode?: string;
  name?: string;
  icon?: number;
  col?: number;
  tags?: string;
  g?: number;
  vph?: boolean;
  mute?: boolean;
  [key: string]: unknown;
};

/**
 * Recall scope, as a `snapshot.11` desk writes it: one character per item,
 * `+` in scope and a space out of scope. Anything out of scope keeps whatever
 * the console already has — that is how soundcheck gain and EQ survive a scene
 * change. Same string encoding as `ce_data.safes`.
 */
export type WingScopes = {
  /** 40 console channels. */
  ch: string;
  aux: string;
  bus: string;
  main: string;
  mtx: string;
  dca: string;
  /** Mute groups. */
  mute: string;
  fx: string;
  /** Input sockets per group — `A` is the 48 AES50 A preamps. */
  source: Record<string, string>;
  output: Record<string, string>;
  area: Record<string, string>;
  custom: string;
  setup: string;
  /** Which parameter groups of an in-scope channel recall (Conn, EQ, Fader…). */
  contents: string;
  mainsend: string;
  bussend: string;
};

/** Minimal Wing snap shape we read/write. Full template is opaque JSON. */
export type WingSnap = {
  type: string;
  scopes?: WingScopes;
  ae_data: {
    io: {
      in: {
        A: Record<string, WingSocket>;
        B?: Record<string, WingSocket>;
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
    /** FX engines by slot number ("1".."16"); each has a `mdl`. */
    fx?: Record<string, { mdl?: string; [key: string]: unknown }>;
    /** DCAs by slot number. */
    dca?: Record<string, Record<string, unknown>>;
    /** Buses by slot number. */
    bus?: Record<
      string,
      { name?: string; preins?: unknown; postins?: unknown; [key: string]: unknown }
    >;
    [key: string]: unknown;
  };
  /** Surface fader assignments (layers/banks). We write our pages into USER1. */
  ce_data?: {
    layer?: {
      L?: Record<string, Record<string, unknown>>;
      [key: string]: unknown;
    };
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
