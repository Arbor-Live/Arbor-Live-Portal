/**
 * Controlled vocabulary of input sources.
 *
 * Entries are **roles only** — what a thing is, never how it is captured or
 * which one it is. Those are separate axes that already live on the channel:
 *
 *   role      `RiderInputChannel.sourceKey`  → this catalogue
 *   capture   `RiderInputChannel.inputType`  → mic on a cab vs DI vs wireless
 *   width     `RiderInputChannel.stereo`     → one strip, two physical inputs
 *   which one derived from position          → the 2nd `gtr` channel is Guitar 2
 *
 * So there is one `gtr`, not `gtr.amp` / `gtr.amp2` / `gtr.di`; one `vox.lead`
 * that covers a wireless handheld and an unlimited number of singers. Folding
 * any of those back into a key makes the catalogue grow without bound and
 * breaks matching across riders.
 *
 * `RiderInputChannel.source` is what the band types ("Sarah — lead") and is
 * display-only. `sourceKey` is the only thing show-file generation matches on.
 *
 * Keys are permanent. Renaming a `label` is fine; changing a `key` orphans every
 * rider that used it, so add a new entry instead.
 */

import type { RiderInputType, RiderStandType } from "./types";

export type RiderSourceFamily =
  | "drums"
  | "percussion"
  | "bass"
  | "guitar"
  | "keys"
  | "vocals"
  | "strings"
  | "winds"
  | "playback"
  | "utility";

/**
 * Physical interchangeability: two channels can share one input and mic across
 * sets if their reuse classes match and they sit in a similar place on stage —
 * a tenor sax in band 2 and a trumpet in band 5 are both `horn`.
 *
 * It hangs off the capture, not the role, because that is what actually decides
 * it: a DI'd bass and a DI'd keyboard both just need a DI box, while a kick and
 * an overhead are both drums and share nothing.
 */
export type RiderSourceReuseClass =
  | "kick"
  | "snare"
  | "tom"
  | "overhead"
  | "hat"
  | "perc"
  | "amp_mic"
  | "acoustic_mic"
  | "horn"
  | "vox_wired"
  | "vox_wireless"
  | "di"
  | "di_stereo"
  | "line";

/** One way of picking a role up, with the rig defaults that follow from it. */
export type RiderCaptureOption = {
  inputType: RiderInputType;
  stand: RiderStandType;
  phantom: boolean;
  reuseClass: RiderSourceReuseClass;
};

export type RiderSourceDefinition = {
  key: string;
  /** Shown in the picker and used as the channel's starting `source` text. */
  label: string;
  family: RiderSourceFamily;
  /**
   * Valid capture methods, most common first. A single entry means the capture
   * is fixed and the Type column should not invite a change; more than one means
   * it is a real decision (guitar is amp-or-DI, bass is DI-or-amp).
   */
  captures: RiderCaptureOption[];
  /** Default strip width. Still the band's call on the channel. */
  stereo?: boolean;
  /** Surfaces in the short list before the band opens the full catalogue. */
  common?: boolean;
  /** Search terms, and the only accepted spellings when mapping legacy text. */
  aliases?: string[];
};

export const RIDER_SOURCE_FAMILY_LABELS: Record<RiderSourceFamily, string> = {
  drums: "Drums",
  percussion: "Percussion",
  bass: "Bass",
  guitar: "Guitars",
  keys: "Keys",
  vocals: "Vocals",
  strings: "Strings",
  winds: "Brass & winds",
  playback: "Playback & tracks",
  utility: "Utility",
};

/** Family order in the picker — most-used first, not alphabetical. */
export const RIDER_SOURCE_FAMILY_ORDER: RiderSourceFamily[] = [
  "drums",
  "bass",
  "guitar",
  "keys",
  "vocals",
  "percussion",
  "winds",
  "strings",
  "playback",
  "utility",
];

