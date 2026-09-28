import type { RiderInputChannel } from "@arbor/rider-document";
import { displayLabel, familyForInput } from "./family";
import {
  VOCAL_FX_BUSES,
  deskGroupsFor,
  sourceFamilyFor,
  tagsForGroup,
  vocalFxDcaFor,
  type DeskGroup,
} from "./groups";
import { buildLayerPages } from "./layers";
import { BOX_CAPACITY, SNAKE_SHORT_LABEL, stripFor } from "./slots";
import type {
  EventPatchAllocation,
  PatchPlan,
  PortAssignment,
  ShowBandInput,
  SlotFamily,
  SnakeId,
} from "./types";

type Classified = {
  input: RiderInputChannel;
  family: SlotFamily;
  /** Source family ("vocals", "playback", …) driving the DCA grouping. */
  group: DeskGroup | undefined;
};

type BandInputs = Map<string, Classified[]>;

export const DEFAULT_PATCH_PLAN: PatchPlan = { secondSnake: false, sides: {} };

/**
 * Night-stable snake, packed in the rider's own channel order.
 *
 * The rider already says what goes where and at what width; we honour that
 * rather than imposing a layout. Rows are the union across the bill, in each
 * band's channel order. A row takes a single socket, or the next legal stereo
 * pair (adjacent, starting on an odd socket) when the rider flagged it stereo.
 *
 * Groups are derived from the sources actually present — one vocal gets no
 * Vocals DCA, a playback-heavy set gets a Tracks DCA — and only supply the DCA
 * tag; they never decide placement. The two hard rules are: 48V only ever
 * reaches overheads, and stereo pairs stay adjacent.
 */
export function allocateEventPatch(
  bands: ShowBandInput[],
  plan: PatchPlan = DEFAULT_PATCH_PLAN,
): EventPatchAllocation {
  const warnings: string[] = [];
  const orderedBands = sortBandsForShow(bands);

  // Which desk groups exist tonight, from the union of all riders.
  const allInputs = orderedBands.flatMap((band) => band.inputs);
  const groups = deskGroupsFor(allInputs);
  const groupByFamily = new Map(groups.map((group) => [group.id, group]));
  const groupFor = (input: RiderInputChannel) => groupByFamily.get(sourceFamilyFor(input));

  const byBand: BandInputs = new Map();
  for (const band of orderedBands) {
    const classified: Classified[] = [];
    for (const input of band.inputs) {
      if (!input.sourceKey) {
        warnings.push(
          `${band.bandName}: "${input.source || `Ch ${input.channel}`}" has no sourceKey — grouped by name.`,
        );
      }
      classified.push({
        input,
        family: familyForInput(input),
        group: groupFor(input),
      });
    }
    // Rider order, not family order: channel number first, then id for stability.
    classified.sort(
      (a, b) => a.input.channel - b.input.channel || a.input.id.localeCompare(b.input.id),
    );
    byBand.set(band.fileStem, classified);
  }

  const snakes: SnakeId[] = plan.secondSnake ? ["A", "B"] : ["A"];
  const rows = nightRows(orderedBands, byBand);

  // Place the night rows across the chosen boxes, in order; box A fills first,
  // then the next box picks up where it left off.
  const perSnake = new Map<SnakeId, PlacedRow[]>();
  for (const snake of snakes) perSnake.set(snake, []);
  let cursor = 0;
  let collapsed = 0;
  for (const snake of snakes) {
    const box = new BoxPlacer(snake);
    const taken = perSnake.get(snake)!;
    while (cursor < rows.length) {
      const row = rows[cursor]!;
      const placed = box.place(row);
      if (!placed) {
        // This box is full. A later box can take the row; the last one cannot.
        if (snake === snakes[snakes.length - 1]) {
          warnings.push(
            `${SNAKE_SHORT_LABEL[snake]} full: could not place "${row.name}".`,
          );
          cursor += 1;
          continue;
        }
        break;
      }
      if (row.stereo && !placed.stereo) collapsed += 1;
      taken.push(placed);
      cursor += 1;
    }
  }

  if (collapsed > 0) {
    warnings.push(
      `${collapsed} stereo row(s) had no legal pair left — patched as mono.`,
    );
  }

  // The bill only ever gets offered "one snake" when one box can seat it all.
  const fitsOneBox = fitsOnOneBox(rows);
  if (!fitsOneBox && !plan.secondSnake) {
    warnings.push(
      "This bill needs more than one stage box — drop an input or turn on the second snake.",
    );
  }

  const ports: PortAssignment[] = [];
  for (const snake of snakes) {
    ports.push(...buildPorts(snake, perSnake.get(snake)!));
  }

  // Desk pages: vocals exploded, drums collapsed, melodic groups while they fit
  // (else one Melody DCA), tracks/utility separate, USB music pinned to fader 12.
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const fxDca = vocalFxDcaFor([...VOCAL_FX_BUSES]);
  const { pages: layers, overflow } = buildLayerPages({
    groups,
    fxDca,
    channels: ports
      .filter((port) => port.used && port.strip !== null)
      .sort((a, b) => (a.strip ?? 0) - (b.strip ?? 0))
      .map((port) => ({
        name: port.label,
        strip: port.strip!,
        family: port.family,
        group: groupById.get(port.groupId),
      })),
  });

  if (overflow.length > 0) {
    const names = overflow
      .filter((slot) => slot.kind !== "dca")
      .map((slot) => slot.name);
    warnings.push(
      `${names.length} input(s) past the USER1 layer: ${names.join(", ")}. Still patched and named on the desk.`,
    );
  }

  return {
    ports,
    warnings,
    bandOrder: orderedBands.map((b) => ({ bandName: b.bandName, fileStem: b.fileStem })),
    snakes,
    groups,
    fxDca,
    layers,
    fitsOneBox,
  };
}

