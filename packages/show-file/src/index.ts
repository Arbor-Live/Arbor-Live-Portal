/**
 * Browser-safe public API (no node:fs).
 * Node/Convex actions should import `@arbor/show-file/node` for packaging.
 */

export type {
  EventPatchAllocation,
  PatchDiffPlan,
  PatchDiffStep,
  PatchPlan,
  PortAssignment,
  ShowBandInput,
  ShowFileDocument,
  SlotFamily,
  SnakeGroup,
  SnakeId,
  StageBoxDiagramModel,
  StageBoxPort,
  WingSnap,
} from "./types";

export {
  DEFAULT_PATCH_PLAN,
  allocateEventPatch,
  sortBandsForShow,
} from "./allocate";
export { familyForInput, displayLabel } from "./family";
export {
  TEMPLATE_SLOTS,
  PORT_BY_NUMBER,
  SNAKE_GROUPS,
  SNAKE_GROUP_LABEL,
  SNAKE_IDS,
  SNAKE_LABEL,
  SNAKE_SHORT_LABEL,
  aes50Label,
  aes50PortFor,
  portLabel,
  snakeGroupForFamily,
} from "./slots";
export { buildShowFile, fileStem, showFileName } from "./show";
export {
  buildStageBoxDiagramModel,
  buildPatchDiffPlan,
  regionForPort,
} from "./diagram";
export { buildNightRiderDocument, listPhysicalChangeovers } from "./night-rider";
export type { PhysicalChangeover } from "./night-rider";