// Capture shorthands — these repeat constantly and are easier to review named.
const DI: RiderCaptureOption = {
  inputType: "di",
  stand: "none",
  phantom: false,
  reuseClass: "di",
};
const DI_ACTIVE: RiderCaptureOption = { ...DI, phantom: true };
const DI_STEREO: RiderCaptureOption = { ...DI, reuseClass: "di_stereo" };
const DI_STEREO_ACTIVE: RiderCaptureOption = { ...DI_STEREO, phantom: true };
const AMP_MIC: RiderCaptureOption = {
  inputType: "mic",
  stand: "short_boom",
  phantom: false,
  reuseClass: "amp_mic",
};
const ACOUSTIC_MIC: RiderCaptureOption = {
  inputType: "mic",
  stand: "tall_boom",
  phantom: true,
  reuseClass: "acoustic_mic",
};
const HORN_MIC: RiderCaptureOption = {
  inputType: "mic",
  stand: "tall_boom",
  phantom: false,
  reuseClass: "horn",
};
const VOX_WIRED: RiderCaptureOption = {
  inputType: "mic",
  stand: "tall_boom",
  phantom: false,
  reuseClass: "vox_wired",
};
const VOX_WIRELESS: RiderCaptureOption = {
  inputType: "wireless",
  stand: "none",
  phantom: false,
  reuseClass: "vox_wireless",
};
const PERC_MIC: RiderCaptureOption = {
  inputType: "mic",
  stand: "short_boom",
  phantom: false,
  reuseClass: "perc",
};
const PERC_OVERHEAD: RiderCaptureOption = {
  inputType: "mic",
  stand: "tall_boom",
  phantom: true,
  reuseClass: "perc",
};
const LINE: RiderCaptureOption = {
  inputType: "playback",
  stand: "none",
  phantom: false,
  reuseClass: "line",
};
const drumMic = (
  reuseClass: RiderSourceReuseClass,
  stand: RiderStandType = "clip",
  phantom = false,
): RiderCaptureOption => ({ inputType: "mic", stand, phantom, reuseClass });

