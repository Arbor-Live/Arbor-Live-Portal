import {
  AES50_GROUP,
  FAMILY_STYLE,
  TALKBACK_LOCAL_INPUT,
  TALKBACK_STRIP,
  aes50PortFor,
} from "./slots";
import { writeLayerPages } from "./layer-write";
import { planVocalFx } from "./fx-plan";
import type { BlueprintEngine } from "./fx-allocate";
import { processingForFamily } from "./processing";
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
  // Lay the generated pages onto the surface (USER1 on a WING Compact). The
  // vocal FX (PCORR/DE-S2) are rebuilt as part of the channel strips.
  writeLayerPages(snap, allocation.layers);
  snap.scopes = fullScope();
  return snap;
}

/**
 * Patch + name every socket. `fileStem` null builds the muted night baseline.
 *
 * Each socket's own strip (socket N → strip N) is patched from it, and the
 * strip gets its family's DCA/mute tags. The template is a blueprint, not
 * content: its DCA names, bus inserts and channel inserts are all rebuilt from
 * the bill (see `rebuildDcas`, `clearStrayBusInserts`, `applyVocalFx`), while
 * its bus EQ/dynamics, sends, FX engines and other comforts are left as-is.
 */
function applyAllocation(
  template: WingSnap,
  allocation: EventPatchAllocation,
  fileStem: string | null,
): WingSnap {
  const snap = structuredClone(template);
  const channels = snap.ae_data.ch;

  // Rebuild the desk from the bill: name only the DCAs the bill justifies, and
  // drop the template's stray bus insert. Channel inserts are rebuilt below,
  // once the patch is in place.
  rebuildDcas(snap, allocation);
  clearStrayBusInserts(snap);

  for (const port of allocation.ports) {
    const style = FAMILY_STYLE[port.family];
    const socket = socketFor(snap, port);
    if (socket) {
      if (port.used) {
        socket.name = port.label;
        socket.mode = port.stereo ? "ST" : "M";
        socket.col = style.col;
        socket.icon = style.icon;
        // Hard rule: phantom only on OH ports.
        socket.vph = port.family === "oh" && port.phantom;
      } else {
        socket.name = "";
        socket.mode = "M";
        socket.vph = false;
      }
    }

    // Right half of a stereo pair rides the left socket's strip.
    if (port.strip === null) continue;
    const strip = channels[String(port.strip)];
    if (!strip) continue;

    if (!port.used) {
      // Nothing plugs in here tonight — take the channel out of the way.
      strip.name = "";
      strip.mute = true;
      strip.in = strip.in ?? {};
      strip.in.conn = { grp: "OFF", in: 1, altgrp: "OFF", altin: 1 };
      strip.tags = "";
      continue;
    }

    strip.in = strip.in ?? {};
    strip.in.conn = {
      grp: AES50_GROUP,
      in: aes50PortFor(port.snake, port.port),
      altgrp: "OFF",
      altin: 1,
    };
    strip.name = port.label;
    strip.col = style.col;
    strip.icon = style.icon;
    // Keep the group's DCA/mute subscription even though the patch moved.
    strip.tags = port.tags;
    strip.mute = fileStem === null ? true : !port.bandLabels[fileStem];
    // Per-family gate/HPF/dynamics/EQ: on where it helps, explicitly off where
    // it does not, so a channel never inherits a stale FX-return's processing.
    applyProcessing(strip, port.family);
  }

  // Vocal inserts are part of a rebuilt channel strip, not the template: clear
  // every owned channel's inserts, then put PCORR/DE-S2 on the vocals. This is
  // shared with band snaps, so a changed channel never recalls a stray insert.
  applyVocalFx(snap, allocation);
  // Talkback is constant, not bill-driven: it is always on its own strip,
  // patched from A.8, whatever the band patch does with the other sockets.
  pinTalkback(snap);

  return snap;
}

/**
 * Write a family's gate/HPF/dynamics/EQ defaults onto a channel strip, keeping
 * the blueprint's model and parameter shapes so the desk accepts the values.
 */
function applyProcessing(
  strip: Record<string, unknown>,
  family: EventPatchAllocation["ports"][number]["family"],
): void {
  const preset = processingForFamily(family);
  const merge = (key: string, values: Record<string, unknown>) => {
    const current = strip[key];
    strip[key] =
      current && typeof current === "object"
        ? { ...current, ...values }
        : { ...values };
  };
  merge("flt", preset.filter);
  merge("gate", preset.gate);
  merge("dyn", preset.dyn);
  merge("eq", preset.eq);
}

/**
 * Talkback is rig furniture, not content: it lives on its own channel strip
 * patched from the desk's **local** input 24, and `cfg.talk.assign` points the
 * talk key at it. Keep that fixed every build so a bill can never strand it.
 */
function pinTalkback(snap: WingSnap): void {
  const channel = snap.ae_data.ch[TALKBACK_STRIP];
  if (!channel) return;
  channel.in = channel.in ?? {};
  channel.in.conn = {
    grp: "LCL",
    in: TALKBACK_LOCAL_INPUT,
    altgrp: "OFF",
    altin: 1,
  };
  channel.name = "TALKBACK";
}

