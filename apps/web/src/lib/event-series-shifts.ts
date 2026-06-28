import type { SeriesBlockTemplate } from "@/lib/event-series-schedule";

export type SeriesShiftTemplate = {
  role: string;
  blockTemplateIndex: number;
  offsetMs: number;
  durationMs: number;
  estimatedHourlyRateUsd?: number;
  notes?: string;
};

export type SeriesShiftTemplateDraft = {
  clientId: string;
  role: string;
  blockTemplateIndex: number;
  offsetMs: number;
  durationMs: number;
  estimatedHourlyRateUsd: string;
  notes: string;
};

export function sortedBlockTemplateOptions(blockTemplates: SeriesBlockTemplate[]) {
  return blockTemplates
    .slice()
    .sort((a, b) => a.offsetMs - b.offsetMs)
    .map((template, index) => ({
      index,
      label: template.label || `Block ${index + 1}`,
      blockType: template.blockType,
      offsetMs: template.offsetMs,
      durationMs: template.durationMs,
    }));
}

export function shiftTemplatesToDrafts(
  templates: SeriesShiftTemplate[],
  defaultHourlyRateUsd?: number,
): SeriesShiftTemplateDraft[] {
  return templates.map((template, index) => ({
    clientId: `shift-template-${index}`,
    role: template.role,
    blockTemplateIndex: template.blockTemplateIndex,
    offsetMs: template.offsetMs,
    durationMs: template.durationMs,
    estimatedHourlyRateUsd:
      template.estimatedHourlyRateUsd !== undefined
        ? String(template.estimatedHourlyRateUsd)
        : defaultHourlyRateUsd !== undefined
          ? String(defaultHourlyRateUsd)
          : "",
    notes: template.notes ?? "",
  }));
}

export function shiftDraftsToTemplates(drafts: SeriesShiftTemplateDraft[]): SeriesShiftTemplate[] {
  return drafts
    .filter((draft) => draft.role.trim())
    .map((draft) => ({
      role: draft.role.trim(),
      blockTemplateIndex: draft.blockTemplateIndex,
      offsetMs: draft.offsetMs,
      durationMs: Math.max(draft.durationMs, 15 * 60 * 1000),
      estimatedHourlyRateUsd: draft.estimatedHourlyRateUsd.trim()
        ? Number(draft.estimatedHourlyRateUsd)
        : undefined,
      notes: draft.notes.trim() ? draft.notes.trim() : undefined,
    }));
}

export function createShiftDraftForBlock(args: {
  blockTemplateIndex: number;
  block: { offsetMs: number; durationMs: number; label: string; blockType: string };
  defaultHourlyRateUsd?: number;
  clientId: string;
}): SeriesShiftTemplateDraft {
  return {
    clientId: args.clientId,
    role: "",
    blockTemplateIndex: args.blockTemplateIndex,
    offsetMs: args.block.offsetMs,
    durationMs: args.block.durationMs,
    estimatedHourlyRateUsd:
      args.defaultHourlyRateUsd !== undefined ? String(args.defaultHourlyRateUsd) : "",
    notes: "",
  };
}

export function formatOffsetHours(offsetMs: number) {
  const hours = offsetMs / 3_600_000;
  if (Math.abs(hours) < 1) return `${Math.round(offsetMs / 60_000)}m from start`;
  return `${hours.toFixed(1)}h from start`;
}

export function formatDurationHours(durationMs: number) {
  const hours = durationMs / 3_600_000;
  if (hours < 1) return `${Math.round(durationMs / 60_000)}m`;
  return `${hours.toFixed(1)}h`;
}

export function estimatedShiftCostUsd(draft: SeriesShiftTemplateDraft) {
  const rate = draft.estimatedHourlyRateUsd.trim() ? Number(draft.estimatedHourlyRateUsd) : 0;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  const hours = draft.durationMs / 3_600_000;
  return Math.round(rate * hours * 100) / 100;
}

export function totalEstimatedShiftCostUsd(drafts: SeriesShiftTemplateDraft[]) {
  return drafts.reduce((sum, draft) => sum + estimatedShiftCostUsd(draft), 0);
}
