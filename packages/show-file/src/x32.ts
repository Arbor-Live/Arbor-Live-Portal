import { BOX_CAPACITY, FAMILY_STYLE, aes50PortFor } from "./slots";
import { wingColToX32, wingIconToX32 } from "./palette";
import type {
  EventPatchAllocation,
  PortAssignment,
  ShowBandInput,
  WingSnap,
} from "./types";

/**
 * Behringer X32 / Midas M32 `.scn` scenes.
 *
 * Arbor’s stage boxes already live on AES50 A, so an X32 channel maps straight
 * to its socket: snake A ports 1–16 → channels 1–16, snake B → 17–32. The only
 * real translation is stereo: the X32 has no stereo channel, so a Keys or OH
 * pair becomes two mono channels linked with `/config/chlink` (odd-aligned, the
 * only pairs the desk will link) and hard-panned left/right.
 *
 * The scene head is `#4.0#` (firmware scene version) and the same node set the
 * console writes, minus EQ/gate/dynamics — a rider never authors those, and the
 * X32 applies only the nodes a scene contains, so the engineer’s own settings
 * survive. Gain is `/ch/NN/preamp`, which only the night baseline touches, so a
 * band scene can never walk a gained channel.
 */

const MAX_CH = 32;
const EQ_DEFAULT_HPF = "OFF 24 20.0";

/** One console channel, already placed on the X32’s 1–32 mono slots. */
type X32Channel = {
  ch: number;
  width: 1 | 2;
  name: string;
  used: boolean;
  muted: boolean;
  color: string;
  icon: number;
  /** AES50 A socket (1–32) the input lands on. */
  socket: number;
  phantom: boolean;
};

