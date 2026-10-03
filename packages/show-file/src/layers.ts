import type { DeskGroup } from "./groups";
import { MELODY_FAMILIES, groupLayoutFor } from "./groups";
import type { RiderSourceFamily } from "@arbor/rider-document";
import type { SlotFamily } from "./types";

/**
 * A fader-bank page for the desk surface. The WING Compact's USER layer shows
 * 12 faders at a time; a page is one screenful, and a bank holds two pages.
 */
export type LayerPage = {
  /** Page name, e.g. "Vocals", "Drums", "Melody", "Tracks". */
  name: string;
  /** 1-based page number across the surface. */
  page: number;
  /** Where the page sits in the scheme. */
  kind: "group" | "overflow";
  /** Fader slots on this page, in fader order. */
  slots: LayerSlot[];
  /** 1-based fader each slot sits on (page 1 reserves fader 12 for USB). */
  positions: number[];
};

export type LayerSlot =
  | { kind: "dca"; name: string; dca: number }
  | { kind: "channel"; name: string; strip: number; family: SlotFamily }
  /** Walk-in music: USB 1/2 stereo in, reserved on the last USER1 fader. */
  | { kind: "usb"; name: string; stereo: true };

/** Faders the WING Compact USER layer shows at once. */
export const WING_COMPACT_FADERS = 12;

/** Slots in the USER bank (two 12-fader pages). */
export const USER_LAYER_SLOTS = WING_COMPACT_FADERS * 2;

/** The fader reserved for USB 1/2 walk-in music (last fader of the first page). */
export const USB_MUSIC_SLOT = WING_COMPACT_FADERS;

export type LayerInput = {
  name: string;
  strip: number;
  family: SlotFamily;
  group?: DeskGroup;
};

/**
 * Whether the melodic frontline must compress into one Melody DCA to keep the
 * whole show on page 1. Shared with the allocator so the DCA tags and the page
 * layout always agree — the compressed Melody DCA has to actually own the
 * melodic channels, or its fader would only ride whichever family sits on that
 * slot.
 *
 * Costs on page 1 (11 usable faders, fader 12 is USB music): the vocals (DCA +
 * channels), the drums (one DCA), the compressed tracks/utility DCAs, and the
 * melodic groups either exploded (DCA + channels each) or as one Melody DCA.
 */
export function melodyNeedsCompression(args: {
  groups: DeskGroup[];
  channels: LayerInput[];
}): boolean {
  const channelsIn = (family: RiderSourceFamily) =>
    args.channels.filter((channel) => channel.group?.id === family);
  const vocalChannels = channelsIn("vocals").length;
  const drumChannels = channelsIn("drums").length;

  // Vocals: DCA (when >1) + every channel.
  let used = vocalChannels > 0 ? vocalChannels + (vocalChannels > 1 ? 1 : 0) : 0;
  // FX DCA sits on the vocal page.
  if (vocalChannels > 0) used += 1;
  // Drums: one DCA when >1, else the single channel.
  used += drumChannels > 0 ? (drumChannels > 1 ? 1 : drumChannels) : 0;
  // Tracks/utility: one DCA each when present.
  used += args.groups.filter(
    (group) =>
      (group.id === "playback" || group.id === "utility") &&
      channelsIn(group.id).length > 0,
  ).length;

  const melodyGroups = args.groups.filter((group) =>
    MELODY_FAMILIES.includes(group.id),
  );
  const exploded = melodyGroups.reduce((count, group) => {
    const members = channelsIn(group.id).length;
    return count + (members > 0 ? members + (members > 1 ? 1 : 0) : 0);
  }, 0);
  const melodicPresent = melodyGroups.some(
    (group) => channelsIn(group.id).length > 0,
  );
  const compressed = melodicPresent ? 1 : 0;

  const pageOneRoom = USB_MUSIC_SLOT - 1;
  return used + exploded > pageOneRoom && used + compressed <= pageOneRoom;
}

/**
 * Build the USER1 pages for the night.
 *
 * Priority, highest first:
 *  1. Vocals — always exploded (DCA + every vocal channel); pages as needed.
 *  2. Drums — always one collapsed DCA.
 *  3. Melodic groups (guitar/bass/keys/strings/winds/perc) — each gets its own
 *     DCA-and-members page while faders remain; once they run out, whatever is
 *     left collapses into a single **Melody** DCA.
 *  4. Tracks and utility — their own DCA page (kept out of Melody).
 *  5. Reserved: USB 1/2 music on fader 12 of the first page.
 *
 * Anything past the USER bank is returned as overflow (still patched and named).
 * Melodic channels folded under the Melody DCA are not overflow — the DCA is
 * how they are reached.
 */