/**
 * The night's rows: the union across the bill, in the order the bands wrote
 * them. Rows merge by identity, not array position — bands list different
 * inputs, so "channel 5" is a different thing on each. A row is stereo if any
 * band using that identity flagged it stereo.
 */
type NightRow = {
  name: string;
  family: SlotFamily;
  stereo: boolean;
  /** Stable merge key (sourceKey, else the normalized name). */
  key: string;
  /** Band fileStem → that band's channel for this row, for per-band views. */
  perBand: Map<string, Classified>;
};

function nightRows(
  orderedBands: ShowBandInput[],
  byBand: BandInputs,
): NightRow[] {
  const rows: NightRow[] = [];
  const byKey = new Map<string, NightRow>();

  for (const band of orderedBands) {
    for (const item of byBand.get(band.fileStem) ?? []) {
      const key = rowKey(item);
      let row = byKey.get(key);
      if (!row) {
        row = {
          name: item.input.source?.trim() || displayLabel(item.input),
          family: item.family,
          stereo: false,
          key,
          perBand: new Map(),
        };
        byKey.set(key, row);
        rows.push(row);
      }
      row.perBand.set(band.fileStem, item);
      if (item.input.stereo) row.stereo = true;
    }
  }

  // Group the night patch by family so voices sit together, the kit sits
  // together, and so on — the faceplate reads like the DCAs. Within a family,
  // rows keep the order the bands wrote them, so Vox 1 stays before Vox 2.
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) =>
        FAMILY_RANK[a.row.family] - FAMILY_RANK[b.row.family] ||
        a.index - b.index,
    )
    .map((entry) => entry.row);
}

/**
 * Family packing order: voices first (what an engineer rides), then the kit,
 * then the melodic mid, then flexible/overflow. Order matches the DCA and layer
 * rollups so the desk reads consistently.
 */
const FAMILY_RANK: Record<SlotFamily, number> = {
  vox: 0,
  kick: 1,
  snare: 2,
  tom: 3,
  oh: 4,
  bass: 5,
  guitar: 6,
  keys: 7,
  flex: 8,
};

/**
 * Identity of a night row across bands. A mapped source merges by its role plus
 * instance (two guitars are different rows); anything else falls back to its
 * normalized name, so an unmapped "Floor tom" stays distinct from "Rack tom".
 */
