import {
  MAIN_OUTPUTS,
  OUTPUTS_PER_BOX,
  SNAKE_LABEL,
  aes50Label,
  aes50PortFor,
  portLabel,
} from "./slots";
import type {
  EventPatchAllocation,
  PatchDiffPlan,
  PatchDiffStep,
  PortAssignment,
  SnakeId,
  StageBoxDiagramModel,
  StageBoxOutput,
  StageBoxPort,
} from "./types";

/** Stable identity for a port across the night (two boxes share port numbers). */
function portKey(port: { snake: string; port: number }): string {
  return `${port.snake}.${port.port}`;
}

/**
 * Night-wide faceplate (Default.snap layout). Ports nobody plugs into tonight
 * are dropped from the diagram and listed as spares instead, so an empty Flex
 * never reads as "something goes here".
 */
export function buildStageBoxDiagramModel(
  allocation: EventPatchAllocation,
  eventName?: string,
): StageBoxDiagramModel {
  const used = allocation.ports.filter((port) => port.used);
  const boxes = allocation.snakes.map((id) => SNAKE_LABEL[id]).join(" + ");
  return {
    title: "Night patch",
    subtitle: eventName ? `${eventName} · ${boxes}` : `${boxes} · Default.snap layout`,
    ports: used.map((port) => toStagePort(port)),
    spare: spareLabels(allocation),
    snakes: allocation.snakes,
    outputs: stageBoxOutputs(allocation),
    warnings: allocation.warnings,
  };
}

/**
 * Every stage-box output that carries something tonight, in output order:
 * main L/R, then the monitor buses (an IEM's pair reads "L" / "R"). Numbered
 * as printed on the box, with the desk's output in brackets down the chain.
 */
export function stageBoxOutputs(allocation: EventPatchAllocation): StageBoxOutput[] {
  const outputs: StageBoxOutput[] = MAIN_OUTPUTS.map((output, index) =>
    stageBoxOutput(output, index === 0 ? "Main L" : "Main R", "main", []),
  );
  for (const monitor of allocation.monitors) {
    const mixes = allocation.bandOrder.flatMap((band) => {
      const label = monitor.bandMixes[band.fileStem];
      return label ? [{ fileStem: band.fileStem, bandName: band.bandName, label }] : [];
    });
    monitor.outputs.forEach((output, index) => {
      const side = monitor.outputs.length > 1 ? (index === 0 ? " L" : " R") : "";
      outputs.push(stageBoxOutput(output, `${monitor.name}${side}`, monitor.kind, mixes));
    });
  }
  return outputs.sort((a, b) => outputNumber(a) - outputNumber(b));
}

function stageBoxOutput(
  output: number,
  feed: string,
  kind: StageBoxOutput["kind"],
  mixes: StageBoxOutput["mixes"],
): StageBoxOutput {
  const snake: SnakeId = output > OUTPUTS_PER_BOX ? "B" : "A";
  const onBox = output - (snake === "B" ? OUTPUTS_PER_BOX : 0);
  return {
    snake,
    output: onBox,
    outputLabel: onBox === output ? String(output) : `${onBox} (${output})`,
    feed,
    kind,
    mixes,
  };
}

function outputNumber(output: StageBoxOutput): number {
  return output.output + (output.snake === "B" ? OUTPUTS_PER_BOX : 0);
}

/**
 * Ports left unpatched tonight, collapsed into runs so a mostly empty second
 * snake reads as one line. Numbered the way the cells are — as printed on the
 * box, with the desk's sockets in brackets on a daisy-chained box ("1–6
 * (17–22)"). Right halves of stereo pairs excluded.
 */
function spareLabels(allocation: EventPatchAllocation): string[] {
  const labels: string[] = [];
  for (const snake of allocation.snakes) {
    const ports = allocation.ports
      .filter((port) => port.snake === snake && !port.used && port.strip !== null)
      .map((port) => port.port)
      .sort((a, b) => a - b);

    for (let i = 0; i < ports.length; ) {
      let end = i;
      while (end + 1 < ports.length && ports[end + 1] === ports[end]! + 1) end += 1;
      const from = ports[i]!;
      const to = ports[end]!;
      labels.push(end > i ? runLabel(snake, from, to) : portLabel(snake, from));
      i = end + 1;
    }
  }
  return labels;
}

function runLabel(snake: EventPatchAllocation["snakes"][number], from: number, to: number): string {
  const first = aes50PortFor(snake, from);
  const last = aes50PortFor(snake, to);
  return first === from ? `${from}–${to}` : `${from}–${to} (${first}–${last})`;
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
  const livePorts = allocation.ports.filter((port) => port.used);

  let previous = nightPortState(allocation);

  for (const band of allocation.bandOrder) {
    const current = bandPortState(allocation, band.fileStem);
    const vsNight = steps.length === 0;
    const ports = livePorts.map((port) => {
      const key = portKey(port);
      const live = current.get(key)!;
      const base = previous.get(key)!;
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

function nightPortState(allocation: EventPatchAllocation): Map<string, PortLive> {
  const map = new Map<string, PortLive>();
  for (const port of allocation.ports) {
    const instruments = Object.values(port.bandInstruments);
    const used = instruments.length > 0;
    map.set(portKey(port), {
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
): Map<string, PortLive> {
  const map = new Map<string, PortLive>();
  for (const port of allocation.ports) {
    const instrument = port.bandInstruments[fileStem] ?? null;
    map.set(portKey(port), {
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
    snake: port.snake,
    port: port.port,
    strip: port.strip,
    aes50: aes50Label(port.snake, port.port),
    portLabel: portLabel(port.snake, port.port),
    label: port.label,
    templateLabel: port.label,
    family: port.family,
    stereo: port.stereo,
    phantom: port.phantom,
    di: port.di,
    usedBy: Object.keys(port.bandLabels),
    ...overrides,
  };
}
