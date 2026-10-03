import type {
  RiderMonitorMix,
  RiderStage,
  RiderStageItem,
} from "@arbor/rider-document";
import type { ShowBandInput } from "./types";

/**
 * Night monitor buses, derived from every band's monitor mixes.
 *
 * Like the input patch, monitors are one plan for the night, not one per band:
 * a wedge is a place on the stage, so the opener's "Vocals" wedge and the
 * headliner's "Maya" wedge are the same downstage-left box on the same bus.
 * Wedges are placed by where the band drew them on the plot — the drum wedge
 * (next to the kit, or a mix named for the drums), then left / centre / right
 * thirds of the downstage line. IEMs are per performer, so the night gets as
 * many as the busiest band needs. Side fills take left/right halves.
 */
export type MonitorPosition = "L" | "C" | "R" | "drums" | "sideL" | "sideR";

export type MonitorBus = {
  /** WING bus, 1-based. */
  bus: number;
  name: string;
  kind: "wedge" | "iem" | "side_fill";
  /** Stereo feeds take two outputs (IEMs); wedges and fills take one. */
  stereo: boolean;
  /** WING colour + icon for the bus strip. */
  col: number;
  icon: number;
  /** Band fileStem → that band's mix label on this bus. */
  bandMixes: Record<string, string>;
};

export type MonitorPlan = {
  buses: MonitorBus[];
  warnings: string[];
};

/**
 * Buses monitors may use. 13/14 are the blueprint's named reverb returns
 * (`VOCAL_FX_BUSES`), so monitors stop below them.
 */
export const MONITOR_BUS_LIMIT = 12;

const POSITION_ORDER: MonitorPosition[] = ["L", "C", "R", "drums", "sideL", "sideR"];

const POSITION_NAME: Record<MonitorPosition, string> = {
  L: "Wedge L",
  C: "Wedge C",
  R: "Wedge R",
  drums: "Drum Wedge",
  sideL: "Side Fill L",
  sideR: "Side Fill R",
};

/**
 * Bus swatches. The console saves in `DayNMayfield/` colour every "Mon …" bus
 * 10, with 522 on the front wedges and 521 on "Mon Drums". IEMs get their own
 * colour so they read apart from the wedges.
 */
const WEDGE_STYLE = { col: 10, icon: 522 };
const DRUM_WEDGE_STYLE = { col: 10, icon: 521 };
const SIDE_FILL_STYLE = { col: 10, icon: 520 };
const IEM_STYLE = { col: 12, icon: 520 };

/** A wedge this close (feet) to a drum kit is the drummer's. */
const DRUM_WEDGE_RADIUS_FT = 6;

export function planMonitors(bands: ShowBandInput[]): MonitorPlan {
  const warnings: string[] = [];
  // Position → band → mix label. Extra wedges a position cannot take become
  // their own numbered bus.
  const byPosition = new Map<MonitorPosition, Record<string, string>>();
  const extraWedges: Array<Record<string, string>> = [];
  const iems: Array<Record<string, string>> = [];

  for (const band of bands) {
    const mixes = [...(band.monitorMixes ?? [])].sort(
      (a, b) => a.mixNumber - b.mixNumber,
    );
    const items = band.items ?? [];
    const stage = band.stage;
    const taken = new Set<MonitorPosition>();
    let extra = 0;
    let iem = 0;

    for (const mix of mixes) {
      if (mix.type === "iem") {
        iems[iem] = { ...(iems[iem] ?? {}), [band.fileStem]: mix.label };
        iem += 1;
        continue;
      }
      const position = positionFor(mix, items, stage, taken);
      if (!position) {
        extraWedges[extra] = { ...(extraWedges[extra] ?? {}), [band.fileStem]: mix.label };
        extra += 1;
        continue;
      }
      taken.add(position);
      byPosition.set(position, {
        ...(byPosition.get(position) ?? {}),
        [band.fileStem]: mix.label,
      });
    }
  }

  const wanted: Array<Omit<MonitorBus, "bus">> = [
    ...POSITION_ORDER.filter((position) => byPosition.has(position)).map(
      (position) => ({
        name: POSITION_NAME[position],
        kind: position.startsWith("side") ? ("side_fill" as const) : ("wedge" as const),
        stereo: false,
        ...(position === "drums"
          ? DRUM_WEDGE_STYLE
          : position.startsWith("side")
            ? SIDE_FILL_STYLE
            : WEDGE_STYLE),
        bandMixes: byPosition.get(position)!,
      }),
    ),
    ...extraWedges.map((bandMixes, index) => ({
      name: `Wedge ${index + 1}`,
      kind: "wedge" as const,
      stereo: false,
      ...WEDGE_STYLE,
      bandMixes,
    })),
    ...iems.map((bandMixes, index) => ({
      name: `IEM ${index + 1}`,
      kind: "iem" as const,
      stereo: true,
      ...IEM_STYLE,
      bandMixes,
    })),
  ];

  const buses = wanted
    .slice(0, MONITOR_BUS_LIMIT)
    .map((bus, index) => ({ ...bus, bus: index + 1 }));
  const dropped = wanted.slice(MONITOR_BUS_LIMIT);
  if (dropped.length > 0) {
    warnings.push(
      `${dropped.length} monitor mix(es) past bus ${MONITOR_BUS_LIMIT}: ${dropped.map((bus) => bus.name).join(", ")}. Not built.`,
    );
  }
  return { buses, warnings };
}

/**
 * Where on stage a wedge or fill sits. Uses the plotted symbol bound to the mix
 * when there is one; otherwise the next free downstage position in L → C → R
 * order. Undefined when the band has more front wedges than positions.
 */
function positionFor(
  mix: RiderMonitorMix,
  items: RiderStageItem[],
  stage: RiderStage | undefined,
  taken: Set<MonitorPosition>,
): MonitorPosition | undefined {
  const item = items.find((candidate) => candidate.monitorMixId === mix.id);
  const width = stage?.widthFt ?? 24;

  if (mix.type === "side_fill") {
    const preferred: MonitorPosition =
      item && item.xFt > width / 2 ? "sideR" : "sideL";
    return firstFree([preferred, preferred === "sideL" ? "sideR" : "sideL"], taken);
  }

  const kit = items.find((candidate) => candidate.symbol === "drum_kit");
  const nearKit =
    item && kit
      ? Math.hypot(item.xFt - kit.xFt, item.yFt - kit.yFt) <= DRUM_WEDGE_RADIUS_FT
      : false;
  if ((nearKit || /drum|kit/i.test(mix.label)) && !taken.has("drums")) {
    return "drums";
  }

  const front: MonitorPosition[] = ["L", "C", "R"];
  if (!item) return firstFree(front, taken);
  const third: MonitorPosition =
    item.xFt < width / 3 ? "L" : item.xFt > (width * 2) / 3 ? "R" : "C";
  // Nearest free downstage position to where it was drawn.
  const byDistance = [...front].sort(
    (a, b) =>
      Math.abs(front.indexOf(a) - front.indexOf(third)) -
      Math.abs(front.indexOf(b) - front.indexOf(third)),
  );
  return firstFree(byDistance, taken);
}

function firstFree(
  positions: MonitorPosition[],
  taken: Set<MonitorPosition>,
): MonitorPosition | undefined {
  return positions.find((position) => !taken.has(position));
}
