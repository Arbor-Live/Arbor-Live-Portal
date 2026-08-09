/**
 * Pure helpers for building and editing rider content.
 *
 * The web editor, the starter templates, and any future automation all go
 * through these so that placing a symbol always produces the same linked input
 * channels and monitor mixes.
 */

import {
  matchRiderSource,
  riderSource,
  RIDER_SOURCE_FAMILY_LABELS,
} from "./sources";
import { riderSymbol, type RiderSymbol } from "./symbols";
import type {
  RiderBacklineItem,
  RiderContent,
  RiderInputChannel,
  RiderMonitorMix,
  RiderStage,
  RiderStageItem,
} from "./types";

export const DEFAULT_STAGE: RiderStage = { widthFt: 24, depthFt: 12 };

/** Presets shown in the editor; custom sizes snap to STAGE_SIZE_STEP. */
export const STAGE_PRESETS: Array<{ label: string; stage: RiderStage }> = [
  { label: "Standard (24 × 12 ft)", stage: DEFAULT_STAGE },
  { label: "Small (16 × 12 ft)", stage: { widthFt: 16, depthFt: 12 } },
];

export const STAGE_SIZE_STEP = 4;
export const MIN_STAGE_FT = 8;
export const MAX_STAGE_FT = 80;

/** Snap a stage dimension to the nearest allowed 4 ft increment. */
export function snapStageFt(value: number): number {
  if (!Number.isFinite(value)) return MIN_STAGE_FT;
  const snapped = Math.round(value / STAGE_SIZE_STEP) * STAGE_SIZE_STEP;
  return Math.min(MAX_STAGE_FT, Math.max(MIN_STAGE_FT, snapped));
}

export function stageSizeOptions(): number[] {
  const sizes: number[] = [];
  for (let ft = MIN_STAGE_FT; ft <= MAX_STAGE_FT; ft += STAGE_SIZE_STEP) {
    sizes.push(ft);
  }
  return sizes;
}

let idCounter = 0;

