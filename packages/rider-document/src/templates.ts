/**
 * Starter riders. Picking one gives a band a complete, realistic plot plus the
 * matching input list and monitor mixes, which they then edit — far faster than
 * building a rider from an empty stage.
 */

import {
  createRiderId,
  emptyRiderContent,
  placeSymbol,
  renumberInputs,
} from "./content";
import type { RiderBacklineItem, RiderContent, RiderProvidedBy, RiderStage } from "./types";

type Placement = {
  symbol: string;
  xFt: number;
  yFt: number;
  label?: string;
  rotation?: number;
  scale?: number;
  /** Position-only marker: the channel comes from another symbol. */
  positionOnly?: boolean;
};

function backline(
  label: string,
  providedBy: RiderProvidedBy,
  quantity = 1,
): RiderBacklineItem {
  return { id: createRiderId("bl"), label, quantity, providedBy };
}

function build(
  stage: RiderStage,
  placements: Placement[],
  extras?: Partial<RiderContent>,
): RiderContent {
  let content = emptyRiderContent(stage);
  for (const placement of placements) {
    content = placeSymbol(content, {
      symbolKey: placement.symbol,
      xFt: placement.xFt,
      yFt: placement.yFt,
      label: placement.label,
      rotation: placement.rotation,
      scale: placement.scale,
      withoutLinkedRows: placement.positionOnly,
    }).content;
  }
  return {
    ...content,
    ...extras,
    inputs: renumberInputs(content.inputs),
  };
}

export type RiderTemplate = {
  key: string;
  name: string;
  description: string;
  build: () => RiderContent;
};

export const RIDER_TEMPLATES: RiderTemplate[] = [
  {
    key: "full_band",
    name: "Full band (5 piece)",
    description: "Drums, bass, guitar, keys and a front vocalist with four mixes.",
    build: () =>
      build(
        { widthFt: 24, depthFt: 16 },
        [
          { symbol: "drum_kit", xFt: 12, yFt: 4 },
          { symbol: "bass_rig", xFt: 4.5, yFt: 3.5 },
          { symbol: "guitar_amp", xFt: 19.5, yFt: 3.5 },
          { symbol: "keyboard_rig", xFt: 12, yFt: 9.4, label: "Keys" },
          { symbol: "bassist", xFt: 5, yFt: 8.6, label: "Bass", positionOnly: true },
          { symbol: "guitarist", xFt: 19, yFt: 8.6, label: "Guitar", positionOnly: true },
          { symbol: "vocalist", xFt: 12, yFt: 11.9, label: "Lead vocal" },
          { symbol: "vocal_mic", xFt: 5, yFt: 11.6, label: "BV 1" },
          { symbol: "vocal_mic", xFt: 19, yFt: 11.6, label: "BV 2" },
          { symbol: "wedge", xFt: 12, yFt: 14.4, label: "Lead vocal" },
          { symbol: "wedge", xFt: 5, yFt: 13.8, label: "Bass / BV 1" },
          { symbol: "wedge", xFt: 19, yFt: 13.8, label: "Guitar / BV 2" },
          { symbol: "wedge", xFt: 16.8, yFt: 7, rotation: 210, label: "Drums" },
          { symbol: "power_drop", xFt: 22.6, yFt: 2.2 },
        ],
        {
          performerCount: 5,
          backline: [
            backline("Drum kit (shells + hardware, band brings cymbals/snare)", "arbor"),
            backline("Bass amp", "arbor"),
            backline("Guitar amp", "band"),
            backline("Keyboard stand", "band"),
          ],
          powerNotes: "Two edison drops upstage — one stage left, one stage right.",
        },
      ),
  },
  {
    key: "power_trio",
    name: "Power trio",
    description: "Guitar, bass and drums, all three on vocals.",
    build: () =>
      build(
        { widthFt: 24, depthFt: 16 },
        [
          { symbol: "drum_kit", xFt: 12, yFt: 4 },
          { symbol: "bass_rig", xFt: 5, yFt: 4 },
          { symbol: "guitar_amp", xFt: 19, yFt: 4 },
          { symbol: "vocal_mic", xFt: 12, yFt: 8.4, label: "Drum vocal" },
          { symbol: "bassist", xFt: 6, yFt: 10.4, label: "Bass", positionOnly: true },
          { symbol: "guitarist", xFt: 18, yFt: 10.4, label: "Guitar", positionOnly: true },
          { symbol: "vocal_mic", xFt: 6, yFt: 12.6, label: "Bass vocal" },
          { symbol: "vocal_mic", xFt: 18, yFt: 12.6, label: "Guitar vocal" },
          { symbol: "wedge", xFt: 6, yFt: 14.4, label: "Bass vocal" },
          { symbol: "wedge", xFt: 18, yFt: 14.4, label: "Guitar vocal" },
          { symbol: "wedge", xFt: 15.8, yFt: 7, rotation: 210, label: "Drums" },
        ],
        {
          performerCount: 3,
          backline: [
            backline("Drum kit (shells + hardware)", "arbor"),
            backline("Bass amp", "arbor"),
            backline("Guitar amp", "band"),
          ],
        },
      ),
  },
  {
    key: "singer_songwriter",
    name: "Singer-songwriter",
    description: "One vocal, one acoustic DI, one mix. The classic small set.",
    build: () =>
      build(
        { widthFt: 16, depthFt: 12 },
        [
          { symbol: "vocal_mic", xFt: 8, yFt: 5.5, label: "Vocal" },
          { symbol: "stool", xFt: 8, yFt: 7 },
          { symbol: "di_box", xFt: 10, yFt: 7, label: "Acoustic DI" },
          { symbol: "music_stand", xFt: 6, yFt: 6.5 },
          { symbol: "wedge", xFt: 8, yFt: 9.5, label: "Vocal + guitar" },
          { symbol: "power_drop", xFt: 14.5, yFt: 1 },
        ],
        {
          performerCount: 1,
          backline: [backline("Guitar stand", "band")],
        },
      ),
  },
  {
    key: "dj_set",
    name: "DJ set",
    description: "Booth with stereo DI, an MC mic and two wedges.",
    build: () =>
      build(
        { widthFt: 16, depthFt: 12 },
        [
          { symbol: "dj_booth", xFt: 8, yFt: 4.2 },
          { symbol: "dj", xFt: 8, yFt: 6.8, label: "DJ", positionOnly: true },
          { symbol: "vocal_mic", xFt: 11.4, yFt: 5, label: "MC mic" },
          { symbol: "wedge", xFt: 4.6, yFt: 8.8, label: "Booth left" },
          { symbol: "wedge", xFt: 11.4, yFt: 8.8, label: "Booth right" },
          { symbol: "table", xFt: 8, yFt: 1.4, label: "Booth table" },
          { symbol: "power_drop", xFt: 14.6, yFt: 1.4 },
        ],
        {
          performerCount: 1,
          backline: [backline("Booth table (6 ft)", "arbor")],
        },
      ),
  },
  {
    key: "blank",
    name: "Empty stage",
    description: "Start from nothing and drag on exactly what you need.",
    build: () => emptyRiderContent(),
  },
];

export function riderTemplate(key: string): RiderTemplate | undefined {
  return RIDER_TEMPLATES.find((template) => template.key === key);
}
