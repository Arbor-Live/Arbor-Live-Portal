import { BOX_CAPACITY, FAMILY_STYLE } from "./slots";
import { wingColToXAir } from "./palette";
import type {
  EventPatchAllocation,
  PortAssignment,
  ShowBandInput,
  WingSnap,
} from "./types";
import type { ConsoleScene } from "./x32";

/**
 * Behringer X Air / XR18 `.scn` scene.
 *
 * The X Air is the small desk: 16 channels, six aux buses, four DCAs, no
 * matrices, and **no AES50** — so the rider’s snake becomes the mixer’s own
 * local inputs. Snake A port 1 lands on channel 1’s `In01`, port 2 on `In02`,
 * and so on; anything on the second snake has nowhere to go and is named in the
 * warnings. Input patch is per channel here, so a scattered patch survives.
 *
 * Unlike the X32, X AIR Edit will not load a partial scene: every node a real
 * scene contains is written, with the desk’s defaults where a rider has nothing
 * to say.
 */

const MAX_CH = 16;
const BUSES = 6;
const FX_SENDS = 4;
const DCAS = 4;
const MUTE_GROUPS = 4;

type XAirChannel = {
  ch: number;
  width: 1 | 2;
  name: string;
  used: boolean;
  muted: boolean;
  color: number;
  phantom: boolean;
};

