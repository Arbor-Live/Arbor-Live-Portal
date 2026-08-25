import type { RiderInputChannel } from "@arbor/rider-document";
import { displayLabel, familyForInput, inputSortKey } from "./family";
import {
  MID_OVERFLOW_PORTS,
  SNAKE_GROUPS,
  SNAKE_SHORT_LABEL,
  SNAKE_STRIPS,
  TEMPLATE_SLOTS,
  snakeGroupForFamily,
  stripFor,
} from "./slots";
import type {
  EventPatchAllocation,
  PatchPlan,
  PortAssignment,
  ShowBandInput,
  SlotFamily,
  SnakeGroup,
  SnakeId,
} from "./types";

type Classified = {
  input: RiderInputChannel;
  family: SlotFamily;
};

type BandInputs = Map<string, Classified[]>;

/** Ports on one stage box. */
const BOX_CAPACITY = 16;

/** Groups we are willing to shove onto the other snake, least disruptive first. */
const MOVABLE_ORDER: SnakeGroup[] = ["keys", "flex", "guitar", "bass", "vox"];

export const DEFAULT_PATCH_PLAN: PatchPlan = { secondSnake: false, sides: {} };

/**
 * Night-stable snake locked to Default.snap organization:
 * Vox 1–4 · mid (gtr/bass/flex/keys) · drums 11–16.
 *
 * - Overheads always ST on 15–16; only OH gets 48V.
 * - Keys prefer ST on 9–10; break to mono on 9 if a mid overflow needs the slot.
 * - Physical patch is the union across bands; snaps only rename / mute.
 * - With two snakes each box runs the same layout, one group per box, so
 *   "Flex1 is port 7" stays true whichever side you are standing on.
 */
export function allocateEventPatch(
  bands: ShowBandInput[],
  plan: PatchPlan = DEFAULT_PATCH_PLAN,
): EventPatchAllocation {
  const warnings: string[] = [];
  const orderedBands = sortBandsForShow(bands);

  const byBand: BandInputs = new Map();
  for (const band of orderedBands) {
    const classified: Classified[] = [];
    for (const input of band.inputs) {
      if (!input.sourceKey) {
        warnings.push(
          `${band.bandName}: "${input.source || `Ch ${input.channel}`}" has no sourceKey — placed in flex/overflow.`,
        );
      }
      classified.push({ input, family: familyForInput(input) });
    }
    classified.sort((a, b) => inputSortKey(a.input).localeCompare(inputSortKey(b.input)));
    byBand.set(band.fileStem, classified);
  }

  const demand = familyDemand(orderedBands, byBand);
  const snakes: SnakeId[] = plan.secondSnake ? ["A", "B"] : ["A"];
  const sides = resolveSides(demand, plan, snakes, warnings);

  const ports: PortAssignment[] = [];
  for (const snake of snakes) {
    ports.push(...allocateBox(snake, orderedBands, byBand, sides, warnings));
  }

  return {
    ports,
    warnings,
    bandOrder: orderedBands.map((b) => ({ bandName: b.bandName, fileStem: b.fileStem })),
    snakes,
    sides,
  };
}

/** Highest simultaneous count of each family across the bill. */
function familyDemand(
  bands: ShowBandInput[],
  byBand: BandInputs,
): Map<SlotFamily, number> {
  const demand = new Map<SlotFamily, number>();
  for (const band of bands) {
    const counts = new Map<SlotFamily, number>();
    for (const item of byBand.get(band.fileStem) ?? []) {
      counts.set(item.family, (counts.get(item.family) ?? 0) + 1);
    }
    for (const [family, count] of counts) {
      demand.set(family, Math.max(demand.get(family) ?? 0, count));
    }
  }
  return demand;
}

/** Ports a family eats on its box (keys/OH claim a stereo pair up front). */
function portCost(family: SlotFamily, count: number): number {
  if (count <= 0) return 0;
  if (family === "oh") return 2;
  if (family === "keys") return count + 1;
  return count;
}

function groupCost(
  group: SnakeGroup,
  demand: Map<SlotFamily, number>,
): number {
  let total = 0;
  for (const [family, count] of demand) {
    if (snakeGroupForFamily(family) === group) total += portCost(family, count);
  }
  return total;
}

/**
 * Resolve the engineer's per-group snake picks, then shove groups across when a
 * box overflows. Drums never move automatically — the kit is the one thing that
 * should stay put all night.
 */
