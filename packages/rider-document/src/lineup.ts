/**
 * Start a rider from the band, not from a template: who plays what, a few real
 * choices per person (amp or DI, wired or wireless, who sings), and wedges or
 * in-ears. `buildRiderFromLineup` turns that into a laid-out stage plot with
 * the matching input list, monitor mixes and backline.
 *
 * Everything is placed through `placeSymbol`, so channels, mixes and the
 * player/gear channel pairing behave exactly as if the band had placed it all
 * by hand, and the result is an ordinary rider they keep editing.
 */

import {
  createRiderId,
  emptyRiderContent,
  nextMixNumber,
  placeSymbol,
  renumberInputs,
} from "./content";
import { captureFor, RIDER_SOURCE_FAMILY_ORDER, riderSource } from "./sources";
import type {
  RiderBacklineItem,
  RiderContent,
  RiderInputChannel,
  RiderInputType,
  RiderStage,
} from "./types";

export type LineupRole =
  | "vocals"
  | "guitar"
  | "acoustic"
  | "bass"
  | "keys"
  | "drums"
  | "percussion"
  | "horns"
  | "strings"
  | "dj"
  | "tracks";

export type LineupMember = {
  id: string;
  role: LineupRole;
  /** What the band calls them; labels the plot, channel and mix. */
  name?: string;
  /** Instrumentalists who also sing get a vocal mic and their own channel. */
  sings?: boolean;
  /** Vocals: handheld wireless instead of a wired mic on a stand. */
  wireless?: boolean;
  /** Guitar and bass: mic the amp (true) or take a DI (false). */
  amp?: boolean;
};

export type LineupMonitors = "wedges" | "iem";

export type Lineup = {
  members: LineupMember[];
  monitors: LineupMonitors;
};

type RoleDefinition = {
  label: string;
  /** The performer symbol (also the role's picture in the builder). */
  symbol: string;
  /** Gear placed with them, which takes over their channel when it's miked. */
  gear?: string;
  /** Can this role also sing? (Vocalists already have a mic.) */
  canSing: boolean;
  /** Upstage (drums, keys, percussion) or the front line. */
  row: "upstage" | "front";
  /** Not a person on stage (backing tracks). */
  notPerformer?: boolean;
  /** Plain-words choices the builder offers, for its hint text. */
  hint: string;
};

export const LINEUP_ROLES: Record<LineupRole, RoleDefinition> = {
  vocals: { label: "Vocals", symbol: "vocalist", canSing: false, row: "front", hint: "Wired or wireless mic" },
  guitar: { label: "Electric guitar", symbol: "guitarist", gear: "guitar_amp", canSing: true, row: "front", hint: "Amp miked, or DI" },
  acoustic: { label: "Acoustic guitar", symbol: "guitarist", canSing: true, row: "front", hint: "DI" },
  bass: { label: "Bass", symbol: "bassist", gear: "bass_rig", canSing: true, row: "front", hint: "DI, or amp miked" },
  keys: { label: "Keys", symbol: "keyboardist", gear: "keyboard_rig", canSing: true, row: "upstage", hint: "Stereo DI" },
  drums: { label: "Drums", symbol: "drummer", gear: "drum_kit", canSing: true, row: "upstage", hint: "Kick, snare, two toms, overheads" },
  percussion: { label: "Percussion", symbol: "percussionist", canSing: true, row: "upstage", hint: "One mic to start" },
  horns: { label: "Horns", symbol: "hornist", canSing: false, row: "front", hint: "One mic per player" },
  strings: { label: "Strings", symbol: "string_player", canSing: true, row: "front", hint: "Pickup or mic" },
  dj: { label: "DJ", symbol: "dj", gear: "dj_booth", canSing: false, row: "front", hint: "Stereo from the mixer" },
  tracks: { label: "Backing tracks", symbol: "playback", canSing: false, row: "upstage", notPerformer: true, hint: "Stereo playback" },
};

export const LINEUP_ROLE_ORDER: LineupRole[] = [
  "vocals",
  "guitar",
  "acoustic",
  "bass",
  "keys",
  "drums",
  "percussion",
  "horns",
  "strings",
  "dj",
  "tracks",
];

export function newLineupMember(role: LineupRole): LineupMember {
  return {
    id: createRiderId("member"),
    role,
    ...(role === "vocals" ? { wireless: true } : {}),
    ...(role === "guitar" ? { amp: true } : {}),
    ...(role === "bass" ? { amp: false } : {}),
  };
}