/** Stable-enough ids for array members inside a single rider document. */
export function createRiderId(prefix: string): string {
  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${random}`;
}

export function emptyRiderContent(stage: RiderStage = DEFAULT_STAGE): RiderContent {
  return {
    stage: { ...stage },
    items: [],
    inputs: [],
    monitorMixes: [],
    backline: [],
  };
}

export function itemFootprint(item: RiderStageItem): {
  widthFt: number;
  depthFt: number;
} {
  const symbol = riderSymbol(item.symbol);
  const scale = item.scale > 0 ? item.scale : 1;
  return { widthFt: symbol.widthFt * scale, depthFt: symbol.depthFt * scale };
}

/** Keeps an item's centre inside the stage, allowing a small overhang. */
export function clampToStage(
  position: { xFt: number; yFt: number },
  stage: RiderStage,
): { xFt: number; yFt: number } {
  return {
    xFt: Math.min(Math.max(position.xFt, 0), stage.widthFt),
    yFt: Math.min(Math.max(position.yFt, 0), stage.depthFt),
  };
}

export function round(value: number, step = 0.25): number {
  return Math.round(value / step) * step;
}

/** Physical input slots a channel occupies (a stereo pair spans two). */
export function channelSpan(input: Pick<RiderInputChannel, "stereo">): number {
  return input.stereo ? 2 : 1;
}

export function nextChannelNumber(inputs: RiderInputChannel[]): number {
  return (
    inputs.reduce(
      (max, input) => Math.max(max, input.channel + channelSpan(input) - 1),
      0,
    ) + 1
  );
}

export function nextMixNumber(mixes: RiderMonitorMix[]): number {
  return mixes.reduce((max, mix) => Math.max(max, mix.mixNumber), 0) + 1;
}

/**
 * Rewrites channel numbers so every slot 1..N is used (no gaps) and every
 * stereo pair starts on an odd number (the Wing's physical inputs are paired
 * 1+2, 3+4, …). When a stereo would start on an even slot, the next mono input
 * is pulled into that even slot instead of leaving it empty; if no mono follows
 * (stereo at the tail), the mono before the pair is bumped after it.
 */
export function renumberInputs(inputs: RiderInputChannel[]): RiderInputChannel[] {
  const channels = new Array<number>(inputs.length).fill(0);
  let next = 1;
  for (let i = 0; i < inputs.length; i++) {
    if (channels[i] !== 0) continue;
    const input = inputs[i];
    if (!input.stereo) {
      channels[i] = next;
      next += 1;
      continue;
    }
    if (next % 2 === 1) {
      channels[i] = next;
      next += 2;
      continue;
    }
    // next is even: pull the next mono forward into this slot.
    const filler = inputs.findIndex(
      (candidate, j) => j > i && !candidate.stereo && channels[j] === 0,
    );
    if (filler !== -1) {
      channels[filler] = next;
      next += 1;
      channels[i] = next;
      next += 2;
      continue;
    }
    // No mono ahead — the pair takes this odd slot and the preceding mono
    // (which held next - 1) is bumped after it.
    channels[i] = next - 1;
    for (let j = i - 1; j >= 0; j--) {
      if (channels[j] === next - 1) {
        channels[j] = next + 1;
        break;
      }
    }
    next += 2;
  }
  return inputs.map((input, i) => ({ ...input, channel: channels[i] }));
}

export function renumberMixes(mixes: RiderMonitorMix[]): RiderMonitorMix[] {
  return mixes.map((mix, index) => ({ ...mix, mixNumber: index + 1 }));
}

export function moveInArray<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function inputsForSymbol(
  symbol: RiderSymbol,
  stageItemId: string,
  startChannel: number,
  labelPrefix?: string,
  singleSource?: string,
): RiderInputChannel[] {
  const seeds = symbol.defaultInputs ?? [];
  return seeds.map((seed, index) => ({
    id: createRiderId("in"),
    channel: startChannel + index,
    sourceKey: seed.sourceKey,
    // A one-channel symbol takes its name from the plot label ("Lead vocal"),
    // while multi-channel symbols keep their own naming ("Kick", "Snare", …).
    source:
      seeds.length === 1 && singleSource
        ? singleSource
        : labelPrefix
          ? `${labelPrefix} ${seed.source}`.trim()
          : seed.source,
    inputType: seed.inputType,
    micPreference: seed.micPreference,
    stand: seed.stand ?? "none",
    phantom: seed.phantom ?? false,
    providedBy: seed.providedBy ?? "arbor",
    stereo: seed.stereo ?? false,
    stageItemId,
  }));
}

export type PlaceSymbolOptions = {
  symbolKey: string;
  xFt: number;
  yFt: number;
  label?: string;
  rotation?: number;
  scale?: number;
  /** Prefix applied to auto-created channel names, e.g. a performer's name. */
  channelPrefix?: string;
  /** Skip auto-created channels / mixes (used by "place only" flows). */
  withoutLinkedRows?: boolean;
};

export type PlaceSymbolResult = {
  content: RiderContent;
  itemId: string;
  addedInputIds: string[];
  addedMixId?: string;
};

/**
 * Places a symbol and wires up whatever it implies: input channels for anything
 * that makes noise, a monitor mix for wedges and in-ears.
 */
export function placeSymbol(
  content: RiderContent,
  options: PlaceSymbolOptions,
): PlaceSymbolResult {
  const symbol = riderSymbol(options.symbolKey);
  const itemId = createRiderId("item");
  const position = clampToStage({ xFt: options.xFt, yFt: options.yFt }, content.stage);

  let monitorMixes = content.monitorMixes;
  let addedMixId: string | undefined;
  let label = options.label ?? symbol.defaultLabel;

  if (symbol.monitor && !options.withoutLinkedRows) {
    const mixNumber = nextMixNumber(monitorMixes);
    const mix: RiderMonitorMix = {
      id: createRiderId("mix"),
      mixNumber,
      // The mix is named for whoever hears it; the plot shows the mix number.
      label: options.label ?? `Mix ${mixNumber}`,
      type: symbol.monitor,
      sends: 1,
    };
    monitorMixes = [...monitorMixes, mix];
    addedMixId = mix.id;
    label = `Mix ${mixNumber}`;
  }

  const item: RiderStageItem = {
    id: itemId,
    symbol: symbol.key,
    label,
    xFt: round(position.xFt),
    yFt: round(position.yFt),
    rotation: options.rotation ?? 0,
    scale: options.scale ?? 1,
    monitorMixId: addedMixId,
  };

  const newInputs = options.withoutLinkedRows
    ? []
    : inputsForSymbol(
        symbol,
        itemId,
        nextChannelNumber(content.inputs),
        options.channelPrefix,
        options.label,
      );

  return {
    content: {
      ...content,
      items: [...content.items, item],
      inputs: [...content.inputs, ...newInputs],
      monitorMixes,
    },
    itemId,
    addedInputIds: newInputs.map((input) => input.id),
    addedMixId,
  };
}

/** Removes an item along with the channels and mix it created. */
export function removeItem(content: RiderContent, itemId: string): RiderContent {
  const item = content.items.find((candidate) => candidate.id === itemId);
  return {
    ...content,
    items: content.items.filter((candidate) => candidate.id !== itemId),
    inputs: renumberInputs(
      content.inputs.filter((input) => input.stageItemId !== itemId),
    ),
    monitorMixes: item?.monitorMixId
      ? content.monitorMixes.filter((mix) => mix.id !== item.monitorMixId)
      : content.monitorMixes,
  };
}

export function updateItem(
  content: RiderContent,
  itemId: string,
  patch: Partial<RiderStageItem>,
): RiderContent {
  return {
    ...content,
    items: content.items.map((item) =>
      item.id === itemId ? { ...item, ...patch } : item,
    ),
  };
}

export function blankInput(inputs: RiderInputChannel[]): RiderInputChannel {
  return {
    id: createRiderId("in"),
    channel: nextChannelNumber(inputs),
    source: "",
    inputType: "mic",
    stand: "tall_boom",
    phantom: false,
    providedBy: "arbor",
  };
}

export function blankMix(mixes: RiderMonitorMix[]): RiderMonitorMix {
  const mixNumber = nextMixNumber(mixes);
  return {
    id: createRiderId("mix"),
    mixNumber,
    label: `Mix ${mixNumber}`,
    type: "wedge",
    sends: 1,
  };
}

/**
 * Family heading for a channel, derived from its role — "Drums", "Vocals".
 * Null when the channel is unmapped and we have nothing to derive from.
 *
 * This replaced a band-editable DCA group. Console DCA layout is a property of
 * the rig, not the band: a shared night has 16 slots for every act, so seven
 * riders each nominating their own layout produced work that had to be thrown
 * away and reconciled. The list still reads grouped, with nothing to maintain.
 */
export function inputFamilyLabel(input: RiderInputChannel): string | null {
  const source = input.sourceKey ? riderSource(input.sourceKey) : undefined;
  return source ? RIDER_SOURCE_FAMILY_LABELS[source.family] : null;
}

/**
 * Places a channel after the last one sharing its family, so a row joins its
 * group the moment it gets a role instead of sitting at the bottom. Appends when
 * the family is not on the list yet, or when there is no role to group by.
 *
 * Deliberately not a global sort: array order is patch order, and a band that
 * drags a channel somewhere means it.
 */
export function insertByFamily(
  inputs: RiderInputChannel[],
  input: RiderInputChannel,
): RiderInputChannel[] {
  const family = inputFamilyLabel(input);
  if (!family) return [...inputs, input];
  let lastIndex = -1;
  inputs.forEach((candidate, index) => {
    if (inputFamilyLabel(candidate) === family) lastIndex = index;
  });
  if (lastIndex === -1) return [...inputs, input];
  const next = [...inputs];
  next.splice(lastIndex + 1, 0, input);
  return next;
}

/**
 * Numbers the channels that share a role, so two `gtr` channels read as
 * "Guitar 1" and "Guitar 2" without either the vocabulary or the stored rider
 * carrying an instance. Keyed by input id; a role used once is absent.
 */
export function sourceOrdinals(inputs: RiderInputChannel[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const input of inputs) {
    if (!input.sourceKey) continue;
    counts.set(input.sourceKey, (counts.get(input.sourceKey) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const ordinals = new Map<string, number>();
  for (const input of inputs) {
    const key = input.sourceKey;
    if (!key || (counts.get(key) ?? 0) < 2) continue;
    const next = (seen.get(key) ?? 0) + 1;
    seen.set(key, next);
    ordinals.set(input.id, next);
  }
  return ordinals;
}

/** Channels with no canonical source — crew resolves these at generation time. */
export function unmappedInputs(content: RiderContent): RiderInputChannel[] {
  return content.inputs.filter((input) => !input.sourceKey);
}

/**
 * Fills `sourceKey` on channels written before the vocabulary existed.
 *
 * Provenance beats text: a channel created by placing a symbol is matched back
 * to the seed that made it, so a renamed "Kick" → "Big Boy" still resolves.
 * Only channels with no provenance fall back to matching their text, and that
 * match is exact — anything else stays unmapped rather than guessing.
 */
export function backfillSourceKeys(content: RiderContent): RiderContent {
  const seenPerItem = new Map<string, number>();
  const inputs = content.inputs.map((input) => {
    if (input.sourceKey) return input;

    if (input.stageItemId) {
      const index = seenPerItem.get(input.stageItemId) ?? 0;
      seenPerItem.set(input.stageItemId, index + 1);
      const item = content.items.find((entry) => entry.id === input.stageItemId);
      const seeds = item ? (riderSymbol(item.symbol).defaultInputs ?? []) : [];
      // Position is not trustworthy — channels can be reordered or deleted after
      // the symbol created them — so only lean on it when the symbol has a
      // single seed (unambiguous) or nothing else identifies the row.
      const seed =
        seeds.length === 1
          ? seeds[0]
          : (seeds.find((candidate) => matchesSeedText(input.source, candidate.source)) ??
            seeds[index]);
      if (seed?.sourceKey) return { ...input, sourceKey: seed.sourceKey };
    }

    const matched = matchRiderSource(input.source);
    return matched ? { ...input, sourceKey: matched.key } : input;
  });
  return { ...content, inputs };
}

/**
 * Whether a channel's text still looks like the seed that made it, allowing for
 * the label prefix `placeSymbol` adds ("Sax Horn") and a trailing instance
 * number the band may have typed ("Overhead 2").
 */
function matchesSeedText(source: string, seedSource: string): boolean {
  const clean = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  // A seeded "Overheads" becomes "Overhead L" / "Overhead R" on the row, so
  // tolerate the plural and the side suffix. Bounded normalization, not fuzzy
  // matching — anything looser starts inventing mappings.
  const singular = (text: string) => text.replace(/s$/, "");
  const seed = singular(clean(seedSource));
  if (!seed) return false;
  const trimmed = singular(
    clean(source).replace(/ \d+$/, "").replace(/ [lr]$/, ""),
  );
  return trimmed === seed || trimmed.endsWith(` ${seed}`);
}

export function blankBacklineItem(): RiderBacklineItem {
  return {
    id: createRiderId("bl"),
    label: "",
    quantity: 1,
    providedBy: "band",
  };
}

export type RiderSummary = {
  itemCount: number;
  performerCount: number;
  channelCount: number;
  mixCount: number;
  phantomCount: number;
};

export function summarizeRider(content: RiderContent): RiderSummary {
  return {
    itemCount: content.items.length,
    performerCount: content.items.filter(
      (item) => riderSymbol(item.symbol).category === "performer",
    ).length,
    channelCount: content.inputs.reduce(
      (count, input) => count + channelSpan(input),
      0,
    ),
    mixCount: content.monitorMixes.length,
    phantomCount: content.inputs.filter((input) => input.phantom).length,
  };
}

/**
 * Problems worth surfacing before a rider is treated as show-ready. Kept
 * advisory: bands can still save and export an incomplete rider.
 */
export function riderWarnings(content: RiderContent): string[] {
  const warnings: string[] = [];
  if (content.items.length === 0) {
    warnings.push("The stage plot is empty — drag symbols onto the stage.");
  }
  if (content.inputs.length === 0) {
    warnings.push("No input channels yet, so nobody knows what to patch.");
  }
  if (content.inputs.some((input) => !input.source.trim())) {
    warnings.push("Some input channels have no source name.");
  }
  if (content.monitorMixes.length === 0) {
    warnings.push("No monitor mixes — add a wedge or in-ear pack for each mix.");
  }
  const unmapped = unmappedInputs(content).length;
  if (unmapped > 0) {
    warnings.push(
      unmapped === 1
        ? "1 channel isn't matched to a source type — we'll confirm it at load-in."
        : `${unmapped} channels aren't matched to a source type — we'll confirm them at load-in.`,
    );
  }
  return warnings;
}
