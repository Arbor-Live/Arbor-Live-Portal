/**
 * Starter riders. Picking one gives a band a complete, realistic plot plus the
 * matching input list and monitor mixes, which they then edit — far faster than
 * building a rider from an empty stage.
 *
 * Layouts mirror the curated default looks (Main / Trio / SS / DJ).
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
    inputs: renumberInputs(extras?.inputs ?? content.inputs),
    monitorMixes: extras?.monitorMixes ?? content.monitorMixes,
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
    description:
      "Drums, bass, guitar, keys and a front vocalist with three mixes (vocals, keys, drums).",
    build: () =>
      build(
        { widthFt: 24, depthFt: 12 },
        [
          { symbol: "drum_kit", xFt: 12, yFt: 3 },
          { symbol: "bass_rig", xFt: 2.25, yFt: 4.75, positionOnly: true },
          { symbol: "guitar_amp", xFt: 21.75, yFt: 6, label: "Electric Guitar" },
          { symbol: "bassist", xFt: 4.25, yFt: 7.25, label: "Bass" },
          { symbol: "guitarist", xFt: 18.5, yFt: 7.5, label: "Guitar", positionOnly: true },
          { symbol: "vocalist", xFt: 12, yFt: 8, label: "Lead vocal" },
          { symbol: "vocal_mic", xFt: 5.5, yFt: 8.5, label: "BV 1" },
          { symbol: "vocal_mic", xFt: 19.75, yFt: 8.75, label: "BV 2" },
          { symbol: "wedge", xFt: 12, yFt: 10.75, label: "Vocals" },
          { symbol: "wedge", xFt: 8.75, yFt: 4.25, rotation: 30, label: "Keys" },
          { symbol: "wedge", xFt: 16.5, yFt: 2.25, rotation: 45, label: "Drums" },
          { symbol: "power_drop", xFt: 22.5, yFt: 1.5 },
          { symbol: "keyboard_rig", xFt: 19.75, yFt: 3.25, rotation: 15, label: "Keys" },
        ],
        {
          performerCount: 5,
          backline: [
            backline("Drum kit", "arbor"),
            backline("Bass amp", "band"),
            backline("Guitar amp", "band"),
            backline("Keyboard", "arbor"),
          ],
          powerNotes: "Two edison drops upstage — one stage left, one stage right.",
        },
      ),
  },
  {
    key: "power_trio",
    name: "Power trio",
    description: "Guitar, bass and drums — wired drum/bass vocals plus a wireless for guitar.",
    build: () =>
      build(
        { widthFt: 16, depthFt: 12 },
        [
          { symbol: "drum_kit", xFt: 9, yFt: 3 },
          { symbol: "bass_rig", xFt: 1.5, yFt: 3.5, positionOnly: true },
          { symbol: "guitar_amp", xFt: 14.75, yFt: 4, positionOnly: true },
          { symbol: "vocal_mic", xFt: 8, yFt: 1.25, label: "Drum vocal" },
          { symbol: "bassist", xFt: 4, yFt: 6, label: "Bass" },
          { symbol: "guitarist", xFt: 12, yFt: 6, label: "Guitar" },
          { symbol: "vocal_mic", xFt: 4, yFt: 9, label: "Bass vocal" },
          { symbol: "wedge", xFt: 4, yFt: 11, label: "Bass vocal" },
          { symbol: "wedge", xFt: 12, yFt: 11, label: "Guitar vocal" },
          { symbol: "wedge", xFt: 6.25, yFt: 2.5, rotation: 30, label: "Drums" },
          {
            symbol: "wireless_mic",
            xFt: 12.75,
            yFt: 8.75,
            rotation: 30,
            label: "Wireless mic",
          },
        ],
        {
          performerCount: 3,
          backline: [
            backline("Drum kit (shells + hardware)", "arbor"),
            backline("Bass amp", "band"),
            backline("Guitar amp", "band"),
          ],
        },
      ),
  },
  {
    key: "singer_songwriter",
    name: "Singer-songwriter",
    description: "Vocal, acoustic DI, instrument mic, and one mix.",
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
          {
            symbol: "instrument_mic",
            xFt: 9.25,
            yFt: 5.5,
            rotation: 15,
            label: "Mic",
          },
        ],
        {
          performerCount: 1,
          backline: [backline("Guitar", "band")],
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
          { symbol: "dj", xFt: 8, yFt: 4.25, label: "DJ", positionOnly: true },
          { symbol: "wireless_mic", xFt: 10.5, yFt: 5.75, label: "MC mic" },
          { symbol: "wedge", xFt: 4, yFt: 10, label: "Booth left" },
          { symbol: "wedge", xFt: 12, yFt: 10, label: "Booth right" },
          { symbol: "table", xFt: 8, yFt: 7, label: "Booth table" },
          { symbol: "power_drop", xFt: 14, yFt: 6 },
          { symbol: "dj_booth", xFt: 8, yFt: 7 },
        ],
        {
          performerCount: 1,
          backline: [
            backline("Booth table (6 ft)", "arbor"),
            backline("DJ Mixing Table", "band"),
          ],
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
