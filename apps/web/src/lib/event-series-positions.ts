import {
  normalizeArtistTypes,
  type ArtistNeedActType,
  type ArtistNeedType,
} from "@/components/events/lineup/lineup-model";

/**
 * Series position templates: the shape of a series' bill. Times are offsets
 * from each occurrence's start (same idea as the crew shift template).
 */
export type SeriesPositionTemplate = {
  templateKey: string;
  label: string;
  /** Empty means no preference. */
  artistTypes?: ArtistNeedActType[];
  /** @deprecated Read by `templateArtistTypes` until the backfill clears it. */
  artistType?: ArtistNeedType;
  genres?: string;
  dayIndex: number;
  setOffsetMs?: number;
  setDurationMs?: number;
  soundcheckOffsetMs?: number;
  soundcheckDurationMs?: number;
};

export type SeriesPositionTemplateDraft = {
  clientId: string;
  /** Empty for a position that hasn't been saved yet. */
  templateKey: string;
  label: string;
  /** Empty means no preference. */
  artistTypes: ArtistNeedActType[];
  genres: string;
  /** Hours from the occurrence start; empty means no set window. */
  setOffsetHours: string;
  /** Minutes. */
  setDurationMinutes: string;
  soundcheckOffsetHours: string;
  soundcheckDurationMinutes: string;
};

/** What a template looks for, reading the legacy single `artistType` too. */
function templateArtistTypes(template: SeriesPositionTemplate): ArtistNeedActType[] {
  if (template.artistTypes) return normalizeArtistTypes(template.artistTypes);
  return template.artistType && template.artistType !== "no_preference"
    ? [template.artistType]
    : [];
}

const HOUR_MS = 60 * 60 * 1000;

function offsetToHours(offsetMs: number | undefined) {
  return offsetMs !== undefined ? String(Number((offsetMs / HOUR_MS).toFixed(2))) : "";
}

function durationToMinutes(durationMs: number | undefined) {
  return durationMs !== undefined ? String(Math.round(durationMs / 60_000)) : "";
}

function hoursToMs(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const hours = Number(trimmed);
  // Draft hours are rounded for display; snap back to whole minutes so a
  // load/save round trip never shifts an imported offset by seconds.
  return Number.isFinite(hours) ? Math.round((hours * HOUR_MS) / 60_000) * 60_000 : undefined;
}

function minutesToMs(value: string, fallbackMinutes: number): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return fallbackMinutes * 60_000;
  const minutes = Number(trimmed);
  // A blank duration already falls back; treat junk/zero/negative the same way
  // rather than silently storing an open-ended window.
  return Number.isFinite(minutes) && minutes > 0
    ? Math.round(minutes * 60_000)
    : fallbackMinutes * 60_000;
}

function dayIndexForOffset(offsetMs: number | undefined, soundcheckOffsetMs: number | undefined) {
  const reference = offsetMs ?? soundcheckOffsetMs ?? 0;
  if (reference <= 0) return 0;
  return Math.max(0, Math.floor(reference / (24 * HOUR_MS)));
}

export function positionTemplatesToDrafts(
  templates: SeriesPositionTemplate[] | undefined,
): SeriesPositionTemplateDraft[] {
  return (templates ?? []).map((template, index) => ({
    clientId: template.templateKey || `position-template-${index}`,
    templateKey: template.templateKey,
    label: template.label,
    artistTypes: templateArtistTypes(template),
    genres: template.genres ?? "",
    setOffsetHours: offsetToHours(template.setOffsetMs),
    setDurationMinutes: durationToMinutes(template.setDurationMs),
    soundcheckOffsetHours: offsetToHours(template.soundcheckOffsetMs),
    soundcheckDurationMinutes: durationToMinutes(template.soundcheckDurationMs),
  }));
}

export function positionDraftToTemplate(
  draft: SeriesPositionTemplateDraft,
): SeriesPositionTemplate {
  const setOffsetMs = hoursToMs(draft.setOffsetHours);
  const soundcheckOffsetMs = hoursToMs(draft.soundcheckOffsetHours);
  return {
    templateKey:
      draft.templateKey || `pos_${crypto.randomUUID().replaceAll("-", "")}`,
    label: draft.label.trim(),
    artistTypes: draft.artistTypes,
    genres: draft.genres.trim() || undefined,
    dayIndex: dayIndexForOffset(setOffsetMs, soundcheckOffsetMs),
    setOffsetMs,
    setDurationMs:
      setOffsetMs !== undefined ? minutesToMs(draft.setDurationMinutes, 60) : undefined,
    soundcheckOffsetMs,
    soundcheckDurationMs:
      soundcheckOffsetMs !== undefined
        ? minutesToMs(draft.soundcheckDurationMinutes, 30)
        : undefined,
  };
}

export function positionDraftsToTemplates(
  drafts: SeriesPositionTemplateDraft[],
): SeriesPositionTemplate[] {
  return drafts.map(positionDraftToTemplate);
}

/** "+2h from start" for a signed offset. */
function formatOffset(offsetMs: number) {
  const sign = offsetMs < 0 ? "−" : "+";
  const hours = Math.abs(offsetMs) / HOUR_MS;
  const label = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${sign}${label}h from start`;
}

function formatDuration(durationMs: number) {
  const minutes = Math.round(durationMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

/** Window summary for a draft, without materializing a templateKey. */
export function formatPositionDraftWindows(draft: SeriesPositionTemplateDraft) {
  const parts: string[] = [];
  const setOffset = hoursToMs(draft.setOffsetHours);
  if (setOffset !== undefined) {
    const duration = minutesToMs(draft.setDurationMinutes, 60);
    parts.push(`Set ${formatOffset(setOffset)}${duration ? ` · ${formatDuration(duration)}` : ""}`);
  }
  const soundcheckOffset = hoursToMs(draft.soundcheckOffsetHours);
  if (soundcheckOffset !== undefined) {
    const duration = minutesToMs(draft.soundcheckDurationMinutes, 30);
    parts.push(
      `Soundcheck ${formatOffset(soundcheckOffset)}${duration ? ` · ${formatDuration(duration)}` : ""}`,
    );
  }
  return parts.join(" · ");
}
