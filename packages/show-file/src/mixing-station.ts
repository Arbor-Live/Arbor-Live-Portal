import { strToU8, zipSync } from "fflate";
import { MS_X32, MS_XR18 } from "./mixing-station-data";

/**
 * Mixing Station `.msz` scenes, for the phone/tablet app most X Air and X32
 * engineers actually mix from.
 *
 * A `.msz` is a zip. When it holds a `preset_meta_info.json` (empty — the app
 * only checks it exists), Mixing Station imports the one other `.json` beside
 * it as an MS Scene: the scene `data` its REST API returns, plus a `meta`
 * block naming it. Opening the file with Mixing Station drops it in the
 * scene list; recalling it shows the channel remap, then applies.
 *
 * The app refuses a partial scene, so each one starts from a whole-desk
 * baseline taken from Mixing Station’s offline mode (see
 * `scripts/embed-mixing-station.mjs`) and only input channels are rewritten:
 * name, colour, source, 48V, link, mute, fader and pan — the same nodes the
 * `.scn` sets. Gain and 48V ride only on the night baseline: a band scene
 * drops each channel’s headamp block, so recalling it never walks a gain the
 * engineer has set. Keys inside are Mixing Station’s own, verified against
 * the desktop app’s REST API (3.2.0).
 */

export type MsSceneData = {
  ch: MsChannelEntry[];
  console: Record<string, { mixer?: Record<string, unknown> }>;
  [key: string]: unknown;
};

type MsChannelEntry = {
  ref: { offset: number; type: number };
  data: {
    name: { generic: { name: string; color: number } };
    main: { generic: Record<string, number | boolean> };
    link: { generic: { linked: boolean } };
    routing: { mixer: Record<string, number> };
    headamp?: { "+48v"?: boolean; gain: number };
    [key: string]: unknown;
  };
};

/** One input channel, already placed on the desk’s mono slots. */
export type MsInputChannel = {
  ch: number;
  width: 1 | 2;
  name: string;
  used: boolean;
  muted: boolean;
  /** Desk palette index, 0 (black/off) – 7 (white). */
  color: number;
  phantom: boolean;
};

export type MsDesk = "xr18" | "x32";

const DESK: Record<MsDesk, { template: MsSceneData; inputs: number }> = {
  xr18: { template: MS_XR18, inputs: 16 },
  x32: { template: MS_X32, inputs: 32 },
};

/** Mixing Station’s channel type for an input strip. */
const INPUT_TYPE = 0;
/** Mixing Station writes a pulled-down fader as −90 dB. */
const FADER_DOWN = -90;
const NAME_MAX = 12;

export function buildMixingStationScene(args: {
  desk: MsDesk;
  channels: Map<number, MsInputChannel>;
  sceneName: string;
  /** True for the night baseline, the only scene that sets gain and 48V. */
  headamps: boolean;
  /** Fixed for tests; defaults to now. */
  lastModified?: number;
}): Uint8Array {
  const { template, inputs } = DESK[args.desk];
  const data = structuredClone(template);

  if (args.desk === "x32") {
    // Input blocks 1–4 → AES50 A 1–32 (Mixing Station stores the X32’s own
    // enum: 4 = A1-8 … 7 = A25-32), as the `.scn` sets `/config/routing/IN`.
    const routing = data.console.inputRouting?.mixer;
    if (routing) for (let b = 0; b < 4; b++) routing[`routing.inBlocks.${b}`] = 4 + b;
  }

  const slotOf = new Map<number, { c: MsInputChannel; half: number }>();
  for (const c of args.channels.values()) {
    for (let k = 0; k < c.width; k++) slotOf.set(c.ch + k, { c, half: k });
  }

  for (const entry of data.ch) {
    if (entry.ref.type !== INPUT_TYPE || entry.ref.offset >= inputs) continue;
    const n = entry.ref.offset + 1;
    writeChannel(entry, n, slotOf.get(n) ?? { c: blankChannel(n), half: 0 });
    if (!args.headamps) delete entry.data.headamp;
  }

  const json = {
    ...data,
    meta: {
      name: args.sceneName.slice(0, 40),
      lastModified: args.lastModified ?? Date.now(),
      type: "scene",
    },
  };
  return zipSync(
    {
      "preset_meta_info.json": new Uint8Array(0),
      [`scene-${safeFileName(args.sceneName)}.json`]: strToU8(JSON.stringify(json)),
    },
    { level: 6 },
  );
}

function writeChannel(
  entry: MsChannelEntry,
  n: number,
  slot: { c: MsInputChannel; half: number },
): void {
  const { c, half } = slot;
  const d = entry.data;
  const muted = !c.used || c.muted;
  const name =
    c.width === 2 ? `${c.name.slice(0, NAME_MAX - 2).trim()} ${half === 0 ? "L" : "R"}` : c.name;

  d.name.generic.name = name.slice(0, NAME_MAX);
  d.name.generic.color = c.used ? c.color : 0;
  // Source n is In n on the XR18, and AES50 A n once the X32’s blocks are set.
  d.routing.mixer["cfg.in.0.sink.0.src"] = n;
  d.link.generic.linked = c.width === 2;
  d.main.generic["mix.rawOn"] = !muted;
  d.main.generic["mix.lvl"] = muted ? FADER_DOWN : 0;
  d.main.generic["mix.pan"] = c.width === 2 ? (half === 0 ? -100 : 100) : 0;
  if (d.headamp) {
    d.headamp.gain = 0;
    if ("+48v" in d.headamp) d.headamp["+48v"] = c.used && c.phantom;
  }
}

function blankChannel(n: number): MsInputChannel {
  return { ch: n, width: 1, name: "", used: false, muted: true, color: 0, phantom: false };
}

function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 40) || "scene";
}
