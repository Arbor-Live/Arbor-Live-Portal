/**
 * Browser-safe public API (no node:fs).
 * Node/Convex actions should import `@arbor/show-file/node` for packaging.
 */

export type {
  EventPatchAllocation,
  PatchDiffPlan,
  PatchDiffStep,
  PortAssignment,
  ShowBandInput,
  ShowFileDocument,
  SlotFamily,
  StageBoxDiagramModel,
  StageBoxPort,
  WingSnap,
} from "./types";

export { allocateEventPatch, sortBandsForShow } from "./allocate";
export { familyForInput, displayLabel } from "./family";
export { TEMPLATE_SLOTS, PORT_BY_NUMBER } from "./slots";
export { buildShowFile, fileStem, showFileName } from "./show";
export {
  buildStageBoxDiagramModel,
  buildPatchDiffPlan,
  regionForPort,
} from "./diagram";
export { buildNightRiderDocument, listPhysicalChangeovers } from "./night-rider";
export type { PhysicalChangeover } from "./night-rider";