export const RIDER_SOURCES: RiderSourceDefinition[] = [
  // ── Drums ────────────────────────────────────────────────────────────────
  {
    key: "drum.kick",
    label: "Kick",
    family: "drums",
    captures: [drumMic("kick", "short_boom")],
    common: true,
    aliases: ["bd", "bass drum", "kick in", "kick drum", "kik"],
  },
  {
    key: "drum.snare.top",
    label: "Snare",
    family: "drums",
    captures: [drumMic("snare")],
    common: true,
    aliases: ["sn", "snare top", "snr"],
  },
  {
    key: "drum.snare.bottom",
    label: "Snare (bottom)",
    family: "drums",
    captures: [drumMic("snare")],
    aliases: ["snare bot", "snare under", "snare bottom"],
  },
  {
    key: "drum.hat",
    label: "Hi-hat",
    family: "drums",
    captures: [drumMic("hat", "short_boom", true)],
    common: true,
    aliases: ["hh", "hats", "hihat", "hi hat"],
  },
  {
    key: "drum.tom.rack",
    label: "Rack tom",
    family: "drums",
    captures: [drumMic("tom")],
    common: true,
    aliases: ["tom", "rack tom", "high tom", "hi tom", "mid tom", "t1", "t2"],
  },
  {
    key: "drum.tom.floor",
    label: "Floor tom",
    family: "drums",
    captures: [drumMic("tom")],
    common: true,
    aliases: ["ft", "floor tom", "low tom", "t3", "t4"],
  },
  {
    key: "drum.oh",
    label: "Overheads",
    family: "drums",
    captures: [drumMic("overhead", "tall_boom", true)],
    stereo: true,
    common: true,
    aliases: ["oh", "overhead", "overheads", "oh l/r"],
  },
  {
    key: "drum.ride",
    label: "Ride",
    family: "drums",
    captures: [drumMic("hat", "short_boom", true)],
    aliases: ["ride cymbal"],
  },
  {
    key: "drum.electronic",
    label: "Electronic kit",
    family: "drums",
    captures: [DI_STEREO],
    stereo: true,
    aliases: ["e kit", "spd", "electronic drums", "sample pad", "v drums"],
  },

  // ── Percussion ───────────────────────────────────────────────────────────
  {
    key: "perc.aux",
    label: "Aux percussion",
    family: "percussion",
    captures: [PERC_OVERHEAD],
    aliases: ["percussion", "perc", "aux perc"],
  },
  {
    key: "perc.congas",
    label: "Congas",
    family: "percussion",
    captures: [PERC_MIC],
    aliases: ["conga"],
  },
  {
    key: "perc.bongos",
    label: "Bongos",
    family: "percussion",
    captures: [PERC_MIC],
    aliases: ["bongo"],
  },
  {
    key: "perc.cajon",
    label: "Cajón",
    family: "percussion",
    captures: [PERC_MIC],
    aliases: ["cajon"],
  },
  {
    key: "perc.djembe",
    label: "Djembe",
    family: "percussion",
    captures: [PERC_MIC],
  },
  {
    key: "perc.timbales",
    label: "Timbales",
    family: "percussion",
    captures: [PERC_MIC],
  },
  {
    key: "perc.handheld",
    label: "Shaker / tambourine",
    family: "percussion",
    captures: [PERC_OVERHEAD],
    aliases: ["shaker", "tambourine", "tamb"],
  },

  // ── Bass ─────────────────────────────────────────────────────────────────
  {
    key: "bass",
    label: "Bass",
    family: "bass",
    // House preference is DI, but micing the cab stays the band's call.
    captures: [DI, AMP_MIC],
    common: true,
    aliases: ["bass guitar", "electric bass", "bass rig", "bass di", "bass amp", "bass cab"],
  },
  {
    key: "bass.upright",
    label: "Upright bass",
    family: "bass",
    captures: [DI_ACTIVE, { ...ACOUSTIC_MIC, stand: "short_boom" }],
    aliases: ["double bass", "upright", "contrabass", "acoustic bass"],
  },
  {
    key: "bass.synth",
    label: "Synth bass",
    family: "bass",
    captures: [DI],
    aliases: ["sub bass", "bass synth"],
  },

  // ── Guitars ──────────────────────────────────────────────────────────────
  {
    key: "gtr",
    label: "Guitar",
    family: "guitar",
    captures: [AMP_MIC, DI],
    common: true,
    aliases: [
      "gtr",
      "electric guitar",
      "guitar amp",
      "gtr amp",
      "guitar cab",
      "e guit",
      "guitar di",
      "helix",
      "kemper",
      "axe fx",
      "modeler",
    ],
  },
  {
    key: "gtr.acoustic",
    label: "Acoustic guitar",
    family: "guitar",
    captures: [DI_ACTIVE, ACOUSTIC_MIC],
    common: true,
    aliases: ["acoustic", "a guit", "ag", "acoustic di"],
  },
  {
    key: "gtr.banjo",
    label: "Banjo",
    family: "guitar",
    captures: [DI_ACTIVE, ACOUSTIC_MIC],
    aliases: ["bnjo"],
  },
  {
    key: "gtr.mandolin",
    label: "Mandolin",
    family: "guitar",
    captures: [DI_ACTIVE, ACOUSTIC_MIC],
  },
  {
    key: "gtr.pedal_steel",
    label: "Pedal steel",
    family: "guitar",
    captures: [DI, AMP_MIC],
    aliases: ["steel", "lap steel", "pedal steel"],
  },
  {
    key: "gtr.ukulele",
    label: "Ukulele",
    family: "guitar",
    captures: [DI_ACTIVE, ACOUSTIC_MIC],
    aliases: ["uke"],
  },

  // ── Keys ─────────────────────────────────────────────────────────────────
  {
    key: "keys",
    label: "Keys",
    family: "keys",
    captures: [DI_STEREO],
    stereo: true,
    common: true,
    aliases: ["keyboard", "keys l/r", "synth", "keys l", "keys r"],
  },
  {
    key: "keys.organ",
    label: "Organ",
    family: "keys",
    captures: [DI_STEREO],
    stereo: true,
    aliases: ["hammond", "leslie", "b3"],
  },
  {
    key: "keys.rhodes",
    label: "Rhodes / electric piano",
    family: "keys",
    captures: [DI],
    aliases: ["rhodes", "wurlitzer", "wurli", "electric piano", "ep"],
  },
  {
    key: "keys.piano",
    label: "Acoustic piano",
    family: "keys",
    captures: [{ ...ACOUSTIC_MIC, stand: "short_boom" }],
    stereo: true,
    aliases: ["piano", "grand piano", "upright piano"],
  },
  {
    key: "keys.accordion",
    label: "Accordion",
    family: "keys",
    captures: [DI_ACTIVE, ACOUSTIC_MIC],
  },

  // ── Vocals ───────────────────────────────────────────────────────────────
  {
    key: "vox.lead",
    label: "Lead vocal",
    family: "vocals",
    // Wireless is a capture, not a different source — a handheld RF lead vocal
    // is still a lead vocal.
    captures: [VOX_WIRED, VOX_WIRELESS],
    common: true,
    aliases: [
      "vocal",
      "vox",
      "lead vox",
      "lead",
      "vocals",
      "lv",
      "wireless",
      "handheld",
      "wireless vocal",
      "wireless handheld",
      "rf mic",
      "headset",
      "lav",
      "lavalier",
      "drum vox",
      "drummer vocal",
    ],
  },
  {
    key: "vox.bgv",
    label: "Backing vocal",
    family: "vocals",
    captures: [VOX_WIRED, VOX_WIRELESS],
    common: true,
    aliases: ["bgv", "bg vox", "backing vox", "backup vocal", "harmony"],
  },
  {
    key: "vox.mc",
    label: "MC / host mic",
    family: "vocals",
    captures: [VOX_WIRELESS, VOX_WIRED],
    aliases: ["mc", "host", "announce", "emcee", "speech"],
  },
  {
    key: "vox.choir",
    label: "Choir mic",
    family: "vocals",
    captures: [ACOUSTIC_MIC],
    aliases: ["choir", "ensemble mic"],
  },
  {
    key: "vox.talkback",
    label: "Talkback",
    family: "vocals",
    captures: [{ ...VOX_WIRED, stand: "short_boom" }],
    aliases: ["talkback", "tkbk", "comms"],
  },

  // ── Brass & winds ────────────────────────────────────────────────────────
  {
    key: "wind.horn",
    label: "Horn (unspecified)",
    family: "winds",
    captures: [HORN_MIC],
    aliases: ["horn", "horns", "brass"],
  },
  {
    key: "wind.trumpet",
    label: "Trumpet",
    family: "winds",
    captures: [HORN_MIC],
    aliases: ["tpt", "trpt"],
  },
  {
    key: "wind.trombone",
    label: "Trombone",
    family: "winds",
    captures: [HORN_MIC],
    aliases: ["tbn", "bone"],
  },
  {
    key: "wind.sax.alto",
    label: "Alto sax",
    family: "winds",
    captures: [HORN_MIC],
    aliases: ["alto", "asax", "alto saxophone"],
  },
  {
    key: "wind.sax.tenor",
    label: "Tenor sax",
    family: "winds",
    captures: [HORN_MIC],
    aliases: ["tenor", "tsax", "sax", "saxophone", "tenor saxophone"],
  },
  {
    key: "wind.sax.bari",
    label: "Bari sax",
    family: "winds",
    captures: [HORN_MIC],
    aliases: ["bari", "baritone sax"],
  },
  {
    key: "wind.flute",
    label: "Flute",
    family: "winds",
    captures: [ACOUSTIC_MIC],
  },
  {
    key: "wind.clarinet",
    label: "Clarinet",
    family: "winds",
    captures: [ACOUSTIC_MIC],
  },
  {
    key: "wind.harmonica",
    label: "Harmonica",
    family: "winds",
    captures: [VOX_WIRED],
    aliases: ["harp", "blues harp", "harmonica"],
  },

  // ── Strings ──────────────────────────────────────────────────────────────
  {
    key: "strings",
    label: "Strings (unspecified)",
    family: "strings",
    captures: [DI_ACTIVE, ACOUSTIC_MIC],
    aliases: ["string"],
  },
  {
    key: "strings.violin",
    label: "Violin",
    family: "strings",
    captures: [DI_ACTIVE, ACOUSTIC_MIC],
    aliases: ["vln", "fiddle"],
  },
  {
    key: "strings.viola",
    label: "Viola",
    family: "strings",
    captures: [DI_ACTIVE, ACOUSTIC_MIC],
  },
  {
    key: "strings.cello",
    label: "Cello",
    family: "strings",
    captures: [DI_ACTIVE, { ...ACOUSTIC_MIC, stand: "short_boom" }],
  },
  {
    key: "strings.harp",
    label: "Harp",
    family: "strings",
    captures: [DI_ACTIVE, ACOUSTIC_MIC],
  },

  // ── Playback & tracks ────────────────────────────────────────────────────
  {
    key: "pb",
    label: "Playback",
    family: "playback",
    captures: [LINE],
    stereo: true,
    common: true,
    aliases: ["playback", "tracks", "backing track", "aux in", "laptop", "ipod"],
  },
  {
    key: "pb.click",
    label: "Click track",
    family: "playback",
    captures: [LINE],
    aliases: ["click", "metronome", "cue"],
  },
  {
    key: "pb.dj",
    label: "DJ",
    family: "playback",
    captures: [DI_STEREO],
    stereo: true,
    aliases: ["dj booth", "turntables", "cdj", "dj l/r", "dj l", "dj r"],
  },
  {
    key: "pb.sampler",
    label: "Sampler / pad",
    family: "playback",
    captures: [DI_STEREO],
    stereo: true,
    aliases: ["sampler", "pads", "mpc", "ableton"],
  },

  // ── Utility ──────────────────────────────────────────────────────────────
  {
    key: "util.ambient",
    label: "Audience / ambient",
    family: "utility",
    captures: [ACOUSTIC_MIC],
    stereo: true,
    aliases: ["ambient", "audience", "room mics", "crowd"],
  },
  {
    key: "util.spare",
    label: "Spare input",
    family: "utility",
    // "Spare mic" vs "spare DI" is the capture, not two different things.
    captures: [VOX_WIRED, DI],
    aliases: ["spare", "spare mic", "spare di", "spare vocal", "extra mic", "extra di"],
  },
];

