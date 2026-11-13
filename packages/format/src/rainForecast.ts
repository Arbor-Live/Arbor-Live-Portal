import { pacificDateKey } from "./index";

export const RAIN_CHANCE_THRESHOLD = 30;
export const RAIN_LIKELY_THRESHOLD = 60;

export type RainHour = { startMs: number; endMs: number; chance: number };
export type RainPhase = "setup" | "show" | "strike";
export type PhaseRisk = {
  phase: RainPhase;
  startsAt: number;
  endsAt: number;
  chance: number;
  peakAt: number;
};
export type RainRiskBlock = { blockType: string; startsAt: number; endsAt: number };
export type RainRiskEvent = {
  startAt: number;
  endAt: number;
  venueKind?: string;
  blocks?: RainRiskBlock[];
};
export type EventRainRisk = { phases: PhaseRisk[]; outdoor: boolean; chance: number };

export const RAIN_PHASE_LABEL: Record<RainPhase, string> = {
  setup: "Setup",
  show: "Show",
  strike: "Strike",
};

const PHASE_ORDER: RainPhase[] = ["setup", "show", "strike"];

function peakOf(hours: RainHour[]) {
  let best: RainHour | undefined;
  for (const hour of hours) if (!best || hour.chance > best.chance) best = hour;
  return best;
}

export function dayRain(hours: RainHour[] | undefined, dateKey: string) {
  if (!hours) return undefined;
  const peak = peakOf(hours.filter((hour) => pacificDateKey(hour.startMs) === dateKey));
  return peak ? { chance: peak.chance, peakAt: peak.startMs } : undefined;
}

export function windowRain(hours: RainHour[], startsAt: number, endsAt: number) {
  const peak = peakOf(hours.filter((hour) => hour.endMs > startsAt && hour.startMs < endsAt));
  return peak ? { chance: peak.chance, peakAt: peak.startMs } : undefined;
}

export function rainPhaseOf(blockType: string): RainPhase {
  if (blockType === "setup") return "setup";
  if (blockType === "strike") return "strike";
  return "show";
}

/**
 * Setup and strike count at any venue. Everything else is the show, which only counts outdoors.
 * A finished block carries no risk, and a running one is judged on the hours it has left.
 */
export function blockRainRisk(
  block: RainRiskBlock,
  venueKind: string | undefined,
  hours: RainHour[] | undefined,
  now: number,
) {
  const phase = rainPhaseOf(block.blockType);
  if (phase === "show" && venueKind !== "outdoor") return undefined;
  if (!hours?.length || block.endsAt <= now) return undefined;
  const rain = windowRain(hours, Math.max(block.startsAt, now), block.endsAt);
  if (!rain || rain.chance < RAIN_CHANCE_THRESHOLD) return undefined;
  return { phase, ...rain };
}

export function eventRainRisk(
  event: RainRiskEvent,
  hours: RainHour[] | undefined,
  now: number,
): EventRainRisk | null {
  if (!hours?.length) return null;
  const blocks = event.blocks?.length
    ? event.blocks
    : [{ blockType: "show", startsAt: event.startAt, endsAt: event.endAt }];
  const firstStart = Math.min(...blocks.map((block) => block.startsAt));
  const lastEnd = Math.max(...blocks.map((block) => block.endsAt));
  if (lastEnd < now || firstStart > hours[hours.length - 1]!.endMs) return null;

  const byPhase = new Map<RainPhase, PhaseRisk>();
  for (const block of blocks) {
    const risk = blockRainRisk(block, event.venueKind, hours, now);
    if (!risk) continue;
    const existing = byPhase.get(risk.phase);
    byPhase.set(risk.phase, {
      phase: risk.phase,
      startsAt: Math.min(existing?.startsAt ?? block.startsAt, block.startsAt),
      endsAt: Math.max(existing?.endsAt ?? block.endsAt, block.endsAt),
      chance: Math.max(existing?.chance ?? 0, risk.chance),
      peakAt: existing && existing.chance >= risk.chance ? existing.peakAt : risk.peakAt,
    });
  }
  const phases = PHASE_ORDER.flatMap((phase) => byPhase.get(phase) ?? []);
  if (!phases.length) return null;
  return {
    phases,
    outdoor: event.venueKind === "outdoor",
    chance: Math.max(...phases.map((phase) => phase.chance)),
  };
}

export function rainFlagText(phases: Array<Pick<PhaseRisk, "phase" | "chance">>) {
  return ["Rain", ...phases.map((p) => `${RAIN_PHASE_LABEL[p.phase]} ${p.chance}%`)].join(" · ");
}
