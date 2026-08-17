import type {
  EventPatchAllocation,
  PortAssignment,
  ShowBandInput,
  WingScopes,
  WingSnap,
} from "./types";

/** What one console strip looks like in a given scene. */
type StripState = {
  name: string;
  mute: boolean;
  /** AES50 group + port, or null when the strip is unpatched. */
  conn: { grp: string; in: number } | null;
  /** Instrument identity — a change here means the channel needs new gain/EQ. */
  instrument: string | null;
};

export type BandSnapOptions = {
  /**
   * Previous scene in show order. Channels identical to it are left out of the
   * recall scope so soundcheck gain/EQ survives the changeover.
   */
  previous?: ShowBandInput | { fileStem: string } | null;
  /** Set false to recall everything (old behaviour). */
  scope?: boolean;
};

/**
 * Clone Default.snap and rewrite the AES50 IO + matching channel strips for one
 * band. Only overheads get 48V. Stereo mode follows the allocation (OH always
 * ST; keys ST unless broken for overflow). Ports nobody uses tonight are
 * unpatched and blanked rather than left sitting there as empty flex strips.
 */
export function buildBandSnap(
  template: WingSnap,
  allocation: EventPatchAllocation,
  band: ShowBandInput,
  options: BandSnapOptions = {},
): WingSnap {
  const snap = applyAllocation(template, allocation, band.fileStem);

  if (options.scope === false) return snap;

  const current = stripStates(allocation, band.fileStem);
  const previous = options.previous
    ? stripStates(allocation, options.previous.fileStem)
    : nightStripStates(allocation);

  snap.scopes = changedChannelScope(snap, current, previous);
  return snap;
}

/**
 * The night baseline (`Default.snap` in the package): the whole patch, named,
 * with every channel muted and everything unused unpatched. Recalled once at
 * load-in with full scope — the band scenes then only touch what changes.
 */
export function buildNightSnap(
  template: WingSnap,
  allocation: EventPatchAllocation,
): WingSnap {
  const snap = applyAllocation(template, allocation, null);
  snap.scopes = fullScope(snap);
  return snap;
}

/** Patch + name every port. `fileStem` null builds the muted night baseline. */
function applyAllocation(
  template: WingSnap,
  allocation: EventPatchAllocation,
  fileStem: string | null,
): WingSnap {
  const snap = structuredClone(template);
  const channels = snap.ae_data.ch;

  for (const port of allocation.ports) {
    const socket = socketFor(snap, port);
    if (socket) {
      if (port.used) {
        socket.name = port.label;
        socket.mode = port.stereo ? "ST" : "M";
        // Hard rule: phantom only on OH ports.
        socket.vph = port.family === "oh" && port.phantom;
      } else {
        socket.name = "";
        socket.mode = "M";
        socket.vph = false;
      }
    }

    if (port.strip === null) continue;
    const strip = channels[String(port.strip)];
    if (!strip) continue;

    if (!port.used) {
      // Nothing plugs in here tonight — take the channel out of the way.
      strip.name = "";
      strip.mute = true;
      strip.in = strip.in ?? {};
      strip.in.conn = { grp: "OFF", in: 1, altgrp: "OFF", altin: 1 };
      continue;
    }

    strip.in = strip.in ?? {};
    strip.in.conn = {
      grp: port.snake,
      in: port.port,
      altgrp: "OFF",
      altin: 1,
    };
    strip.name = port.label;
    strip.mute = fileStem === null ? true : !port.bandLabels[fileStem];
  }

  return snap;
}

function socketFor(snap: WingSnap, port: PortAssignment) {
  const group = snap.ae_data.io.in[port.snake] as
    | Record<string, Record<string, unknown>>
    | undefined;
  return group?.[String(port.port)] as
    | { name?: string; mode?: string; vph?: boolean }
    | undefined;
}

function stripStates(
  allocation: EventPatchAllocation,
  fileStem: string,
): Map<number, StripState> {
  const states = new Map<number, StripState>();
  for (const port of allocation.ports) {
    if (port.strip === null) continue;
    states.set(port.strip, {
      name: port.used ? port.label : "",
      mute: port.used ? !port.bandLabels[fileStem] : true,
      conn: port.used ? { grp: port.snake, in: port.port } : null,
      instrument: port.bandInstruments[fileStem] ?? null,
    });
  }
  return states;
}

/** Load-in state: patched and named, everything muted. */
function nightStripStates(allocation: EventPatchAllocation): Map<number, StripState> {
  const states = new Map<number, StripState>();
  for (const port of allocation.ports) {
    if (port.strip === null) continue;
    states.set(port.strip, {
      name: port.used ? port.label : "",
      mute: true,
      conn: port.used ? { grp: port.snake, in: port.port } : null,
      instrument: null,
    });
  }
  return states;
}

function sameStrip(a: StripState | undefined, b: StripState | undefined): boolean {
  if (!a || !b) return false;
  return (
    a.name === b.name &&
    a.mute === b.mute &&
    a.instrument === b.instrument &&
    a.conn?.grp === b.conn?.grp &&
    a.conn?.in === b.conn?.in
  );
}

/**
 * Scope a band scene down to the channels that actually change.
 *
 * Everything else stays as the console has it, which is the point: the kit gets
 * gained and EQ'd once at soundcheck and no later scene walks over it. Preamps
 * (`routin`) are never in scope — the night patch already named and configured
 * every socket, so gains belong to the engineer from load-in onwards.
 */
function changedChannelScope(
  snap: WingSnap,
  current: Map<number, StripState>,
  previous: Map<number, StripState>,
): WingScopes {
  const scopes = emptyScope(snap);
  for (const [strip, state] of current) {
    scopes.ch[String(strip)] = !sameStrip(state, previous.get(strip));
  }
  return scopes;
}

function keyedFlags(keys: string[], value: boolean): Record<string, boolean> {
  return Object.fromEntries(keys.map((key) => [key, value]));
}

function countedKeys(count: number): string[] {
  return Array.from({ length: count }, (_, index) => String(index + 1));
}

function scopeShape(snap: WingSnap, value: boolean): WingScopes {
  const channelKeys = Object.keys(snap.ae_data.ch);
  return {
    ch: keyedFlags(channelKeys.length ? channelKeys : countedKeys(40), value),
    aux: keyedFlags(countedKeys(8), value),
    bus: keyedFlags(countedKeys(16), value),
    main: keyedFlags(countedKeys(4), value),
    mtx: keyedFlags(countedKeys(8), value),
    fx: keyedFlags(countedKeys(16), value),
    routin: keyedFlags(countedKeys(13), value),
    routout: keyedFlags(countedKeys(11), value),
    cfg: { groups: value, audio: value, surface: value },
    area: { L: value, C: value, R: value },
    data: keyedFlags(countedKeys(9), value),
  };
}

function emptyScope(snap: WingSnap): WingScopes {
  return scopeShape(snap, false);
}

function fullScope(snap: WingSnap): WingScopes {
  return scopeShape(snap, true);
}
