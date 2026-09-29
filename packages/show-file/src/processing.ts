import { riderSource } from "@arbor/rider-document";
import type { SlotFamily } from "./types";
import type { RiderInputChannel } from "@arbor/rider-document";

/**
 * Per-family channel processing defaults.
 *
 * A rebuilt patch should not inherit whatever the blueprint happened to leave
 * on strip N (that EQ belonged to an FX return). Instead every channel gets its
 * family's default: gate/HPF/dynamics/EQ on where it helps, and explicitly OFF
 * where it does not, so nothing stale rides along. The model ids and parameter
 * shapes come from the blueprint so the desk accepts them.
 */

/** The slice of a channel we write. Values are the blueprint's own shapes. */
export type ChannelProcessing = {
  /** High-pass / low-pass filter block (`flt`). */
  filter: { lc: boolean; lcf: number; lcs: string; hc: boolean; hcf: number; hcs: string };
  /** Gate/expander (`gate`). */
  gate: { on: boolean; thr: number; range: number; att: number; hld: number; rel: number };
  /** Compressor (`dyn`). */
  dyn: { on: boolean; thr: number; ratio: number; knee: number; att: number; rel: number };
  /** EQ (4-band `eq`). Gains are flattened; the engineer shapes the curve. */
  eq: {
    on: boolean;
    lg: number;
    "1g": number;
    "2g": number;
    "3g": number;
    "4g": number;
    hg: number;
  };
};

/** A workable high-pass on almost everything acoustic. */
const HPF = { lc: true, lcf: 80, lcs: "24", hc: false, hcf: 10018, hcs: "12" };
const NO_FILTER = { lc: false, lcf: 80, lcs: "24", hc: false, hcf: 10018, hcs: "12" };
const GATE_OFF = { on: false, thr: -40, range: 40, att: 10, hld: 10, rel: 200 };
const GATE_ON = { on: true, thr: -35, range: 40, att: 5, hld: 100, rel: 200 };
const COMP_OFF = { on: false, thr: -18, ratio: 3, knee: 5, att: 10, rel: 150 };
const COMP_ON = { on: true, thr: -18, ratio: 3, knee: 5, att: 10, rel: 150 };
/**
 * All EQ band gains at unity. The preset turns the block on/off, but the gains
 * are always written flat, never the blueprint's leftover curve (a channel that
 * once held an FX return keeps that EQ otherwise).
 */
const EQ_FLAT = { lg: 0, "1g": 0, "2g": 0, "3g": 0, "4g": 0, hg: 0 } as const;
const EQ_OFF = { on: false, ...EQ_FLAT };
const EQ_ON = { on: true, ...EQ_FLAT };

/**
 * The processing a family gets by default. Gate belongs on drums (toms and
 * kick especially); vocals get a high-pass and gentle compression; DI and
 * playback stay clean so nothing pumps a backing track.
 */
export function processingForFamily(family: SlotFamily): ChannelProcessing {
  switch (family) {
    case "kick":
      return { filter: HPF, gate: GATE_ON, dyn: COMP_ON, eq: EQ_ON };
    case "snare":
      return { filter: HPF, gate: GATE_ON, dyn: COMP_ON, eq: EQ_ON };
    case "tom":
      return { filter: HPF, gate: GATE_ON, dyn: COMP_ON, eq: EQ_ON };
    case "oh":
      return { filter: HPF, gate: GATE_OFF, dyn: COMP_OFF, eq: EQ_ON };
    case "vox":
      return { filter: HPF, gate: GATE_OFF, dyn: COMP_ON, eq: EQ_OFF };
    case "guitar":
    case "bass":
    case "flex":
    case "keys":
      return { filter: HPF, gate: GATE_OFF, dyn: COMP_OFF, eq: EQ_OFF };
    default:
      // Playback / line / anything unmapped stays clean.
      return { filter: NO_FILTER, gate: GATE_OFF, dyn: COMP_OFF, eq: EQ_OFF };
  }
}

export function processingForInput(input: RiderInputChannel, family: SlotFamily) {
  // A rider asking explicitly for phantom or a specific capture does not change
  // the family default today; kept as a seam for future per-source tuning.
  void riderSource(input.sourceKey ?? "");
  return processingForFamily(family);
}
