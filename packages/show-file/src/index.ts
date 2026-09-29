/**
 * Browser-safe public API (no node:fs).
 * Node/Convex actions should import `@arbor/show-file/node` for packaging.
 */

export type {
  ConsolePreviewRow,
  EventPatchAllocation,
  PatchDiffPlan,
  PatchDiffStep,
  PatchPlan,
  PortAssignment,
  ShowBandInput,
  ShowFileDocument,
  ShowTarget,
  SlotFamily,
  SnakeGroup,
  SnakeId,
  StageBoxDiagramModel,
  StageBoxPort,
  WingSnap,
} from "./types";
export { SHOW_TARGETS, SHOW_TARGET_LABEL } from "./palette";
export { buildX32Scene } from "./x32";
export type { ConsoleScene } from "./x32";
export { buildXAirScene } from "./xair";

export {
  DEFAULT_PATCH_PLAN,
  allocateEventPatch,
  sortBandsForShow,
} from "./allocate";
export { familyForInput, displayLabel } from "./family";
export { deskGroupsFor, sourceFamilyFor, tagsForGroup } from "./groups";
export type { DeskGroup } from "./groups";
export {
  BOX_CAPACITY,
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
export { buildStageBoxDiagramModel, buildPatchDiffPlan } from "./diagram";
export { buildNightRiderDocument, listPhysicalChangeovers } from "./night-rider";
export type { PhysicalChangeover } from "./night-rider";
