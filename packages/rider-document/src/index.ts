export {
  DEFAULT_STAGE,
  MAX_STAGE_FT,
  MIN_STAGE_FT,
  STAGE_PRESETS,
  STAGE_SIZE_STEP,
  backfillSourceKeys,
  blankBacklineItem,
  blankInput,
  blankMix,
  channelSpan,
  clampToStage,
  createRiderId,
  emptyRiderContent,
  inputFamilyLabel,
  insertByFamily,
  itemFootprint,
  moveInArray,
  nextChannelNumber,
  nextMixNumber,
  placeSymbol,
  removalPlan,
  removeItem,
  renumberInputs,
  renumberMixes,
  riderWarnings,
  round,
  snapStageFt,
  stageSizeOptions,
  sourceOrdinals,
  summarizeRider,
  unmappedInputs,
  updateItem,
} from "./content";
export type { PlaceSymbolOptions, PlaceSymbolResult, RiderSummary } from "./content";

export { glyphElements, glyphBoxTransform, glyphNode } from "./glyph";
export type { GlyphComponents } from "./glyph";

export {
  PLOT_COLORS,
  computePlotLayout,
  ftToPx,
  gridLineOffsets,
  itemRect,
  itemTransform,
  labelRect,
  plotDrawOrder,
  pxToFt,
} from "./plot";
export type { ItemRect, PlotBox, PlotLayout } from "./plot";

export {
  RIDER_CATEGORY_ORDER,
  RIDER_CATEGORY_PALETTE,
  RIDER_SYMBOLS,
  itemGlyph,
  riderSymbol,
  riderSymbolsByCategory,
  symbolKeyForRole,
} from "./symbols";
export type {
  RiderCategoryPalette,
  RiderGlyphPaint,
  RiderGlyphShape,
  RiderGlyphViewBox,
  RiderInputSeed,
  RiderSymbol,
  RiderSymbolCategory,
} from "./symbols";

export {
  RIDER_SOURCES,
  RIDER_SOURCE_FAMILY_LABELS,
  RIDER_SOURCE_FAMILY_ORDER,
  captureFor,
  commonRiderSources,
  defaultCapture,
  hasCaptureChoice,
  matchRiderSource,
  riderSource,
  riderSourcesByFamily,
  searchRiderSources,
} from "./sources";
export type {
  RiderCaptureOption,
  RiderSourceDefinition,
  RiderSourceFamily,
  RiderSourceReuseClass,
} from "./sources";

export { RIDER_TEMPLATES, riderTemplate } from "./templates";
export type { RiderTemplate } from "./templates";

export {
  INPUT_TYPE_LABELS,
  MONITOR_TYPE_LABELS,
  MONITOR_TYPE_OPTIONS,
  PROVIDED_BY_EDITOR_LABELS,
  PROVIDED_BY_LABELS,
  STAND_LABELS,
} from "./types";
export type {
  RiderBacklineItem,
  RiderContent,
  RiderDocumentData,
  RiderInputChannel,
  RiderInputType,
  RiderMonitorMix,
  RiderMonitorType,
  RiderProvidedBy,
  RiderStage,
  RiderStageItem,
  RiderStandType,
} from "./types";

export type {
  EventBriefAct,
  EventBriefAssignment,
  EventBriefContact,
  EventBriefDocumentData,
  EventBriefInstruction,
  EventBriefMoment,
  EventBriefPatch,
  EventBriefPatchPort,
  EventBriefPlot,
  EventBriefPullItem,
  EventBriefRunOfShowDay,
  EventBriefRunOfShowEntry,
  EventBriefSection,
  EventBriefShift,
} from "./brief-types";
export {
  LINEUP_PRESETS,
  LINEUP_ROLE_ORDER,
  LINEUP_ROLES,
  buildRiderFromLineup,
  lineupFromPreset,
  lineupPerformerCount,
  memberDisplayNames,
  newLineupMember,
} from "./lineup";
export type { Lineup, LineupMember, LineupMonitors, LineupRole } from "./lineup";
