import {
  RIDER_SOURCE_FAMILY_LABELS,
  riderSource,
  type RiderSourceFamily,
} from "@arbor/rider-document";
import type { RiderInputChannel } from "@arbor/rider-document";

/**
 * Desk groups, derived from what is actually on the bill — not a fixed
 * taxonomy. A group only exists when a rider puts channels in it, so one vocal
 * gets no Vocals DCA, and a playback-heavy set gets its own Tracks DCA.
 */
export type DeskGroup = {
  /** Stable id (the source family it rolls up). */
  id: RiderSourceFamily;
  /** DCA name, e.g. "Vocals", "Tracks". */
  label: string;
  /** Wing DCA slot (1-based), assigned in order of first appearance. */
  dca: number;
  /** Mute groups the group subscribes to. */
  muteGroups: number[];
};

/**
 * Order groups appear on the desk. Voices and the kit lead; the long tail
 * (percussion, winds, strings) trail; tracks and utility come last.
 */
const GROUP_ORDER: RiderSourceFamily[] = [
  "vocals",
  "guitar",
  "bass",
  "keys",
  "drums",
  "percussion",
  "winds",
  "strings",
  "playback",
  "utility",
];

/** Short, desk-friendly DCA names. */
const GROUP_DCA_LABEL: Partial<Record<RiderSourceFamily, string>> = {
  playback: "Tracks",
};

const MUTE_GROUPS_BY_FAMILY: Partial<Record<RiderSourceFamily, number[]>> = {
  vocals: [1, 2],
  guitar: [1, 3],
  bass: [1, 3],
  keys: [1, 4],
  drums: [1, 5],
};

/** The source family a channel belongs to (unmapped → utility). */
export function sourceFamilyFor(input: RiderInputChannel): RiderSourceFamily {
  const source = input.sourceKey ? riderSource(input.sourceKey) : undefined;
  return source?.family ?? "utility";
}

/**
 * The vocal FX group: a DCA the reverb/delay returns sit under, so one fader
 * rides all the vocal effects together. It is not a family — no channels feed
 * it, only the returns — so it is kept separate from the channel DCAs and takes
 * the last slot, never colliding with a family group.
 */
export type FxDca = {
  name: string;
  /** Wing DCA slot. */
  dca: number;
  /** Buses that make up the group (the vocal FX returns). */
  buses: number[];
};

export const VOCAL_FX_DCA_SLOT = 8;
export const VOCAL_FX_DCA_NAME = "Vox FX DCA";

/**
 * The named reverb returns the blueprint wires up, in bus order. These are the
 * vocal FX buses: the Vox FX DCA rides them and USER2 exposes them on faders.
 */
export const VOCAL_FX_BUSES = [13, 14] as const;

/** The vocal FX DCA, present only when the desk has vocal FX returns. */
export function vocalFxDcaFor(vocalFxBuses: number[]): FxDca | null {
  if (vocalFxBuses.length === 0) return null;
  return {
    name: VOCAL_FX_DCA_NAME,
    dca: VOCAL_FX_DCA_SLOT,
    buses: vocalFxBuses,
  };
}

/**
 * Active desk groups for the night, in order, each with a DCA slot. Only groups
 * a rider actually uses are included; the first one still takes DCA 1 so the
 * numbering stays dense.
 */
export function deskGroupsFor(inputs: RiderInputChannel[]): DeskGroup[] {
  const present = new Set<RiderSourceFamily>();
  for (const input of inputs) present.add(sourceFamilyFor(input));

  const groups: DeskGroup[] = [];
  let nextDca = 1;
  for (const family of GROUP_ORDER) {
    if (!present.has(family)) continue;
    groups.push({
      id: family,
      label: GROUP_DCA_LABEL[family] ?? RIDER_SOURCE_FAMILY_LABELS[family],
      dca: nextDca,
      muteGroups: MUTE_GROUPS_BY_FAMILY[family] ?? [],
    });
    nextDca += 1;
  }
  return groups;
}

/**
 * The Wing `tags` string for a channel in a group: its DCA plus any mute groups
 * the group subscribes to ("#D3,#M1,#M3").
 */
export function tagsForGroup(group: DeskGroup | undefined): string {
  if (!group) return "";
  const parts = [`#D${group.dca}`];
  for (const mute of group.muteGroups) parts.push(`#M${mute}`);
  return parts.join(",");
}

/**
 * How a group is laid out on the surface.
 *
 * - `explode`: always show each channel beside the DCA (vocals — the mics an
 *   engineer rides all set).
 * - `collapse`: one DCA only, never spread (drums — the kit is handled as one).
 * - `space`: show the DCA, and its channels only if faders remain (the melodic
 *   frontline and tracks).
 */
export type GroupLayout = "explode" | "collapse" | "space";

export function groupLayoutFor(id: RiderSourceFamily): GroupLayout {
  if (id === "vocals") return "explode";
  if (id === "drums") return "collapse";
  return "space";
}

/**
 * The melodic frontline that collapses into a single "Melody" DCA when the
 * individual groups do not fit. Tracks/playback and utility are deliberately
 * not melodic — you cue those independently of the band's level.
 */
export const MELODY_FAMILIES: RiderSourceFamily[] = [
  "guitar",
  "bass",
  "keys",
  "strings",
  "winds",
  "percussion",
];