function rowKey(item: Classified): string {
  const normalized = (item.input.source || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return item.input.sourceKey ? `${item.input.sourceKey}|${normalized}` : `name:${normalized}`;
}

/** A row that has found a home on a box. */
type PlacedRow = {
  name: string;
  family: SlotFamily;
  stereo: boolean;
  snake: SnakeId;
  port: number;
  /** The night row this seated, so per-band views can find it. */
  row: NightRow;
};

/**
 * Greedy left-to-right placer for one 16-socket box: mono rows take the next
 * free socket, stereo rows the next free odd-start pair (1-2, 3-4, 5-6 …).
 * A stereo row that finds no pair still gets a free socket, and the caller
 * reports the collapse.
 */
class BoxPlacer {
  private readonly occupied = new Set<number>();
  constructor(private readonly snake: SnakeId) {}

  place(row: NightRow): PlacedRow | undefined {
    if (row.stereo) {
      // A stereo pair needs two adjacent sockets; A.8's talkback breaks the
      // 7–8 pair, so a stereo row slides to the next legal pair instead.
      const start = this.nextPairStart();
      if (start !== undefined) {
        this.occupied.add(start);
        this.occupied.add(start + 1);
        return this.row(row, start, true);
      }
    }
    const single = this.nextSingle();
    if (single === undefined) return undefined;
    this.occupied.add(single);
    return this.row(row, single, false);
  }

  private row(row: NightRow, port: number, stereo: boolean): PlacedRow {
    return {
      name: row.name,
      family: row.family,
      stereo,
      snake: this.snake,
      port,
      row,
    };
  }

  private nextPairStart(): number | undefined {
    for (let port = 1; port <= 15; port += 2) {
      if (!this.occupied.has(port) && !this.occupied.has(port + 1)) return port;
    }
    return undefined;
  }

  private nextSingle(): number | undefined {
    for (let port = 1; port <= BOX_CAPACITY; port++) {
      if (!this.occupied.has(port)) return port;
    }
    return undefined;
  }
}

/** Whether every night row seats on a single 16-socket box. */
function fitsOnOneBox(rows: NightRow[]): boolean {
  const box = new BoxPlacer("A");
  return rows.every((row) => Boolean(box.place(row)));
}

/**
 * Every socket on one box, occupied or not, with the rows that light it. Strip
 * is the socket's own channel — no nulls, no spares. A stereo pair's right
 * socket mirrors the left (same name, tags, and channel strip).
 */
function buildPorts(
  snake: SnakeId,
  placed: PlacedRow[],
): PortAssignment[] {
  const rowByPort = new Map(placed.map((row) => [row.port, row]));
  // The right socket of each live stereo pair mirrors its left neighbour.
  const stereoRightPorts = new Map(
    placed.filter((row) => row.stereo).map((row) => [row.port + 1, row]),
  );

  const ports: PortAssignment[] = [];
  for (let port = 1; port <= BOX_CAPACITY; port++) {
    const strip = stripFor(snake, port);
    const rightOf = stereoRightPorts.get(port);
    const left = rightOf ? ports.find((p) => p.port === port - 1) : undefined;

    if (left && rightOf) {
      // Right half of a live stereo pair: same input, same strip, mirrored.
      ports.push({ ...left, port, strip: null });
      continue;
    }

    const row = rowByPort.get(port);
    const hasUse = Boolean(row);
    const bandInputTypes = row
      ? Object.fromEntries(
          [...row.row.perBand].map(([fileStem, item]) => [fileStem, item.input.inputType]),
        )
      : {};
    const inputTypes = Object.values(bandInputTypes);
    const diCount = inputTypes.filter((t) => t === "di").length;
    const bandLabels = row
      ? Object.fromEntries(
          [...row.row.perBand].map(([fileStem, item]) => [
            fileStem,
            item.input.source?.trim() || displayLabel(item.input),
          ]),
        )
      : {};
    const bandInstruments = row
      ? Object.fromEntries(
          [...row.row.perBand].map(([fileStem, item]) => [
            fileStem,
            instrumentKey(item.family, item.input.sourceKey),
          ]),
        )
      : {};
    const bandDetailLabels = row
      ? Object.fromEntries(
          [...row.row.perBand].map(([fileStem, item]) => [
            fileStem,
            displayLabel(item.input),
          ]),
        )
      : {};
    // DCA/mute subscription comes from the row's source family, so a rewritten
    // patch still lands in the right DCAs (Vox in Vox DCA, tracks in Tracks DCA).
    const group = row ? groupOf(row.row) : undefined;
    const instruments = Object.values(bandInstruments);
    const consistent =
      instruments.length > 0 && instruments.every((key) => key === instruments[0]);

    ports.push({
      snake,
      port,
      strip,
      label: row?.name ?? "",
      family: row?.family ?? "flex",
      stereo: Boolean(row?.stereo),
      // 48V only ever reaches overheads, whatever a rider asked for.
      phantom: hasUse && row?.family === "oh",
      di: hasUse && diCount >= Math.ceil(inputTypes.length / 2),
      bandLabels,
      bandInstruments,
      bandDetailLabels,
      bandInputTypes,
      nightSourceKey:
        consistent && instruments[0]?.includes(".") ? instruments[0] : null,
      tags: hasUse ? tagsForGroup(group) : "",
      groupId: group?.id ?? "utility",
      used: hasUse,
    });
  }

  return ports;
}

/** The desk group of a night row (from any band that plays it). */
function groupOf(row: NightRow): DeskGroup | undefined {
  for (const item of row.perBand.values()) return item.group;
  return undefined;
}

export function sortBandsForShow(bands: ShowBandInput[]): ShowBandInput[] {
  const roleRank = { support: 0, other: 1, headliner: 2 } as const;
  return [...bands].sort((a, b) => {
    const roleDiff = roleRank[a.role] - roleRank[b.role];
    if (roleDiff !== 0) return roleDiff;
    return a.bandName.localeCompare(b.bandName);
  });
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