/** Starting lineups, one tap from an empty builder. */
export const LINEUP_PRESETS: Array<{ key: string; name: string; roles: Array<[LineupRole, Partial<LineupMember>?]> }> = [
  {
    key: "full_band",
    name: "Full band",
    roles: [["vocals"], ["guitar", { sings: true }], ["bass", { sings: true }], ["keys"], ["drums"]],
  },
  { key: "power_trio", name: "Power trio", roles: [["guitar", { sings: true }], ["bass", { sings: true }], ["drums"]] },
  { key: "singer_songwriter", name: "Singer-songwriter", roles: [["acoustic", { sings: true }]] },
  { key: "acoustic_duo", name: "Acoustic duo", roles: [["vocals"], ["acoustic", { sings: true }]] },
  { key: "dj", name: "DJ set", roles: [["dj"]] },
];

export function lineupFromPreset(key: string): LineupMember[] {
  const preset = LINEUP_PRESETS.find((entry) => entry.key === key);
  return (preset?.roles ?? []).map(([role, extra]) => ({ ...newLineupMember(role), ...extra }));
}

/** Their name, or the role, numbered when several share it ("Guitar 2"). */
export function memberDisplayNames(members: LineupMember[]): Map<string, string> {
  const counts = new Map<LineupRole, number>();
  for (const member of members) counts.set(member.role, (counts.get(member.role) ?? 0) + 1);
  const seen = new Map<LineupRole, number>();
  const names = new Map<string, string>();
  for (const member of members) {
    const index = (seen.get(member.role) ?? 0) + 1;
    seen.set(member.role, index);
    const label = LINEUP_ROLES[member.role].label;
    names.set(
      member.id,
      member.name?.trim() || ((counts.get(member.role) ?? 0) > 1 ? `${label} ${index}` : label),
    );
  }
  return names;
}

export function lineupPerformerCount(members: LineupMember[]): number {
  return members.filter((member) => !LINEUP_ROLES[member.role].notPerformer).length;
}

function stageFor(members: LineupMember[]): RiderStage {
  const people = lineupPerformerCount(members);
  if (people <= 3) return { widthFt: 16, depthFt: 12 };
  if (people <= 6) return { widthFt: 24, depthFt: 12 };
  return { widthFt: 32, depthFt: 16 };
}

/** Rewrites the channels an item just produced (capture, role) in place. */
function patchChannels(
  content: RiderContent,
  itemId: string,
  patch: (input: RiderInputChannel) => Partial<RiderInputChannel>,
): RiderContent {
  return {
    ...content,
    inputs: content.inputs.map((input) => (input.stageItemId === itemId ? { ...input, ...patch(input) } : input)),
  };
}

function capturePatch(sourceKey: string, inputType: RiderInputType): Partial<RiderInputChannel> {
  const source = riderSource(sourceKey);
  const capture = source ? captureFor(source, inputType) : undefined;
  return capture
    ? { sourceKey, inputType, stand: capture.stand, phantom: capture.phantom }
    : { sourceKey, inputType };
}

/** Spread `count` positions evenly across the stage width. */
function spread(count: number, widthFt: number, marginFt = 2.5): number[] {
  if (count === 0) return [];
  if (count === 1) return [widthFt / 2];
  const usable = widthFt - marginFt * 2;
  return Array.from({ length: count }, (_, index) => marginFt + (usable * index) / (count - 1));
}

/**
 * Channels in the order engineers patch them: drums, bass, guitars, keys,
 * then vocals (lead first), then everything else, keeping each family's own
 * order. Placement order is a layout detail, not a patch list.
 */
function patchOrder(inputs: RiderInputChannel[]): RiderInputChannel[] {
  const rank = (input: RiderInputChannel) => {
    const family = input.sourceKey ? riderSource(input.sourceKey)?.family : undefined;
    const index = family ? RIDER_SOURCE_FAMILY_ORDER.indexOf(family) : -1;
    const familyRank = index === -1 ? RIDER_SOURCE_FAMILY_ORDER.length : index;
    return familyRank * 2 + (input.sourceKey === "vox.bgv" ? 1 : 0);
  };
  return inputs
    .map((input, position) => ({ input, position }))
    .sort((a, b) => rank(a.input) - rank(b.input) || a.position - b.position)
    .map(({ input }) => input);
}

const BACKLINE_FOR: Partial<Record<LineupRole, string>> = {
  drums: "Drum kit",
  guitar: "Guitar amp",
  bass: "Bass amp",
  keys: "Keyboard stand",
  dj: "DJ table",
};