function resolveSides(
  demand: Map<SlotFamily, number>,
  plan: PatchPlan,
  snakes: SnakeId[],
  warnings: string[],
): Record<SnakeGroup, SnakeId> {
  const sides = {} as Record<SnakeGroup, SnakeId>;
  for (const group of SNAKE_GROUPS) {
    const picked = plan.sides[group];
    sides[group] = snakes.includes(picked ?? "A") ? (picked ?? "A") : "A";
  }
  if (snakes.length < 2) return sides;

  const load = (snake: SnakeId) =>
    SNAKE_GROUPS.filter((g) => sides[g] === snake).reduce(
      (sum, g) => sum + groupCost(g, demand),
      0,
    );

  for (const from of snakes) {
    const to: SnakeId = from === "A" ? "B" : "A";
    while (load(from) > BOX_CAPACITY) {
      const candidate = MOVABLE_ORDER.find(
        (group) =>
          sides[group] === from &&
          groupCost(group, demand) > 0 &&
          load(to) + groupCost(group, demand) <= BOX_CAPACITY,
      );
      if (!candidate) break;
      sides[candidate] = to;
      warnings.push(
        `${SNAKE_SHORT_LABEL[from]} is full — moved ${candidate} to ${SNAKE_SHORT_LABEL[to]}.`,
      );
    }
  }

  return sides;
}

