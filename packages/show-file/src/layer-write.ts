import {
  USER_LAYER_SLOTS,
  WING_COMPACT_FADERS,
  type LayerPage,
  type LayerSlot,
} from "./layers";
import { VOCAL_FX_BUSES } from "./groups";

/**
 * Write our fader pages onto the desk's surface.
 *
 * The WING Compact has one 12-fader section: four channel banks, a BUSES bank,
 * and USER1/USER2. In a `.snap` these are `ce_data.layer.L[n]` — bank 6 is
 * USER1, bank 7 is USER2 — each with 24 assignable slots (two 12-fader pages).
 * We write the generated pages into USER1, the layer an operator reaches with
 * the bank button and that ships empty.
 */
export const LAYER_BANK = {
  /** `layer.L` bank holding USER1. */
  user1: 6,
  /** Slots in a bank (two 12-fader pages). */
  slots: USER_LAYER_SLOTS,
} as const;

/**
 * USB 1/2 walk-in music lives on the mixer's USB input. We reserve a fader for
 * it and point that slot at channel 33/34, the Wing's fixed USB stereo pair.
 */
const USB_MUSIC_CHANNEL = 33;

/** `layer.L` bank holding USER2 (the vocal FX return page). */
const USER2_BANK = 7;

/** Slots the USER1 bank exposes (two 12-fader pages). */
export const LAYER_SLOT_CAPACITY = LAYER_BANK.slots;

type DeskSlot = { type: string; i: number; dst: number };
type DeskBank = Record<string, DeskSlot | number | string>;

/** Minimal slice of a snap the layer writer touches. */
type LayerTarget = {
  ce_data?: {
    layer?: {
      L?: Record<string, Record<string, unknown>>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/** What the desk stores for one of our page slots. */
function toDeskSlot(slot: LayerSlot): Omit<DeskSlot, "dst"> {
  if (slot.kind === "dca") return { type: "DCA", i: slot.dca };
  if (slot.kind === "usb") return { type: "CH", i: USB_MUSIC_CHANNEL };
  return { type: "CH", i: slot.strip };
}

/**
 * Flatten pages, write the first USER1-bank worth into USER1, and report what
 * did not fit. Returns the pages' slots and the overflow (still patched and
 * named — just not reachable from USER1).
 */
export function writeLayerPages(
  snap: LayerTarget,
  pages: LayerPage[],
  overflow: LayerSlot[] = [],
): { assigned: LayerSlot[]; overflow: LayerSlot[] } {
  const layer = snap.ce_data?.layer?.L;
  const assigned = pages.flatMap((page) => page.slots);
  if (!layer) return { assigned, overflow };

  const bank: DeskBank = { name: "USER1", ofs: 0 };
  for (let slot = 0; slot < LAYER_BANK.slots; slot++) {
    // `dst` is the on-screen page: 1 for faders 1-12, 2 for faders 13-24.
    const dst = slot < WING_COMPACT_FADERS ? 1 : 2;
    bank[String(slot + 1)] = { type: "OFF", i: 0, dst };
  }

  // Place each page's slots on their real fader number, so a reserved fader
  // (USB on 12) stays put instead of everything sliding left.
  pages.forEach((page, pageIndex) => {
    page.slots.forEach((slot, index) => {
      const fader = (page.positions[index] ?? index + 1) + pageIndex * WING_COMPACT_FADERS;
      if (fader < 1 || fader > LAYER_BANK.slots) return;
      const dst = fader <= WING_COMPACT_FADERS ? 1 : 2;
      bank[String(fader)] = { ...toDeskSlot(slot), dst };
    });
  });

  layer[String(LAYER_BANK.user1)] = bank;

  // USER2 is the vocal FX page: the reverb returns an engineer rides while
  // mixing vocals. Only built when the desk actually has those returns.
  const vocalBuses = pages.length > 0 ? VOCAL_FX_BUSES : [];
  const user2: DeskBank = { name: "USER2", ofs: 0 };
  for (let slot = 0; slot < LAYER_BANK.slots; slot++) {
    const dst = slot < WING_COMPACT_FADERS ? 1 : 2;
    const busIndex = slot % VOCAL_FX_BUSES.length;
    const bus = vocalBuses.length > 0 && slot < vocalBuses.length * 2
      ? vocalBuses[busIndex]
      : undefined;
    user2[String(slot + 1)] = bus
      ? { type: "BUS", i: bus, dst }
      : { type: "OFF", i: 0, dst };
  }
  layer[String(USER2_BANK)] = user2;

  return { assigned, overflow };
}
