import { TEMPLATE_SLOTS } from "./slots";
import type {
  EventPatchAllocation,
  PatchDiffPlan,
  PatchDiffStep,
  PortAssignment,
  StageBoxDiagramModel,
  StageBoxPort,
} from "./types";

/** Night-wide SD16 / XR18 faceplate (Default.snap layout). */
export function buildStageBoxDiagramModel(
  allocation: EventPatchAllocation,
  eventName?: string,
): StageBoxDiagramModel {
  return {
    title: "Night patch",
    subtitle: eventName
      ? `${eventName} · SD16 / XR18 → AES50 A`
      : "SD16 / XR18 → AES50 A · Default.snap layout",
    ports: allocation.ports.map((port) => toStagePort(port)),
    warnings: allocation.warnings,
  };
}

/**
 * Night snake + per-band views.
 * Green = same · strikethrough mute · yellow = physical stage change
 * (yellow labels name the actual instruments: "Sax → Guitar").
 */
export function buildPatchDiffPlan(
  allocation: EventPatchAllocation,
  eventName?: string,
): PatchDiffPlan {
  const night = buildStageBoxDiagramModel(allocation, eventName);
  const steps: PatchDiffStep[] = [];

  let previous = nightPortState(allocation);

  for (const band of allocation.bandOrder) {
    const current = bandPortState(allocation, band.fileStem);
    const vsNight = steps.length === 0;
    const ports = allocation.ports.map((port) => {
      const live = current.get(port.port)!;
      const base = previous.get(port.port)!;
      // First set vs night snake: mute unused snake ports, never yellow
      // (yellow is only for real between-band stage swaps).
      const change = vsNight ? firstSetVsNight(base, live) : diffKind(base, live);

      if (change === "physical") {
        return toStagePort(port, {
          label: live.detailLabel || port.label,
          previousLabel: base.detailLabel || port.label,
          usedBy: live.live ? [band.bandName] : [],
          di: live.inputType === "di",
          change,
        });
      }

      return toStagePort(port, {
        label: port.label,
        usedBy: live.live ? [band.bandName] : [],
        di: live.live ? live.inputType === "di" : port.di,
        change,
      });
    });

    steps.push({
      bandName: band.bandName,
      fileStem: band.fileStem,
      comparedTo: vsNight ? "Night patch" : steps[steps.length - 1]!.bandName,
      changes: ports.filter((p) => p.change && p.change !== "same"),
      ports,
    });

    previous = current;
  }

  return { night, steps };
}

type PortLive = {
  live: boolean;
  instrument: string | null;
  detailLabel: string | null;
  inputType: string | null;
};

function nightPortState(allocation: EventPatchAllocation): Map<number, PortLive> {
  const map = new Map<number, PortLive>();
  for (const port of allocation.ports) {
    const instruments = Object.values(port.bandInstruments);
    const used = instruments.length > 0;
    map.set(port.port, {
      live: used,
      instrument: used ? nightInstrument(port) : null,
      detailLabel: used ? port.label : null,
      inputType: used && port.di ? "di" : used ? "mic" : null,
    });
  }
  return map;
}

function bandPortState(
  allocation: EventPatchAllocation,
  fileStem: string,
): Map<number, PortLive> {
  const map = new Map<number, PortLive>();
  for (const port of allocation.ports) {
    const instrument = port.bandInstruments[fileStem] ?? null;
    map.set(port.port, {
      live: instrument !== null,
      instrument,
      detailLabel: port.bandDetailLabels[fileStem] ?? null,
      inputType: port.bandInputTypes[fileStem] ?? null,
    });
  }
  return map;
}

function nightInstrument(port: PortAssignment): string {
  const values = [...new Set(Object.values(port.bandInstruments))];
  if (values.length === 1) return values[0]!;
  return port.family;
}

/** Load-in vs night template: green live / mute reserved / idle blank. */
function firstSetVsNight(
  prev: PortLive,
  curr: PortLive,
): StageBoxPort["change"] | undefined {
  if (prev.live && !curr.live) return "mute";
  if (curr.live) return "same";
  return undefined;
}

function diffKind(
  prev: PortLive,
  curr: PortLive,
): StageBoxPort["change"] | undefined {
  if (prev.live && !curr.live) return "mute";
  if (!prev.live && !curr.live) return undefined;
  if (!prev.live && curr.live) {
    if (prev.instrument && curr.instrument && prev.instrument !== curr.instrument) {
      return "physical";
    }
    return "same";
  }
  if (prev.instrument && curr.instrument && prev.instrument !== curr.instrument) {
    return "physical";
  }
  return "same";
}

function toStagePort(
  port: PortAssignment,
  overrides?: Partial<StageBoxPort>,
): StageBoxPort {
  return {
    port: port.port,
    aes50: `A.${port.port}`,
    label: port.label,
    templateLabel: port.templateLabel,
    family: port.family,
    stereo: port.stereo,
    phantom: port.phantom,
    di: port.di,
    usedBy: Object.keys(port.bandLabels),
    ...overrides,
  };
}

export function regionForPort(port: number): "vox" | "mid" | "drums" {
  return TEMPLATE_SLOTS.find((s) => s.port === port)?.region ?? "mid";
}