/** One 16-port stage box: reserve ports, then flag which band lights each up. */
function allocateBox(
  snake: SnakeId,
  orderedBands: ShowBandInput[],
  byBand: BandInputs,
  sides: Record<SnakeGroup, SnakeId>,
  warnings: string[],
): PortAssignment[] {
  const onThisBox = (family: SlotFamily) =>
    sides[snakeGroupForFamily(family)] === snake;

  const maxOf = (family: SlotFamily) =>
    onThisBox(family)
      ? Math.max(
          0,
          ...orderedBands.map(
            (band) =>
              (byBand.get(band.fileStem) ?? []).filter((c) => c.family === family)
                .length,
          ),
        )
      : 0;

  const maxVox = Math.min(4, maxOf("vox"));
  const maxKick = Math.min(1, maxOf("kick"));
  const maxSnare = Math.min(1, maxOf("snare"));
  const maxTom = Math.min(2, maxOf("tom"));
  const maxOh = Math.min(1, maxOf("oh"));
  const maxGuitar = maxOf("guitar");
  const maxBass = maxOf("bass");
  const maxKeys = maxOf("keys");
  const maxFlex = maxOf("flex");

  // Port → family claim list (ordered). Stereo OH/Keys claim the odd port only.
  const reserved = new Map<SlotFamily, number[]>();
  const occupied = new Set<number>();

  const claim = (family: SlotFamily, port: number, stereo = false) => {
    if (occupied.has(port)) return false;
    if (stereo && occupied.has(port + 1)) return false;
    occupied.add(port);
    if (stereo) occupied.add(port + 1);
    const list = reserved.get(family) ?? [];
    list.push(port);
    reserved.set(family, list);
    return true;
  };

  // 1) Vox always first 4
  for (let i = 0; i < maxVox; i++) claim("vox", i + 1);

  // 2) Drums always last block
  if (maxKick) claim("kick", 11);
  if (maxSnare) claim("snare", 12);
  for (let i = 0; i < maxTom; i++) claim("tom", 13 + i);
  if (maxOh) claim("oh", 15, true); // 15–16 ST + 48V

  // 3) Mid: guitar / bass / flex on home ports
  const guitarPorts: number[] = [];
  if (maxGuitar >= 1 && claim("guitar", 5)) guitarPorts.push(5);
  const bassPorts: number[] = [];
  if (maxBass >= 1 && claim("bass", 6)) bassPorts.push(6);

  const flexPorts: number[] = [];
  for (const port of [7, 8] as const) {
    if (flexPorts.length >= maxFlex) break;
    if (claim("flex", port)) flexPorts.push(port);
  }

  // Extra guitar / bass / flex / overflow → mid. Keys prefer ST on 9–10;
  // break to mono on 9 when that frees A.10 for a needed mono.
  let keysStereo = maxKeys > 0;
  let keysPorts: number[] = [];

  const midOverflowNeeded =
    Math.max(0, maxGuitar - guitarPorts.length) +
    Math.max(0, maxBass - bassPorts.length) +
    Math.max(0, maxFlex - flexPorts.length) +
    Math.max(0, maxOf("tom") - maxTom) +
    Math.max(0, maxOf("kick") - maxKick) +
    Math.max(0, maxOf("snare") - maxSnare) +
    Math.max(0, maxOf("vox") - maxVox) +
    Math.max(0, maxKeys - 1);

  if (maxKeys > 0) {
    const freeIfStereo = MID_OVERFLOW_PORTS.filter(
      (p) => p !== 9 && p !== 10 && !occupied.has(p),
    ).length;
    if (midOverflowNeeded > freeIfStereo) {
      keysStereo = false;
      warnings.push(
        `Keys set to mono on ${snake}.9 so ${snake}.10 can cover an extra mid input.`,
      );
    }
    if (keysStereo) {
      if (claim("keys", 9, true)) keysPorts = [9];
    } else if (claim("keys", 9, false)) {
      keysPorts = [9];
    }
  }

  // Spill remaining mono demand into leftover mid ports (incl. A.10 if keys broken)
  const spillFamilies: Array<{ family: SlotFamily; remaining: number }> = [
    { family: "guitar", remaining: Math.max(0, maxGuitar - guitarPorts.length) },
    { family: "bass", remaining: Math.max(0, maxBass - bassPorts.length) },
    { family: "flex", remaining: Math.max(0, maxFlex - flexPorts.length) },
    { family: "tom", remaining: Math.max(0, maxOf("tom") - maxTom) },
    { family: "kick", remaining: Math.max(0, maxOf("kick") - maxKick) },
    { family: "snare", remaining: Math.max(0, maxOf("snare") - maxSnare) },
    { family: "vox", remaining: Math.max(0, maxOf("vox") - maxVox) },
    { family: "keys", remaining: Math.max(0, maxKeys - keysPorts.length) },
  ];

  for (const spill of spillFamilies) {
    while (spill.remaining > 0) {
      const port = MID_OVERFLOW_PORTS.find((p) => !occupied.has(p));
      if (port === undefined) {
        // Last resort: unused vox then unused drum monos (never OH pair)
        const fallback = TEMPLATE_SLOTS.find(
          (s) =>
            s.strip !== null &&
            !s.stereo &&
            !occupied.has(s.port) &&
            s.family !== "oh",
        );
        if (!fallback) {
          warnings.push(
            `${SNAKE_SHORT_LABEL[snake]} full: could not place remaining "${spill.family}" input(s).`,
          );
          spill.remaining = 0;
          break;
        }
        claim(spill.family, fallback.port);
        spill.remaining -= 1;
        continue;
      }
      claim(spill.family, port);
      spill.remaining -= 1;
    }
  }

  // Build port state from template skeleton. Right halves of stereo pairs get
  // an entry too — a broken pair (mono keys on 9) leaves 10 usable on its own.
  const portState = new Map<number, PortAssignment>();
  for (const slot of TEMPLATE_SLOTS) {
    portState.set(slot.port, {
      snake,
      port: slot.port,
      strip: stripFor(snake, slot),
      label: slot.defaultLabel,
      templateLabel: slot.defaultLabel,
      family: slot.family,
      stereo: false,
      phantom: false,
      di: false,
      bandLabels: {},
      bandInstruments: {},
      bandDetailLabels: {},
      bandInputTypes: {},
      used: false,
    });
  }

  // Fix stereo flags for claimed keys/oh
  if (keysPorts.includes(9)) {
    const keysAssign = portState.get(9)!;
    keysAssign.stereo = keysStereo;
    keysAssign.family = "keys";
    keysAssign.label = "Keys";
  }
  if (reserved.get("oh")?.includes(15)) {
    const oh = portState.get(15)!;
    oh.stereo = true;
    oh.phantom = true;
    oh.label = "OH 48V";
  }

  // Mark families on reserved ports; keep Default.snap names on home slots
  for (const [family, ports] of reserved) {
    ports.forEach((port, index) => {
      const assignment = portState.get(port);
      const slot = TEMPLATE_SLOTS.find((s) => s.port === port);
      if (!assignment || !slot) return;
      assignment.family = family;
      if (family === "oh") {
        assignment.stereo = true;
        assignment.phantom = true;
        assignment.label = "OH 48V";
      } else if (family === "keys" && port === 9) {
        assignment.stereo = keysStereo;
        assignment.label = "Keys";
      } else if (slot.family === family) {
        assignment.label = slot.defaultLabel;
        assignment.stereo = false;
      } else {
        // Overflow onto a foreign home (e.g. guitar → Flex1)
        assignment.stereo = false;
        assignment.label = overflowStableLabel(family, index, slot.defaultLabel);
      }
    });
  }

  // Assign per-band live flags — names stay on the night snake label
  for (const band of orderedBands) {
    const familyCursor = new Map<SlotFamily, number>();
    for (const item of byBand.get(band.fileStem) ?? []) {
      if (!onThisBox(item.family)) continue;
      const cursor = familyCursor.get(item.family) ?? 0;
      familyCursor.set(item.family, cursor + 1);
      const ports = reserved.get(item.family) ?? [];
      const port = ports[cursor];
      if (port === undefined) {
        warnings.push(
          `${band.bandName}: no port left for "${displayLabel(item.input)}".`,
        );
        continue;
      }
      const assignment = portState.get(port);
      if (!assignment) continue;
      assignment.bandLabels[band.fileStem] = assignment.label;
      assignment.bandInstruments[band.fileStem] = instrumentKey(
        item.family,
        item.input.sourceKey,
      );
      assignment.bandDetailLabels[band.fileStem] = displayLabel(item.input);
      assignment.bandInputTypes[band.fileStem] = item.input.inputType;
      if (assignment.family === "oh") assignment.phantom = true;
    }
  }

  const ports: PortAssignment[] = [];
  for (const slot of TEMPLATE_SLOTS) {
    const assignment = portState.get(slot.port)!;
    const left = slot.strip === null ? ports.find((p) => p.port === slot.port - 1) : undefined;

    if (left?.stereo) {
      // Right half of a live stereo pair: it *is* the left socket, so it shows
      // the same finished tags (DI / 48V) and rides the left channel strip.
      // Reading the raw skeleton here is what used to drop the DI tag off A.10
      // while the band views kept it.
      ports.push({ ...left, port: slot.port, strip: null, templateLabel: slot.defaultLabel });
      continue;
    }

    const hasUse = Object.keys(assignment.bandLabels).length > 0;
    const inputTypes = Object.values(assignment.bandInputTypes);
    const diCount = inputTypes.filter((t) => t === "di").length;
    const spareStrip = slot.strip === null ? SNAKE_STRIPS[snake].spare : null;
    ports.push({
      ...assignment,
      // A broken pair's right socket needs a strip of its own to be audible.
      strip: hasUse ? (assignment.strip ?? spareStrip) : assignment.strip,
      stereo: assignment.stereo && slot.strip !== null,
      label: assignment.label || slot.defaultLabel,
      templateLabel: slot.defaultLabel,
      phantom: assignment.family === "oh" && (hasUse || Boolean(reserved.get("oh")?.length)),
      // DI tag when a majority of bands that use the port are on DI
      di: hasUse && diCount >= Math.ceil(inputTypes.length / 2),
      used: hasUse,
    });
  }

  return ports;
}

