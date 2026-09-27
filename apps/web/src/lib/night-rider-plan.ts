import {
  allocateEventPatch,
  buildPatchDiffPlan,
  fileStem,
  listPhysicalChangeovers,
  type PatchDiffPlan,
  type PhysicalChangeover,
  type ShowBandInput,
} from "@arbor/show-file";

type RiderRow = {
  bandName: string;
  role: ShowBandInput["role"];
  rider: {
    inputs: ShowBandInput["inputs"];
    stage: ShowBandInput["stage"];
    items: ShowBandInput["items"];
    monitorMixes: ShowBandInput["monitorMixes"];
    backline: ShowBandInput["backline"];
  } | null;
};

/** Patch diff plan and physical changeovers for an event's published riders. */
export function nightRiderPlan(
  rows: RiderRow[],
  plan: Parameters<typeof allocateEventPatch>[1],
): { patchPlan: PatchDiffPlan | null; changeovers: PhysicalChangeover[] } {
  const showBands: ShowBandInput[] = rows
    .filter((row) => row.rider && row.rider.inputs.length > 0)
    .map((row) => ({
      bandName: row.bandName,
      fileStem: fileStem(row.bandName),
      role: row.role,
      inputs: row.rider!.inputs,
      stage: row.rider!.stage,
      items: row.rider!.items,
      monitorMixes: row.rider!.monitorMixes,
      backline: row.rider!.backline,
    }));
  if (showBands.length === 0) return { patchPlan: null, changeovers: [] };
  const patchPlan = buildPatchDiffPlan(allocateEventPatch(showBands, plan));
  return { patchPlan, changeovers: listPhysicalChangeovers(patchPlan) };
}