/**
 * Lays the band out the way most stages run: drums upstage centre with keys
 * and percussion beside them, the front line spread across the downstage
 * half with lead vocals in the middle, amps behind their players, a wedge (or
 * an in-ear pack) per person, and power drops in the upstage corners.
 */
export function buildRiderFromLineup(lineup: Lineup): RiderContent {
  const { members } = lineup;
  const stage = stageFor(members);
  const names = memberDisplayNames(members);
  const W = stage.widthFt;
  const D = stage.depthFt;
  const frontY = D * 0.62;
  const upstageY = D * 0.3;

  let content = emptyRiderContent(stage);
  const place = (symbolKey: string, xFt: number, yFt: number, label?: string, rotation?: number) => {
    const result = placeSymbol(content, { symbolKey, xFt, yFt, label, rotation });
    content = result.content;
    return result.itemId;
  };

  const hasDrums = members.some((member) => member.role === "drums");

  // Front line: lead vocals in the middle, bass to stage right, guitars to stage left.
  const front = members.filter((member) => LINEUP_ROLES[member.role].row === "front");
  const vocals = front.filter((member) => member.role === "vocals");
  const others = front.filter((member) => member.role !== "vocals");
  const right = others.filter((member) => member.role === "bass" || member.role === "strings" || member.role === "horns");
  const left = others.filter((member) => !right.includes(member));
  const frontOrder = [...right, ...vocals, ...left];
  const frontX = spread(frontOrder.length, W);

  frontOrder.forEach((member, index) => {
    const role = LINEUP_ROLES[member.role];
    const name = names.get(member.id);
    const x = frontX[index];
    const personId = place(role.symbol, x, frontY, name);

    if (member.role === "vocals" && member.wireless === false) {
      content = patchChannels(content, personId, () => ({ ...capturePatch("vox.lead", "mic"), micPreference: "SM58" }));
    }
    if (member.role === "acoustic") {
      content = patchChannels(content, personId, () => capturePatch("gtr.acoustic", "di"));
    }

    const wantsGear = role.gear && (member.role === "guitar" || member.role === "bass" ? member.amp : true);
    if (wantsGear && role.gear) {
      // Amps sit behind their player, kept clear of a centred drum kit.
      let gearX = x;
      if (hasDrums && Math.abs(gearX - W / 2) < 4.5) gearX = gearX < W / 2 ? W / 2 - 5 : W / 2 + 5;
      const gearId = place(role.gear, gearX, frontY - 2.6, `${name} ${member.role === "dj" ? "booth" : "amp"}`);
      if (member.role === "bass") {
        content = patchChannels(content, gearId, (input) => (input.sourceKey ? capturePatch(input.sourceKey, "mic") : {}));
      }
    } else if (member.role === "guitar" || member.role === "bass") {
      content = patchChannels(content, personId, (input) =>
        input.sourceKey ? capturePatch(input.sourceKey, "di") : {},
      );
    }

    if (member.sings && role.canSing) {
      const micId = place("vocal_mic", x + 1.3, frontY + 1.2, `${name} vocal`);
      content = patchChannels(content, micId, () => ({ sourceKey: "vox.bgv", source: `${name} vocal` }));
    }
  });

  // Upstage: drums centre, keys stage left of them, percussion stage right, tracks in the corner.
  const upstage = members.filter((member) => LINEUP_ROLES[member.role].row === "upstage");
  const upstageSpots: Record<string, number> = {};
  upstage.forEach((member) => {
    const role = LINEUP_ROLES[member.role];
    const name = names.get(member.id);
    if (member.role === "drums") {
      upstageSpots[member.id] = W / 2;
      place("drum_kit", W / 2, upstageY, name);
      if (member.sings) {
        const micId = place("vocal_mic", W / 2 + 3.6, upstageY - 1, `${name} vocal`);
        content = patchChannels(content, micId, () => ({ sourceKey: "vox.bgv", source: `${name} vocal` }));
      }
      return;
    }
    if (member.role === "tracks") {
      place("playback", 2, 1.4, name);
      return;
    }
    const x = member.role === "keys" ? (hasDrums ? W / 2 + 5.5 : W * 0.7) : hasDrums ? W / 2 - 5.5 : W * 0.3;
    upstageSpots[member.id] = x;
    place(role.symbol, x, upstageY - 1.4, name);
    if (role.gear) place(role.gear, x, upstageY + 0.6, name);
    if (member.sings && role.canSing) {
      const micId = place("vocal_mic", x - 2.2, upstageY + 0.4, `${name} vocal`);
      content = patchChannels(content, micId, () => ({ sourceKey: "vox.bgv", source: `${name} vocal` }));
    }
  });

  // Monitors. In-ears: a pack and a mix per person. Wedges: kept light,
  // because every wedge is a cable, a send and a mix to dial in. At most three
  // across the front (stage right, centre, stage left; one per zone anyone
  // stands in) and one at the drums, each on its own mix. Upstage players
  // (keys, percussion) share their zone's front wedge.
  const people = members.filter((member) => !LINEUP_ROLES[member.role].notPerformer);
  type Zone = "centre" | "right" | "left" | "drums";
  const zoneMixes = new Map<Zone, { id: string; names: string[]; wedges: number }>();
  const zoneOf = (x: number): Zone => (x < W / 3 ? "right" : x > (W * 2) / 3 ? "left" : "centre");
  const zoneCentre: Record<Exclude<Zone, "drums">, number> = { right: W / 6, centre: W / 2, left: (W * 5) / 6 };
  const frontXs = new Map<Zone, number[]>();

  people.forEach((member) => {
    const name = names.get(member.id) ?? LINEUP_ROLES[member.role].label;
    const frontIndex = frontOrder.indexOf(member);
    if (lineup.monitors === "iem") {
      const x = frontIndex >= 0 ? frontX[frontIndex] - 1.6 : (upstageSpots[member.id] ?? W / 2) - 2;
      const y = frontIndex >= 0 ? frontY + 0.4 : upstageY - 1.4;
      place("iem", x, y, name);
      return;
    }
    const x = frontIndex >= 0 ? frontX[frontIndex] : (upstageSpots[member.id] ?? W / 2);
    const zone: Zone = member.role === "drums" ? "drums" : zoneOf(x);
    const mix = zoneMixes.get(zone) ?? { id: createRiderId("mix"), names: [], wedges: 1 };
    zoneMixes.set(zone, mix);
    mix.names.push(name);
    if (frontIndex >= 0) frontXs.set(zone, [...(frontXs.get(zone) ?? []), x]);
  });

  const placeWedge = (mixId: string, x: number, y: number, rotation?: number) => {
    const result = placeSymbol(content, { symbolKey: "wedge", xFt: x, yFt: y, rotation, withoutLinkedRows: true });
    content = {
      ...result.content,
      items: result.content.items.map((item) =>
        item.id === result.itemId ? { ...item, monitorMixId: mixId } : item,
      ),
    };
  };
  for (const [zone, mix] of zoneMixes) {
    if (zone === "drums") {
      const kitX = W / 2;
      placeWedge(mix.id, kitX - 4.5, upstageY + 2.4, 35);
      continue;
    }
    // In front of the people it serves, or the zone's middle when only upstage players use it.
    const xs = frontXs.get(zone);
    const x = xs?.length ? xs.reduce((sum, value) => sum + value, 0) / xs.length : zoneCentre[zone];
    placeWedge(mix.id, x, D - 1.2);
  }

  if (zoneMixes.size > 0) {
    const order: Zone[] = ["centre", "right", "left", "drums"];
    const numbered = order
      .filter((zone) => zoneMixes.has(zone))
      .map((zone, index) => ({ zone, mixNumber: nextMixNumber(content.monitorMixes) + index, ...zoneMixes.get(zone)! }));
    const numberById = new Map(numbered.map((mix) => [mix.id, mix.mixNumber]));
    content = {
      ...content,
      items: content.items.map((item) =>
        item.monitorMixId && numberById.has(item.monitorMixId)
          ? { ...item, label: `Mix ${numberById.get(item.monitorMixId)}` }
          : item,
      ),
      monitorMixes: [
        ...content.monitorMixes,
        ...numbered.map((mix) => ({
          id: mix.id,
          mixNumber: mix.mixNumber,
          label: mix.names.join(" · "),
          type: "wedge" as const,
          sends: mix.wedges,
        })),
      ],
    };
  }

  if (people.length > 0) {
    place("power_drop", 1, 1);
    place("power_drop", W - 1, 1);
  }

  const backline: RiderBacklineItem[] = members.flatMap((member) => {
    const label = BACKLINE_FOR[member.role];
    if (!label) return [];
    if ((member.role === "guitar" || member.role === "bass") && !member.amp) return [];
    return [{ id: createRiderId("bl"), label, quantity: 1, providedBy: "unknown" as const }];
  });

  return {
    ...content,
    inputs: renumberInputs(patchOrder(content.inputs)),
    backline,
    performerCount: lineupPerformerCount(members),
  };
}
