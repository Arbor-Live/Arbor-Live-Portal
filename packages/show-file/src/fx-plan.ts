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
  const need = ordered.length;

  // Reuse the blueprint's own engines first, in slot order, then allocate extras
  // for the remainder. This keeps engine settings the blueprint configured.
  const existingByModel = (model: string) =>
    engines
      .filter((engine) => engine.model === model)
      .sort((a, b) => a.slot - b.slot)
      .map((engine) => engine.slot);

  const pcorrSlots = existingByModel(PCORR_MODEL);
  const deesserSlots = existingByModel(DEESSER_MODEL);

  // One engine per vocal, of each model, in vocal order; the front of each
  // pool is reused and any miss needs an extra.
  const reusedPcorr = pcorrSlots.slice(0, need);
  const reusedDeesser = deesserSlots.slice(0, need);

  // Spares beyond what the vocals need are surplus: `clearUnusedFx` will blank
  // them, so their slots are free for the extras — otherwise a spare PCORR
  // would push a DE-S2 into a premium reverb slot.
  const surplus = new Set<number>([
    ...pcorrSlots.slice(need),
    ...deesserSlots.slice(need),
  ]);
  const enginesForAlloc = engines.filter((engine) => !surplus.has(engine.slot));
  const excluded = new Set<number>([...reusedPcorr, ...reusedDeesser]);

  const extrasNeeded: string[] = [
    ...new Array<string>(Math.max(0, need - reusedPcorr.length)).fill(PCORR_MODEL),
    ...new Array<string>(Math.max(0, need - reusedDeesser.length)).fill(DEESSER_MODEL),
  ];

  // Extras go into the best free slot, cloned from the blueprint's own engine of
  // that model so its settings come along.
  const additions: Array<{ model: string; slot: number; cloneFrom: number }> = [];
  const extraSlots = extrasNeeded.length
    ? allocateSlots({ engines: enginesForAlloc, needed: extrasNeeded, excluded })
    : [];
  const extraByModel: Record<string, number[]> = { [PCORR_MODEL]: [], [DEESSER_MODEL]: [] };
  for (const { model, slot } of extraSlots) {
    extraByModel[model] = extraByModel[model] ?? [];
    extraByModel[model]!.push(slot);
    additions.push({ model, slot, cloneFrom: existingByModel(model)[0]! });
  }

  const pcorrSlotsFinal = [...reusedPcorr, ...(extraByModel[PCORR_MODEL] ?? [])];
  const deesserSlotsFinal = [...reusedDeesser, ...(extraByModel[DEESSER_MODEL] ?? [])];

  const assignments = ordered.map((vocal, index) => ({
    strip: vocal.strip,
    pcorrSlot: pcorrSlotsFinal[index] ?? null,
    deesserSlot: deesserSlotsFinal[index] ?? null,
  }));

  return { assignments, additions };
}