export function buildLayerPages(args: {
  groups: DeskGroup[];
  channels: LayerInput[];
  /** The vocal FX DCA, when the desk has vocal FX returns. */
  fxDca?: { name: string; dca: number } | null;
  /** The Melody DCA, present only when the melodic frontline is compressed. */
  melodyDca?: { name: string; dca: number } | null;
}): { pages: LayerPage[]; overflow: LayerSlot[] } {
  const groupsById = new Map(args.groups.map((group) => [group.id, group]));
  const channelsIn = (id: RiderSourceFamily) =>
    args.channels.filter((channel) => channel.group?.id === id);
  const dcaSlot = (group: DeskGroup): LayerSlot => ({
    kind: "dca",
    name: group.label,
    dca: group.dca,
  });
  const channelSlots = (inputs: LayerInput[]): LayerSlot[] =>
    inputs.map((input) => ({
      kind: "channel" as const,
      name: input.name,
      strip: input.strip,
      family: input.family,
    }));

  const queue: Array<{ name: string; slots: LayerSlot[] }> = [];

  // 1) Vocals: DCA + the Vox FX DCA + every vocal, paged as needed (top
  //    priority). A lone vocal needs no channel DCA, but the FX DCA still sits
  //    with it — it rides the reverb returns, not the mic.
  const vocals = groupsById.get("vocals");
  const vocalChannels = channelsIn("vocals");
  if (vocals && vocalChannels.length > 0) {
    const lead: LayerSlot[] = [];
    if (vocalChannels.length > 1) lead.push(dcaSlot(vocals));
    if (args.fxDca) {
      lead.push({ kind: "dca", name: args.fxDca.name, dca: args.fxDca.dca });
    }
    queue.push({ name: "Vocals", slots: [...lead, ...channelSlots(vocalChannels)] });
  }

  // 2) Drums: one collapsed DCA (the kit is handled as one); a lone drum mono
  //    is just the channel.
  const drums = groupsById.get("drums");
  const drumChannels = channelsIn("drums");
  if (drums && drumChannels.length > 1) {
    queue.push({ name: "Drums", slots: [dcaSlot(drums)] });
  } else if (drumChannels.length === 1) {
    queue.push({ name: "Drums", slots: channelSlots(drumChannels) });
  }

  // 3) Melodic groups: every channel wants a fader, but only if the whole desk
  //    still fits PAGE 1. The point of USER1 is a one-screen layout, so we
  //    compress rather than spill: if the drum/track/utility groups plus every
  //    melodic channel will not fit the first page, the melodic frontline folds
  //    into a single Melody DCA.
  const melodyGroups = args.groups.filter((group) =>
    MELODY_FAMILIES.includes(group.id),
  );
  const melodyMembers = melodyGroups.flatMap((group) => channelsIn(group.id));
  const otherGroups = args.groups.filter(
    (group) => group.id === "playback" || group.id === "utility",
  );

  // The allocator decides compression (so the DCA tags agree); layers just
  // lays it out. Its melody DCA is null when we are not compressing.
  const compress = melodyMembers.length > 0 && Boolean(args.melodyDca);

  if (compress) {
    queue.push({
      name: "Melody",
      slots: [
        {
          kind: "dca",
          name: args.melodyDca!.name,
          dca: args.melodyDca!.dca,
        },
      ],
    });
    // The melodic channels are not given faders here — they are still patched
    // and named on the desk, and ridden from the Melody DCA.
  } else {
    for (const group of melodyGroups) {
      const members = channelsIn(group.id);
      if (members.length === 0) continue;
      // A DCA over a single channel is a wasted fader — show just the channel.
      const lead: LayerSlot[] = members.length > 1 ? [dcaSlot(group)] : [];
      queue.push({ name: group.label, slots: [...lead, ...channelSlots(members)] });
    }
  }

  // 4) Tracks and utility keep their own collapsed DCA (they are cued as a unit,
  //    not ridden like the band); a single-channel group is just the channel.
  for (const group of otherGroups) {
    const members = channelsIn(group.id);
    if (members.length === 0) continue;
    queue.push({
      name: group.label,
      slots: members.length > 1 ? [dcaSlot(group)] : channelSlots(members),
    });
  }

  // Lay the queue into fader slots 1..N, skipping slot 12 for USB 1/2. Slots
  // flow straight through the reserved fader — a group does not backfill around
  // it, so page 1 reads 1–11, then the USB strip, then page 2 continues.
  const flat: LayerSlot[] = queue.flatMap((entry) => entry.slots);
  const placed: Array<LayerSlot | undefined> = [];
  let cursor = 0;
  for (let slot = 1; slot <= USER_LAYER_SLOTS; slot++) {
    if (slot === USB_MUSIC_SLOT) {
      placed.push({ kind: "usb", name: "USB 1/2", stereo: true });
      continue;
    }
    placed.push(cursor < flat.length ? flat[cursor++] : undefined);
  }
  const overflow = flat.slice(cursor);

  // A page is a fixed 12-fader window; each slot carries its fader number so the
  // USB strip stays pinned to fader 12 rather than sliding up.
  const pages: LayerPage[] = [];
  for (let page = 0; page < USER_LAYER_SLOTS / WING_COMPACT_FADERS; page++) {
    const window = placed.slice(
      page * WING_COMPACT_FADERS,
      (page + 1) * WING_COMPACT_FADERS,
    );
    const entries = window.flatMap((slot, index) =>
      slot ? [{ slot, fader: index + 1 }] : [],
    );
    if (entries.length === 0) continue;
    pages.push({
      name: page === 0 ? (queue[0]?.name ?? "USER1") : "USER1",
      page: page + 1,
      kind: "group",
      slots: entries.map((entry) => entry.slot),
      positions: entries.map((entry) => entry.fader),
    });
  }

  return { pages, overflow };
}