export type ConsoleScene = {
  text: string;
  /** Things the target desk cannot represent, named for the engineer. */
  warnings: string[];
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const onOff = (b: boolean) => (b ? "ON" : "OFF");

function lvl(v: number): string {
  if (v === -Infinity) return "-oo";
  return (v >= 0 ? "+" : "") + v.toFixed(1);
}

function panTok(pan: number): string {
  return (pan >= 0 ? "+" : "") + pan;
}

function sceneName(name: string): string {
  return `"${String(name || "Show").replace(/"/g, "").slice(0, 12)}"`;
}

/** A channel/input name is literal — a slot nothing patches stays blank. */
function channelName(name: string): string {
  return `"${name.replace(/"/g, "").slice(0, 12)}"`;
}

/** The show name is the only place an X32 scene carries it. */
export function buildX32Scene(args: {
  template: WingSnap;
  allocation: EventPatchAllocation;
  /** Band, or null for the muted night baseline. */
  band: ShowBandInput | null;
  sceneName: string;
  previous?: { fileStem: string } | null;
  /** False makes every band scene a full recall (escape hatch). */
  scope?: boolean;
}): ConsoleScene {
  const { template, allocation, band, previous } = args;
  const warnings: string[] = [];

  if (allocation.snakes.length > 1) {
    warnings.push(
      "Second snake is on the X32 too — both land on AES50 A (17–32), so the whole night fits.",
    );
  }

  const fileStem = band?.fileStem ?? null;
  const current = buildChannels(template, allocation, fileStem);
  const full = fileStem === null || args.scope === false;
  const lines: string[] = [`#4.0# ${sceneName(args.sceneName)} "" %000000000 1`];

  if (full) {
    const chlink = Array<boolean>(MAX_CH / 2).fill(false);
    const covered = new Set<number>();
    for (const c of [...current.values()].sort((a, b) => a.ch - b.ch)) {
      lines.push(...channelLines(c, true));
      for (let k = 0; k < c.width; k++) covered.add(c.ch + k);
      if (c.width === 2) chlink[Math.ceil(c.ch / 2) - 1] = true;
    }
    // A slot the show does not reach is still written blank, or it keeps the
    // last show’s name and settings.
    for (let n = 1; n <= MAX_CH; n++) {
      if (!covered.has(n)) lines.push(...channelLines(blankChannel(n), true));
    }
    lines.push(`/config/routing/IN ${["A1-8", "A9-16", "A17-24", "A25-32", "AUX1-6"].join(" ")}`);
    lines.push(`/config/chlink ${chlink.map(onOff).join(" ")}`);
    for (const c of current.values()) {
      if (!c.used) continue;
      for (let k = 0; k < c.width; k++) {
        lines.push(`/headamp/${String(31 + c.socket + k).padStart(3, "0")} +0.0 ${onOff(c.phantom)}`);
      }
    }
  } else {
    const before = buildChannels(
      template,
      allocation,
      previous?.fileStem ?? null,
    );
    for (let n = 1; n <= MAX_CH; n++) {
      const c = current.get(n) ?? blankChannel(n);
      const prev = before.get(n) ?? blankChannel(n);
      if (c.muted === prev.muted && c.name === prev.name && c.width === prev.width) continue;
      lines.push(...mixLines(c));
    }
  }

  return { text: lines.join("\n") + "\n", warnings };
}

function blankChannel(n: number): X32Channel {
  return {
    ch: n,
    width: 1,
    name: "",
    used: false,
    muted: true,
    color: "OFF",
    icon: 1,
    socket: n,
    phantom: false,
  };
}

/** The X32’s own name for “no colour” is OFF; a WING colour maps through. */
function buildChannels(
  template: WingSnap,
  allocation: EventPatchAllocation,
  fileStem: string | null,
): Map<number, X32Channel> {
  const byKey = new Map<string, PortAssignment>();
  for (const port of allocation.ports) byKey.set(`${port.snake}:${port.port}`, port);

  const channels = new Map<number, X32Channel>();
  for (const snake of allocation.snakes) {
    const offset = snake === "B" ? 16 : 0;
    // Every box socket has an entry; a stereo right half rides the left's strip.
    for (let portNumber = 1; portNumber <= BOX_CAPACITY; portNumber++) {
      const port = byKey.get(`${snake}:${portNumber}`);
      if (!port || port.strip === null) continue;
      const socket = aes50PortFor(snake, portNumber);
      const sock = template.ae_data.io.in.A?.[String(socket)];
      // A live input wears its family's colour/icon; an empty socket keeps the
      // template's positional swatch, the same way the WING baseline does.
      const style = FAMILY_STYLE[port.family];
      channels.set(offset + portNumber, {
        ch: offset + portNumber,
        width: port.stereo ? 2 : 1,
        name: port.label,
        used: port.used,
        muted: fileStem === null ? true : !port.bandLabels[fileStem],
        color: port.used
          ? wingColToX32(style.col)
          : wingColToX32(sock?.col as number | undefined),
        icon: port.used
          ? wingIconToX32(style.icon)
          : wingIconToX32(sock?.icon as number | undefined),
        socket,
        phantom: port.phantom,
      });
    }
  }
  return channels;
}

function channelLines(c: X32Channel, full: boolean): string[] {
  const lines: string[] = [];
  for (let k = 0; k < c.width; k++) {
    const n = c.ch + k;
    const id = pad2(n);
    if (full) {
      lines.push(`/ch/${id}/config ${channelName(stereoName(c, k))} ${c.icon} ${c.color} ${n}`);
      lines.push(`/ch/${id}/preamp +0.0 OFF ${EQ_DEFAULT_HPF}`);
    }
    lines.push(...mixLine(n, c, k));
  }
  if (full) lines.push(`/ch/${pad2(c.ch)}/grp %00000000 %000000`);
  return lines;
}

function mixLines(c: X32Channel): string[] {
  const lines: string[] = [];
  for (let k = 0; k < c.width; k++) lines.push(...mixLine(c.ch + k, c, k));
  return lines;
}

/** Mute and fader share one node on an X32, so unmuting recalls unity. */
function mixLine(n: number, c: X32Channel, k: number): string[] {
  const muted = !c.used || c.muted;
  const pan = c.width === 2 ? (k === 0 ? -100 : 100) : 0;
  return [
    `/ch/${pad2(n)}/mix ${onOff(!muted)} ${lvl(muted ? -Infinity : 0)} ON ${panTok(pan)} ON +0.0`,
  ];
}

/** A stereo pair’s halves read “Keys L” / “Keys R”, the way an engineer writes it. */
function stereoName(c: X32Channel, k: number): string {
  if (c.width !== 2) return c.name;
  return `${c.name.slice(0, 10).trim()} ${k === 0 ? "L" : "R"}`;
}
