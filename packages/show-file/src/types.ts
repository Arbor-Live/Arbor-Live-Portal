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

/** Physical stage box. A = AES50 A (always used), B = the second snake. */
export type SnakeId = "A" | "B";

/** What an engineer picks a snake for. Drums always move as one block. */
export type SnakeGroup = "vox" | "guitar" | "bass" | "flex" | "keys" | "drums";

/** Per-event choice of how the two snakes are used. */
export type PatchPlan = {
  /** Second stage box patched tonight. */
  secondSnake: boolean;
  /** Group → snake. Anything unset stays on A. */
  sides: Partial<Record<SnakeGroup, SnakeId>>;
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
   * Console channel strip patched to this port, or null when the port has no
   * strip of its own (right half of a stereo pair, which rides the left one).
   */
  strip: number | null;
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
  /** False when no band on the bill plugs anything in here — left unpatched. */
  used: boolean;
};

export type EventPatchAllocation = {
  ports: PortAssignment[];
  warnings: string[];
  /** Bands in show order (support → other → headliner). */
  bandOrder: Array<{ bandName: string; fileStem: string }>;
  /** Stage boxes patched tonight, in order. */
  snakes: SnakeId[];
  /** Effective group → snake map after any overflow moves. */
  sides: Record<SnakeGroup, SnakeId>;
};

export type StageBoxPort = {
  snake: SnakeId;
  port: number;
  strip: number | null;
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