/**
 * Rebuild the DCA names from the bill's groups.
 *
 * The template's DCA names are blueprint leftovers (" Vox DCA", "Melody DCA",
 * "FX DCA"); a DCA is only justified when a group actually has channels on the
 * bill. Active groups are named in order and every other slot is blanked so a
 * stale name never rides a recall. Icons/colours stay on the template's base
 * DCA shape — the bill says nothing about them.
 */
function rebuildDcas(
  snap: WingSnap,
  allocation: EventPatchAllocation,
): void {
  const dcas = snap.ae_data.dca as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!dcas) return;

  const byDca = new Map(
    allocation.groups.map((group) => [String(group.dca), group.label]),
  );
  // The vocal FX DCA is its own group (bus-fed, not family), so name it too.
  if (allocation.fxDca) byDca.set(String(allocation.fxDca.dca), allocation.fxDca.name);
  const base = dcas["1"];
  for (const slot of Object.keys(dcas)) {
    const label = byDca.get(slot);
    if (label === undefined) {
      dcas[slot] = { ...dcas[slot], name: "" };
      continue;
    }
    dcas[slot] = {
      ...(base ? structuredClone(base) : dcas[slot]),
      name: label,
    };
  }

  // Put the vocal FX returns into the FX DCA so one fader rides them.
  if (allocation.fxDca) {
    const buses = snap.ae_data.bus as
      | Record<string, { tags?: string }>
      | undefined;
    for (const bus of allocation.fxDca.buses) {
      const entry = buses?.[String(bus)];
      if (entry) entry.tags = `#D${allocation.fxDca.dca}`;
    }
  }
}

/**
 * Buses carry blueprint return routing: the template's named "Vox Rvrb" and
 * "Plate Rvrb" feed the loaded reverb engines, so their inserts stay. A bus the
 * template left unnamed is not part of that routing, and an insert sitting on it
 * (the template's DE-S2 on bus 15) is a stray — clear it. Bus names, EQ,
 * dynamics and routing are left as blueprint defaults.
 */
function clearStrayBusInserts(snap: WingSnap): void {
  const buses = snap.ae_data.bus as
    | Record<string, { name?: string; preins?: unknown; postins?: unknown }>
    | undefined;
  if (!buses) return;

  for (const bus of Object.values(buses)) {
    if ((bus.name ?? "").trim() !== "") continue;
    bus.preins = { on: false, ins: "NONE" };
    bus.postins = { on: false, ins: "NONE" };
  }
}

/**
 * Put the vocal effects on the vocals: PCORR on the pre insert, DE-S2 on the
 * post insert. The template's own FX engines decide how many of each are
 * available — we just find them and assign.
 *
 * The template left PCORR on channels 1–4, so every owned channel's inserts are
 * cleared first and re-added to vocals only.
 */
function applyVocalFx(snap: WingSnap, allocation: EventPatchAllocation): void {
  // Every channel the patch owns starts with no inserts. The template left
  // PCORR on its own channels, and a band scene that recalls a changed channel
  // must not drag that stray insert back in.
  for (const port of allocation.ports) {
    if (port.strip === null) continue;
    const channel = snap.ae_data.ch[String(port.strip)];
    if (!channel) continue;
    channel.preins = { on: false, ins: "NONE" };
    channel.postins = { on: false, mode: "FX", ins: "NONE", w: 0 };
  }

  // Read the blueprint's loaded engines (slot + model) — not hardcoded.
  const fx = snap.ae_data.fx ?? {};
  const engines: BlueprintEngine[] = Object.entries(fx)
    .map(([slot, engine]) => ({
      slot: Number(slot),
      model: (engine as { mdl?: string }).mdl ?? "",
    }))
    .filter((engine) => engine.model && engine.model !== "NONE")
    .sort((a, b) => a.slot - b.slot);

  const vocals = allocation.ports
    .filter(
      (port) =>
        port.used &&
        port.strip !== null &&
        (port.groupId === "vocals" || port.family === "vox"),
    )
    .map((port) => ({
      strip: port.strip!,
      isLead: port.label.toLowerCase().includes("lead"),
    }));

  const { assignments, additions } = planVocalFx(vocals, engines);

  // Load any extra engines the allocation called for, cloning an existing one of
  // the same model so its settings come along.
  for (const addition of additions) {
    const source = fx[String(addition.cloneFrom)];
    if (!source) continue;
    fx[String(addition.slot)] = structuredClone(source);
  }
  snap.ae_data.fx = fx;

  for (const { strip, pcorrSlot, deesserSlot } of assignments) {
    const channel = snap.ae_data.ch[String(strip)];
    if (!channel) continue;
    if (pcorrSlot !== null) {
      channel.preins = { on: true, ins: `FX${pcorrSlot}` };
    }
    if (deesserSlot !== null) {
      channel.postins = { on: true, mode: "FX", ins: `FX${deesserSlot}`, w: 0 };
    }
  }
}

/** Both boxes are daisy-chained on AES50 A, so box B lands on A.17–32. */
function socketFor(snap: WingSnap, port: PortAssignment) {
  return snap.ae_data.io.in[AES50_GROUP]?.[
    String(aes50PortFor(port.snake, port.port))
  ];
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
      conn: port.used
        ? { grp: AES50_GROUP, in: aes50PortFor(port.snake, port.port) }
        : null,
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
      conn: port.used
        ? { grp: AES50_GROUP, in: aes50PortFor(port.snake, port.port) }
        : null,
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
 *
 * Background and evidence: `docs/wing-show-files.md`.
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