export function buildXAirScene(args: {
  template: WingSnap;
  allocation: EventPatchAllocation;
  band: ShowBandInput | null;
  sceneName: string;
}): ConsoleScene {
  const warnings: string[] = [];
  if (args.allocation.snakes.length > 1) {
    const onB = args.allocation.ports
      .filter((port) => port.used && port.snake === "B")
      .map((port) => port.label);
    const named = onB.length ? ` (${onB.join(", ")})` : "";
    warnings.push(
      `The X Air has no second snake — inputs on Snake B are not in this scene${named}. Repatch them to local inputs.`,
    );
  }

  const fileStem = args.band?.fileStem ?? null;
  const channels = buildChannels(args.template, args.allocation, fileStem);
  const lines: string[] = [];

  const chlink = Array<boolean>(MAX_CH / 2).fill(false);
  for (const c of channels.values()) {
    if (c.width === 2) chlink[Math.ceil(c.ch / 2) - 1] = true;
  }
  lines.push(`/config/chlink ${chlink.map(onOff).join(" ")}`);
  lines.push("/config/buslink OFF OFF OFF");
  lines.push("/config/linkcfg ON ON ON ON");
  lines.push("/config/solo   0.0 LRAFL 0.0 PFL PFL -20 OFF OFF OFF OFF");
  lines.push("/config/amixenable OFF OFF");
  lines.push("/config/amixlock OFF OFF");
  lines.push(`/config/mute ${Array(MUTE_GROUPS).fill("OFF").join(" ")}`);

  // A stereo pair covers two channel numbers; map every number to its half so
  // a right half is written once as the source’s `R`, not again as a blank.
  const slotOf = new Map<number, { c: XAirChannel; half: number }>();
  for (const c of channels.values()) {
    for (let k = 0; k < c.width; k++) slotOf.set(c.ch + k, { c, half: k });
  }

  const headamps = new Map<number, boolean>();
  for (let n = 1; n <= MAX_CH; n++) {
    const entry = slotOf.get(n) ?? { c: blankChannel(n), half: 0 };
    lines.push(...channelNodes(entry, n, headamps));
  }

  for (const [tag, usb] of [
    ["aux", "U1718"],
    ["1", "U0102"],
    ["2", "U0304"],
    ["3", "U0506"],
    ["4", "U0708"],
  ] as const) {
    lines.push(`/rtn/${tag}/config "" ${tag === "aux" ? 1 : 2} ${usb}`);
    lines.push(`/rtn/${tag}/preamp +0.0 OFF`);
    lines.push(...eq4(`/rtn/${tag}`));
    lines.push(`/rtn/${tag}/mix ON   ${tag === "aux" ? "-oo" : "0.0"} ON +0`);
    for (let b = 1; b <= BUSES + FX_SENDS; b++) {
      lines.push(`/rtn/${tag}/mix/${pad2(b)}   -oo OFF POST${b % 2 === 1 ? " +0" : ""}`);
    }
    lines.push(`/rtn/${tag}/grp %0000 %0000`);
  }

  for (let b = 1; b <= BUSES; b++) {
    lines.push(`/bus/${b}/config "" 3`);
    lines.push(`/bus/${b}/dyn OFF COMP PEAK LOG 0.0 3.0 1 0.00 10 10.0 151 100 SELF OFF`);
    lines.push(`/bus/${b}/dyn/filter OFF 3.0 990.9`);
    lines.push(`/bus/${b}/insert OFF OFF`);
    lines.push(...eq6(`/bus/${b}`));
    lines.push(`/bus/${b}/geq ${Array(31).fill("0.0").join(" ")}`);
    lines.push(`/bus/${b}/mix ON   -oo OFF +0`);
    lines.push(`/bus/${b}/grp %0000 %0000`);
  }

  for (let f = 1; f <= FX_SENDS; f++) {
    lines.push(`/fxsend/${f}/config "" 4`);
    lines.push(`/fxsend/${f}/mix ON   0.0`);
    lines.push(`/fxsend/${f}/grp %0000 %0000`);
  }

  lines.push(`/lr/config "" 6`);
  lines.push(`/lr/dyn OFF COMP PEAK LOG 0.0 3.0 1 0.00 10 10.0 151 100 OFF`);
  lines.push(`/lr/dyn/filter OFF 3.0 990.9`);
  lines.push(`/lr/insert OFF OFF`);
  lines.push(...eq6("/lr"));
  lines.push(`/lr/geq ${Array(31).fill("0.0").join(" ")}`);
  lines.push(`/lr/mix ON   -oo +0`);

  for (let d = 1; d <= DCAS; d++) {
    lines.push(`/dca/${d} ON   0.0`);
    lines.push(`/dca/${d}/config "" 8`);
  }

  for (const [n, name, par] of FX_DEFAULTS) {
    lines.push(`/fx/${n} ${name} OFF`);
    lines.push(`/fx/${n}/par ${par} ${Array(Math.max(0, 64 - par.split(" ").length)).fill("0").join(" ")}`.trimEnd());
  }

  lines.push("/routing/main/01 LR");
  lines.push("/routing/main/02 MON");
  for (let b = 1; b <= BUSES; b++) lines.push(`/routing/aux/${pad2(b)} Bus${b} POST`);
  for (let n = 1; n <= MAX_CH; n++) lines.push(`/routing/p16/${pad2(n)} Ch${pad2(n)} IN+M`);
  for (let n = 1; n <= 18; n++) lines.push(`/routing/usb/${pad2(n)} Ch${pad2(n)} AIN`);

  for (let i = 1; i <= 24; i++) {
    lines.push(`/headamp/${pad2(i)} +0.0 ${onOff(headamps.get(i) ?? false)}`);
  }

  return { text: lines.join("\n") + "\n", warnings };
}

const FX_DEFAULTS: Array<[number, string, string]> = [
  [1, "VRM", "20 1.94 24 30 22 0.0 1.10 0.69 97 10k4 28 34 OFF"],
  [2, "HALL", "20 1.57 60 5k74 25 0.0 83 7k2 0.95 25 50 30"],
  [3, "MODD", "300 1 30.0 97 9k5 20 1.08 SER CLUB 5.0 5k6 +0 100"],
  [4, "DIMC", "ON ST OFF ON OFF ON OFF"],
];

const pad2 = (n: number) => String(n).padStart(2, "0");
const onOff = (b: boolean) => (b ? "ON" : "OFF");

/** The X Air right-aligns level fields to five columns and writes `-oo`. */
function lvl(v: number): string {
  if (v === -Infinity) return "  -oo";
  return Number(v).toFixed(1).padStart(5, " ");
}

function blankChannel(n: number): XAirChannel {
  return { ch: n, width: 1, name: "", used: false, muted: true, color: 0, phantom: false };
}