const BY_KEY = new Map(RIDER_SOURCES.map((source) => [source.key, source]));

export function riderSource(key: string): RiderSourceDefinition | undefined {
  return BY_KEY.get(key);
}

/** The capture a freshly picked channel starts on. */
export function defaultCapture(source: RiderSourceDefinition): RiderCaptureOption {
  return source.captures[0];
}

/** Whether the Type column is a real choice for this role, or fixed. */
export function hasCaptureChoice(source: RiderSourceDefinition): boolean {
  return source.captures.length > 1;
}

export function captureFor(
  source: RiderSourceDefinition,
  inputType: RiderInputType,
): RiderCaptureOption | undefined {
  return source.captures.find((capture) => capture.inputType === inputType);
}

/** The short list shown before a band opens the full catalogue. */
export function commonRiderSources(): RiderSourceDefinition[] {
  return RIDER_SOURCES.filter((source) => source.common);
}

export function riderSourcesByFamily(): Array<{
  family: RiderSourceFamily;
  label: string;
  sources: RiderSourceDefinition[];
}> {
  return RIDER_SOURCE_FAMILY_ORDER.map((family) => ({
    family,
    label: RIDER_SOURCE_FAMILY_LABELS[family],
    sources: RIDER_SOURCES.filter((source) => source.family === family),
  })).filter((group) => group.sources.length > 0);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const BY_NORMALIZED = (() => {
  const index = new Map<string, RiderSourceDefinition>();
  for (const source of RIDER_SOURCES) {
    for (const term of [source.label, ...(source.aliases ?? [])]) {
      const norm = normalize(term);
      // First definition wins, so earlier (more common) entries own shared
      // aliases — "sax" resolves to tenor, not bari.
      if (norm && !index.has(norm)) index.set(norm, source);
    }
  }
  return index;
})();

/**
 * Resolves free text to a role, for back-filling legacy channels and accepting
 * typed input in the picker.
 *
 * Exact match on the normalized label or an alias only — no fuzzy or prefix
 * matching. A wrong-but-confident mapping is worse than no mapping, because an
 * unmapped channel is visible to crew and a mis-mapped one silently patches the
 * wrong input on show day.
 *
 * Trailing ordinals are stripped first, so the legacy "Guitar 2" and "Vocal 3"
 * resolve to their role and pick their number back up from position.
 */
export function matchRiderSource(text: string): RiderSourceDefinition | undefined {
  const norm = normalize(text);
  return BY_NORMALIZED.get(norm) ?? BY_NORMALIZED.get(norm.replace(/ \d+$/, ""));
}

/** Search for the picker: matches on label and aliases, common entries first. */
export function searchRiderSources(query: string): RiderSourceDefinition[] {
  const norm = normalize(query);
  if (!norm) return commonRiderSources();
  const hits = RIDER_SOURCES.filter((source) =>
    [source.label, ...(source.aliases ?? [])].some((term) =>
      normalize(term).includes(norm),
    ),
  );
  return hits.sort((a, b) => Number(b.common ?? false) - Number(a.common ?? false));
}
