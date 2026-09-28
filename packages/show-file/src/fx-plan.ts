import { allocateSlots, type BlueprintEngine } from "./fx-allocate";

/**
 * Vocal FX plan: pitch correction and de-essing on the vocal channels.
 *
 * A WING channel has two insert points: `preins` and `postins`. Vocals get
 * PCORR on the pre insert (pitch correct before dynamics) and DE-S2 on the post
 * insert (de-ess after) — one effect on each.
 *
 * Engines are placed by `fx-allocate`: standard engines (PCORR/DE-S2) prefer the
 * standard slots so they never squat a premium reverb slot, and if the blueprint
 * does not already have enough engines we name the ones to load (cloned from an
 * existing engine of the same model) so every vocal gets its own.
 */

/** FX engine models the vocal chain looks for. */
export const PCORR_MODEL = "PCORR";
export const DEESSER_MODEL = "DE-S2";

export type VocalFxAssignment = {
  /** Console strip the inserts land on. */
  strip: number;
  /** Slot holding this vocal's PCORR engine, or null when none is left. */
  pcorrSlot: number | null;
  /** Slot holding this vocal's DE-S2 engine, or null when none is left. */
  deesserSlot: number | null;
};

export type VocalFxPlan = {
  assignments: VocalFxAssignment[];
  /** Engines to load beyond the blueprint's own (model + target slot). */
  additions: Array<{ model: string; slot: number; cloneFrom: number }>;
};

/**
 * Plan the vocal FX: leads first, then backings, each getting its own PCORR and
 * DE-S2. The blueprint decides how many engines exist; when vocals outnumber
 * them we allocate extra slots for clones rather than sharing one engine.
 */
export function planVocalFx(
  vocals: Array<{ strip: number; isLead: boolean }>,
  engines: BlueprintEngine[],
): VocalFxPlan {
  const ordered = [
    ...vocals.filter((vocal) => vocal.isLead),
    ...vocals.filter((vocal) => !vocal.isLead),
  ];

  // Reuse the blueprint's own engines first, in slot order, then allocate extras
  // for the remainder. This keeps engine settings the blueprint configured.
  const existingByModel = (model: string) =>
    engines
      .filter((engine) => engine.model === model)
      .sort((a, b) => a.slot - b.slot)
      .map((engine) => engine.slot);

  const availableByModel: Record<string, number[]> = {
    [PCORR_MODEL]: existingByModel(PCORR_MODEL),
    [DEESSER_MODEL]: existingByModel(DEESSER_MODEL),
  };

  // Reuse the blueprint's engines first, then allocate extras for the rest.
  const extrasNeeded: string[] = [];
  const takeFor = (model: string): number | null => {
    const pool = availableByModel[model] ?? [];
    if (pool.length > 0) return pool.shift()!;
    extrasNeeded.push(model);
    return null;
  };

  // One engine per vocal, of each model, in vocal order. Reused slots come back
  // immediately; misses are filled by the extra allocation just below.
  const reusedPcorr: number[] = [];
  const reusedDeesser: number[] = [];
  for (let index = 0; index < ordered.length; index++) {
    const pcorr = takeFor(PCORR_MODEL);
    if (pcorr !== null) reusedPcorr.push(pcorr);
    const deesser = takeFor(DEESSER_MODEL);
    if (deesser !== null) reusedDeesser.push(deesser);
  }

  // Extras go into the best free slot, cloned from the blueprint's own engine of
  // that model so its settings come along.
  const spent = new Set<number>(Object.values(availableByModel).flat());
  const additions: Array<{ model: string; slot: number; cloneFrom: number }> = [];
  const extraSlots = extrasNeeded.length
    ? allocateSlots({ engines, needed: extrasNeeded, excluded: spent })
    : [];
  const extraByModel: Record<string, number[]> = { [PCORR_MODEL]: [], [DEESSER_MODEL]: [] };
  for (const { model, slot } of extraSlots) {
    extraByModel[model] = extraByModel[model] ?? [];
    extraByModel[model]!.push(slot);
    additions.push({ model, slot, cloneFrom: existingByModel(model)[0]! });
  }

  const pcorrSlots = [...reusedPcorr, ...(extraByModel[PCORR_MODEL] ?? [])];
  const deesserSlots = [...reusedDeesser, ...(extraByModel[DEESSER_MODEL] ?? [])];

  const assignments = ordered.map((vocal, index) => ({
    strip: vocal.strip,
    pcorrSlot: pcorrSlots[index] ?? null,
    deesserSlot: deesserSlots[index] ?? null,
  }));

  return { assignments, additions };
}
