/**
 * Pure helpers for building and editing rider content.
 *
 * The web editor, the starter templates, and any future automation all go
 * through these so that placing a symbol always produces the same linked input
 * channels and monitor mixes.
 */

import { riderSymbol, type RiderSymbol } from "./symbols";
import type {
  RiderBacklineItem,
  RiderContent,
  RiderInputChannel,
  RiderMonitorMix,
  RiderStage,
  RiderStageItem,
} from "./types";

export const DEFAULT_STAGE: RiderStage = { widthFt: 24, depthFt: 16 };

export const STAGE_PRESETS: Array<{ label: string; stage: RiderStage }> = [
  { label: "Small (16 × 12 ft)", stage: { widthFt: 16, depthFt: 12 } },
  { label: "Standard (24 × 16 ft)", stage: DEFAULT_STAGE },
  { label: "Large (32 × 20 ft)", stage: { widthFt: 32, depthFt: 20 } },
  { label: "Wide (40 × 24 ft)", stage: { widthFt: 40, depthFt: 24 } },
];

export const MIN_STAGE_FT = 8;
export const MAX_STAGE_FT = 80;

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

export function nextChannelNumber(inputs: RiderInputChannel[]): number {
  return inputs.reduce((max, input) => Math.max(max, input.channel), 0) + 1;
}

export function nextMixNumber(mixes: RiderMonitorMix[]): number {
  return mixes.reduce((max, mix) => Math.max(max, mix.mixNumber), 0) + 1;
}

/** Rewrites channel numbers to 1..n in list order (used after drag reorder). */
export function renumberInputs(inputs: RiderInputChannel[]): RiderInputChannel[] {
  return inputs.map((input, index) => ({ ...input, channel: index + 1 }));
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
    channelCount: content.inputs.length,
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
  return warnings;
}
