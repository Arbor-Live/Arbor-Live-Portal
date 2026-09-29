/**
 * FX engine allocation.
 *
 * The WING has 16 stereo FX engines. The **premium** engines (the costly
 * reverbs/delays) can only run in slots 1–8; the standard engines (pitch
 * correct, de-ess, amp sims) can run anywhere. The blueprint states the rule by
 * example: whatever models it puts in FX1–8 are premium, whatever it puts in
 * FX9–16 are standard. We read that, never hardcode a model list.
 *
 * Allocation favours the scarce resource: a standard engine is placed in a
 * standard slot when one is free, so it does not burn a premium slot a reverb
 * might need. Premium engines take premium slots, spilling into the rest only
 * when premium demand genuinely exceeds 8.
 */

/** Slot numbers of the premium FX range (1-based, inclusive). */
export const PREMIUM_SLOTS = Array.from({ length: 8 }, (_, i) => i + 1);

/** An engine the blueprint has loaded, and where it sits. */
export type BlueprintEngine = {
  slot: number;
  model: string;
};

/** Premium models as the blueprint demonstrates them (whatever is in FX1–8). */
export function premiumModels(engines: BlueprintEngine[]): Set<string> {
  const premium = new Set<string>();
  for (const engine of engines) {
    if (PREMIUM_SLOTS.includes(engine.slot)) premium.add(engine.model);
  }
  return premium;
}

export function isPremiumModel(model: string, premium: Set<string>): boolean {
  return premium.has(model);
}

/**
 * Where an engine of `model` should live: its preferred range first, then the
 * other range — but only when the preferred one has no free slot left.
 */
export function allocateSlots(args: {
  engines: BlueprintEngine[];
  /** Engines needed, in priority order (e.g. one PCORR per vocal). */
  needed: string[];
  /** Slots already spoken for; never handed out. */
  excluded?: Iterable<number>;
}): Array<{ model: string; slot: number }> {
  const premium = premiumModels(args.engines);
  const free = new Set(Array.from({ length: 16 }, (_, i) => i + 1));
  for (const engine of args.engines) free.delete(engine.slot);
  for (const slot of args.excluded ?? []) free.delete(slot);

  const premiumFree = () => PREMIUM_SLOTS.filter((slot) => free.has(slot));
  const standardFree = () =>
    [...free].filter((slot) => !PREMIUM_SLOTS.includes(slot)).sort((a, b) => a - b);

  const take = (pool: number[]): number | undefined => {
    const slot = pool[0];
    if (slot !== undefined) free.delete(slot);
    return slot;
  };

  const placed: Array<{ model: string; slot: number }> = [];
  for (const model of args.needed) {
    // Standard engines prefer standard slots; premium the premium range. Fall
    // back to the other pool only when the preferred one is exhausted.
    const wantsPremium = isPremiumModel(model, premium);
    const slot = wantsPremium
      ? (take(premiumFree()) ?? take(standardFree()))
      : (take(standardFree()) ?? take(premiumFree()));
    if (slot === undefined) break;
    placed.push({ model, slot });
  }
  return placed;
}
