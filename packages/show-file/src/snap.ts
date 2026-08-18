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

  snap.scopes = changedChannelScope(current, previous);
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
  snap.scopes = fullScope();
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
 * gained and EQ'd once at soundcheck and no later scene walks over it.
 *
 * Gain is safe even on a channel that *does* change — a flex port swapping sax
 * for clarinet, a vocal unmuting — because the head amp lives on the input
 * source (`io.in.A[n].g`) and `source` is never in scope. Nothing in a band
 * scene moves a gain knob.
 *
 * `contents` stays fully on: for a channel that is in scope we want the whole
 * strip, patch and all. See CONTENTS_IN_HA for the one refinement still open.
 */
function changedChannelScope(
  current: Map<number, StripState>,
  previous: Map<number, StripState>,
): WingScopes {
  const changed = new Set<number>();
  for (const [strip, state] of current) {
    if (!sameStrip(state, previous.get(strip))) changed.add(strip);
  }

  const scopes = scopeShape(SCOPE_OFF);
  scopes.ch = flags(SCOPE_SHAPE.ch, (index) => changed.has(index + 1));
  scopes.contents = SCOPE_ON.repeat(SCOPE_SHAPE.contents);
  return scopes;
}

/** In scope / out of scope, as the desk encodes them. */
const SCOPE_ON = "+";
const SCOPE_OFF = " ";

/**
 * Item counts per scope field, read off `snapshot.11` files saved from the
 * console. Our Default.snap template ships without a `scopes` section at all,
 * so `templates/scopes-reference.json` is the only record of the shape.
 *
 * `mainsend` / `bussend` are the scope page's own Main and Sends entries, not
 * part of `contents` — they clear together with it.
 */
const SCOPE_SHAPE = {
  ch: 40,
  aux: 8,
  bus: 16,
  main: 4,
  mtx: 8,
  dca: 16,
  mute: 8,
  fx: 16,
  source: { LCL: 24, AUX: 8, A: 48, B: 48, C: 48, SC: 32, USB: 48, CRD: 64, MOD: 64, PLAY: 4, AES: 2, USR: 48, OSC: 2 },
  output: { LCL: 8, AUX: 8, A: 48, B: 48, C: 48, SC: 32, USB: 48, CRD: 64, MOD: 64, REC: 4, AES: 2 },
  area: { LEFT: 7, CENTER: 6, RIGHT: 7, COMPACT: 9, RACK: 5, EXTERN: 8, VIRTUAL: 8 },
  custom: 31,
  setup: 3,
  contents: 15,
  mainsend: 4,
  bussend: 24,
} as const;

/**
 * The scope page's CONTENTS panel has 15 entries (its 17 tiles minus MAIN and
 * SEND, which are the separate `mainsend` / `bussend` fields):
 *
 *   CUST TAGS CONN IN/HA FILTER DELAY GATE DYN INS1 INS2 EQ PAN FDR MUTE CONFIG
 *
 * Dropping IN/HA would belt-and-brace the head amp on channels that do change.
 * Not done: a console save with only IN/HA ticked wrote `" +             "`
 * (slot 2), while that panel order puts IN/HA at slot 4, so the mapping between
 * tile order and string order is unresolved. Guessing wrong would silently
 * disable something else, and it buys nothing today — `source` being out of
 * scope already protects every gain.
 */

function flags(count: number, on: (index: number) => boolean): string {
  let out = "";
  for (let index = 0; index < count; index++) out += on(index) ? SCOPE_ON : SCOPE_OFF;
  return out;
}

function group(
  shape: Record<string, number>,
  fill: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(shape).map(([key, count]) => [key, fill.repeat(count)]),
  );
}

function scopeShape(fill: string): WingScopes {
  return {
    ch: fill.repeat(SCOPE_SHAPE.ch),
    aux: fill.repeat(SCOPE_SHAPE.aux),
    bus: fill.repeat(SCOPE_SHAPE.bus),
    main: fill.repeat(SCOPE_SHAPE.main),
    mtx: fill.repeat(SCOPE_SHAPE.mtx),
    dca: fill.repeat(SCOPE_SHAPE.dca),
    mute: fill.repeat(SCOPE_SHAPE.mute),
    fx: fill.repeat(SCOPE_SHAPE.fx),
    source: group(SCOPE_SHAPE.source, fill),
    output: group(SCOPE_SHAPE.output, fill),
    area: group(SCOPE_SHAPE.area, fill),
    custom: fill.repeat(SCOPE_SHAPE.custom),
    setup: fill.repeat(SCOPE_SHAPE.setup),
    contents: fill.repeat(SCOPE_SHAPE.contents),
    mainsend: fill.repeat(SCOPE_SHAPE.mainsend),
    bussend: fill.repeat(SCOPE_SHAPE.bussend),
  };
}

function fullScope(): WingScopes {
  return scopeShape(SCOPE_ON);
}