export function sortBandsForShow(bands: ShowBandInput[]): ShowBandInput[] {
  const roleRank = { support: 0, other: 1, headliner: 2 } as const;
  return [...bands].sort((a, b) => {
    const roleDiff = roleRank[a.role] - roleRank[b.role];
    if (roleDiff !== 0) return roleDiff;
    return a.bandName.localeCompare(b.bandName);
  });
}

/** Stable faceplate name when a family spills off its Default.snap home. */
function overflowStableLabel(
  family: SlotFamily,
  indexInFamily: number,
  fallback: string,
): string {
  switch (family) {
    case "guitar":
      return indexInFamily === 0 ? "Guitar" : `Guitar ${indexInFamily + 1}`;
    case "bass":
      return indexInFamily === 0 ? "Bass" : `Bass ${indexInFamily + 1}`;
    case "vox":
      return `Vox ${indexInFamily + 1}`;
    case "tom":
      return indexInFamily === 0 ? "Rack Tom" : "Floor Tom";
    case "flex":
      return indexInFamily === 0 ? "Flex1" : `Flex${indexInFamily + 1}`;
    case "keys":
      return "Keys";
    default:
      return fallback;
  }
}

/**
 * What counts as “the same thing on stage” across bands.
 * Fixed roles (vox, kick, …) stay the same even when the singer changes;
 * flex uses sourceKey so sax→guitar is a physical move.
 */
export function instrumentKey(family: SlotFamily, sourceKey?: string): string {
  if (family === "flex") return sourceKey ?? "flex";
  return family;
}