function buildChannels(
  template: WingSnap,
  allocation: EventPatchAllocation,
  fileStem: string | null,
): Map<number, XAirChannel> {
  const byKey = new Map<string, PortAssignment>();
  for (const port of allocation.ports) byKey.set(`${port.snake}:${port.port}`, port);

  const channels = new Map<number, XAirChannel>();
  // Only Snake A exists locally; a second snake has nowhere to land.
  for (let portNumber = 1; portNumber <= BOX_CAPACITY; portNumber++) {
    const port = byKey.get(`A:${portNumber}`);
    if (!port || port.strip === null) continue;
    const sock = template.ae_data.io.in.A?.[String(portNumber)];
    const style = FAMILY_STYLE[port.family];
    channels.set(portNumber, {
      ch: portNumber,
      width: port.stereo ? 2 : 1,
      name: port.label,
      used: port.used,
      muted: fileStem === null ? true : !port.bandLabels[fileStem],
      color: port.used
        ? wingColToXAir(style.col)
        : wingColToXAir(sock?.col as number | undefined),
      phantom: port.phantom,
    });
  }
  return channels;
}

function channelNodes(
  entry: { c: XAirChannel; half: number },
  n: number,
  headamps: Map<number, boolean>,
): string[] {
  const { c, half } = entry;
  const id = pad2(n);
  const name = c.width === 2 ? `${c.name.slice(0, 10).trim()} ${half === 0 ? "L" : "R"}` : c.name;
  const lines: string[] = [];
  lines.push(`/ch/${id}/config "${name}" ${c.used ? c.color : 0} In${id} U${id}`);
  lines.push(`/ch/${id}/preamp +0.0 OFF OFF OFF  20`);
  lines.push(`/ch/${id}/gate OFF GATE -80.0 60.0 1  502 983 SELF`);
  lines.push(`/ch/${id}/gate/filter OFF 3.0 990.9`);
  lines.push(`/ch/${id}/dyn OFF COMP PEAK LOG 0.0 3.0 1 0.00 10 10.0 151 100 SELF OFF`);
  lines.push(`/ch/${id}/dyn/filter OFF 3.0 990.9`);
  lines.push(`/ch/${id}/insert OFF OFF`);
  lines.push(...eq4(`/ch/${id}`));
  const muted = !c.used || c.muted;
  const pan = c.width === 2 ? (half === 0 ? -100 : 100) : 0;
  lines.push(`/ch/${id}/mix ${onOff(!muted)} ${lvl(muted ? -Infinity : 0)} ON ${panTok(pan)}`);
  for (let b = 1; b <= BUSES + FX_SENDS; b++) {
    lines.push(`/ch/${id}/mix/${pad2(b)}   -oo OFF POST${b <= BUSES && b % 2 === 1 ? " +0" : ""}`);
  }
  lines.push(`/ch/${id}/grp %0000 %0000`);
  lines.push(`/ch/${id}/automix OFF  +0.0`);
  if (c.used) headamps.set(n, c.phantom);
  return lines;
}

function panTok(pan: number): string {
  return (pan >= 0 ? "+" : "") + Math.round(pan);
}

function eq4(prefix: string): string[] {
  return [
    `${prefix}/eq ON`,
    `${prefix}/eq/1 PEQ 124.7 +0.00 2.0`,
    `${prefix}/eq/2 PEQ 496.6 +0.00 2.0`,
    `${prefix}/eq/3 PEQ 1k97 +0.00 2.0`,
    `${prefix}/eq/4 HShv 10k02 +0.00 2.0`,
  ];
}

function eq6(prefix: string): string[] {
  return [
    `${prefix}/eq ON PEQ`,
    `${prefix}/eq/1 LShv 124.7 +0.00 2.0`,
    `${prefix}/eq/2 PEQ 496.6 +0.00 2.0`,
    `${prefix}/eq/3 PEQ 1k97 +0.00 2.0`,
    `${prefix}/eq/4 PEQ 10k02 +0.00 2.0`,
    `${prefix}/eq/5 PEQ 20.0 +0.00 2.0`,
    `${prefix}/eq/6 HShv 20.0 +0.00 2.0`,
  ];
}
