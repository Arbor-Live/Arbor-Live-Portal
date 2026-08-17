import { buildPatchDiffPlan } from "./diagram";
import {
  createRiderId,
  emptyRiderContent,
  renumberInputs,
  type RiderDocumentData,
  type RiderInputChannel,
  type RiderInputType,
} from "@arbor/rider-document";
import { SNAKE_LABEL, aes50Label } from "./slots";
import { sortBandsForShow } from "./allocate";
import type {
  EventPatchAllocation,
  PatchDiffPlan,
  ShowBandInput,
} from "./types";

export type PhysicalChangeover = {
  /** e.g. "Openers → Headliners" */
  title: string;
  /** e.g. "A.7 Flex1: Sax → Guitar" */
  lines: string[];
};

/** Yellow “swap on stage” rows only, in show order. */
export function listPhysicalChangeovers(plan: PatchDiffPlan): PhysicalChangeover[] {
  return plan.steps.map((step) => ({
    title: `${step.comparedTo} → ${step.bandName}`,
    lines: step.ports
      .filter((port) => port.change === "physical")
      .map((port) => {
        const from = port.previousLabel ?? "—";
        const to = port.label;
        return `${port.aes50} ${port.templateLabel}: ${from} → ${to}`;
      }),
  }));
}

/**
 * Build a night-wide technical rider: input list = max-overlap snake,
 * stage plot borrowed from the headliner (or densest band plot),
 * plus a changeover section matching the yellow stage swaps.
 */
export function buildNightRiderDocument(args: {
  eventName: string;
  allocation: EventPatchAllocation;
  bands: ShowBandInput[];
  updatedAtLabel?: string;
}): RiderDocumentData {
  const ordered = sortBandsForShow(args.bands);
  const plotBand =
    [...ordered].reverse().find((b) => (b.items?.length ?? 0) > 0) ??
    ordered.find((b) => b.stage) ??
    ordered[ordered.length - 1];

  const base = emptyRiderContent(plotBand?.stage);
  const inputs = renumberInputs(nightInputsFromAllocation(args.allocation));
  const changeovers = listPhysicalChangeovers(
    buildPatchDiffPlan(args.allocation, args.eventName),
  ).filter((block) => block.lines.length > 0);

  const bandNames = ordered.map((b) => b.bandName).join(", ");
  const notes = [
    `Night patch for max overlap across: ${bandNames || "performers"}.`,
    "Channel names stay stable all night (Default.snap layout).",
    args.allocation.warnings.length
      ? `Warnings: ${args.allocation.warnings.join(" · ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ...base,
    stage: plotBand?.stage ?? base.stage,
    items: plotBand?.items ?? [],
    inputs,
    monitorMixes: plotBand?.monitorMixes ?? [],
    backline: plotBand?.backline ?? [],
    generalNotes: notes,
    changeovers,
    bandName: args.eventName,
    riderName: "Night rider",
    updatedAtLabel: args.updatedAtLabel ?? "Tonight",
  };
}

function nightInputsFromAllocation(
  allocation: EventPatchAllocation,
): RiderInputChannel[] {
  const inputs: RiderInputChannel[] = [];

  for (const port of allocation.ports) {
    // Skip spares and the right half of a stereo pair (one rider line per pair).
    if (!port.used || port.strip === null) continue;

    const types = Object.values(port.bandInputTypes);
    const diVotes = types.filter((t) => t === "di").length;
    const inputType: RiderInputType =
      diVotes >= Math.ceil(types.length / 2) && types.length > 0
        ? "di"
        : ((types.find((t) => t !== "di") as RiderInputType | undefined) ?? "mic");

    const sourceKey = Object.values(port.bandInstruments).find((k) => k.includes("."));

    inputs.push({
      id: createRiderId("in"),
      channel: port.strip,
      source: port.label,
      sourceKey,
      inputType,
      stand: "none",
      phantom: port.phantom,
      providedBy: "arbor",
      stereo: port.stereo,
      notes: `${aes50Label(port.snake, port.port)} · ${SNAKE_LABEL[port.snake]}`,
    });
  }

  return inputs;
}
