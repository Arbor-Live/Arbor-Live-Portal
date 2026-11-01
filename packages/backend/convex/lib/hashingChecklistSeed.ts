import type { ChecklistTree } from "./hashingValues";

/**
 * The owner's closet list, as version 1 of the checklist. `line` ids come from
 * position, and they are frozen once a hash pins this version.
 *
 * The second "x2 SM57" in each mic pack is stored as "x2 SM58": a guess at a
 * typo in the owner's list, to confirm with them.
 */
function lines(prefix: string, texts: readonly string[]) {
  return texts.map((text, index) => ({ id: `${prefix}-${index + 1}`, text }));
}

function kit(id: string, name: string, texts: readonly string[]) {
  return { id, name, items: lines(id, texts) };
}

const PACKOUT_FINAL_CHECKS = [
  "Packout labels are all there",
  "Packout is in good condition and ready to be used",
];

const KITS: ChecklistTree["kits"] = [
  kit("event-kit", "Event Kit", [
    "Container is clean and usable",
    "Has enough consumables for the week (gaff, scribble)",
    "Has headlamps with battery, has laser measurement device with battery",
    "Has Naloxone",
    "Has wrench",
    "Has screwdriver",
    "Has screwdriver bits",
    "Has first aid",
    "Has USB-C charger",
    "Has USB C cable",
    "Has USB C Splitter Cable",
  ]),
  kit("mic-pack-l", "Mic Pack L", [
    "All drawers are clean and usable",
    "Has x3 SM57",
    "Has x2 SM58",
    "Has x2 SM81",
    "Has all mic clips (x2 thin, x5 normal)",
    "Has x3 stereo DIs",
    "Has x1 mono DI",
    "Has all TRS connectors",
    "Has x3 e904 with clips in a bag",
    "Has Wireless Pack with replaced batteries of wireless",
    "Spare batteries swapped if seal broken",
  ]),
  kit("mic-pack-m", "Mic Pack M", [
    "All drawers are clean and usable",
    "Has x3 SM57",
    "Has x2 SM58",
    "Has x2 CO2",
    "Has all mic clips (x2 thin, x5 normal)",
    "Has x2 stereo DIs",
    "Has x2 mono DI",
    "Has all TRS connectors",
    "Has x2 e904 with clips in a bag",
    "Has Wireless Pack with replaced batteries of wireless",
    "Spare batteries swapped if seal broken",
  ]),
  kit("xlr-pack", "XLR Pack", [
    "Container is clean and usable",
    "Has all cables listed on the diagram",
    "All cables are wrapped properly, velcro is tight (Replace any cable ties that do not hold cable anymore)",
    "All cables are stored vertically in increasing length",
  ]),
  kit("iec-pack", "IEC Pack", [
    "Container is clean and usable",
    "Has x7 long IEC cables",
    "Has x4 short cables, two on either side",
  ]),
  kit("power-crate-a", "Power Crate A", [
    "Container is clean and usable",
    "Has x2 Snakes",
    "Has x2 Extensions",
    "Has x4 Strips",
  ]),
  kit("lx-kit", "LX Kit", [
    "Container is clean and usable",
    "Has Keyboard",
    "Has 5p to 3p and 3p to 5p adapters",
    "Has DFi controller",
    "Has wrench",
  ]),
  kit("crmx-pro-kit", "CRMX Pro Kit", [
    "Container is clean and usable",
    "Has Stardust",
    "Has TRUE1 power cable",
    "Has ethernet",
    "Has Microphone stand adapter",
    "Has two moonlites",
  ]),
  kit("true1-cable-kit", "TRUE1 Cable Kit", ["Container is clean and usable", "Has cables neatly wrapped"]),
  kit("power-crate-b", "Power Crate B", [
    "Container is clean and usable",
    "Has x6 extensions",
    "Has x2 strips",
  ]),
  kit("stands", "Stands", [
    "Checked all large mic stand bags — large should have x6 long, x2 short",
    "Checked all grab mic stand bags — large should have x2 long, x1 short",
    "Stored all mic stand bags in the correct side of the dolly, there are no 35mm stands there",
    "Checked all 35mm stands are visually in good condition",
    "Made sure bags that should have two stands have two stands that are the same model",
    "Stored all 35mm stands in the correct side of the dolly, there are no mic stands or mic stand bags there",
  ]),
  kit("speakers-shelf", "Shelf", [
    "All big speakers have travel bag",
    "The bottom black shelf only has QSC K12.2s",
    "RCF Speakers are in the roadcase",
    "RCF Subs are on top of the roadcase and the ratchet is tight",
    "All monitors are in the middle black shelf, visually in good condition",
    "IEM Kit is in its place",
    "Spare mic bag is in its place and has mics (not necessarily full)",
    "Yamaha mixer is in its place",
    "Ethercon is in its place",
    "Grab Bag has a mixer",
    "Grab Bag has XLR",
    "Grab Bag has TRS",
    "Grab Bag has a power snake",
    "Grab Bag has one SM87, one SM58",
    'Grab Bag has a 1/4" to 3.5mm adapter',
  ]),
  kit("red-shelf", "Shelf", [
    "Outpost Rangers are in their position",
    "Outpost Ranger case has all of its cables (8 in the strip, 8 DMX + 1 TRUE1 in the side)",
    "Outpost rangers have over 30% battery",
    "MA3 board is on top of the outpost ranger case",
    "MA3 board has a power cable, two lights",
    "Freedom Charge 8p is in its position, backed in so the handle faces out",
    "Freedom Charges have over 30% battery",
    "WING is in its position, backed in so the handle faces out",
    "WING has router, USB-C Hub, two ethernet cables, USB-B Cable, Dust Cover, IEC Cable, XLR for talkback",
    "All walkies are in their position",
    "Org shelf is somewhat clean and usable",
    "All 4BARs are in their place",
    "Mini LX Kit is in its place",
    "MA2 Kit is in its place",
    "ILS Command is in its position",
    "Q3 Beam is in its position",
    "ETC ColorSource is in its position",
  ]),
  kit("wrap-up", "Wrap-up", [
    "Keyboard is in good condition and tidy",
    "Drums are in good condition and tidy",
    "DJ Table looking good",
    "Dollies piled up and the nuts look tight",
    "Hazer on top of chauvet moving lights",
    "Batteries charged to over 80%",
    "Cable ramp packouts have everything",
    "The closet is clean and usable for the week",
  ]),
];

function placed(...kitIds: string[]) {
  return kitIds.map((kitId) => ({ kitId, extraItems: [] as { id: string; text: string }[] }));
}

const AREAS: ChecklistTree["areas"] = [
  {
    id: "large-packout",
    name: "Large Packout",
    placements: placed("event-kit", "mic-pack-l", "xlr-pack", "iec-pack", "power-crate-a"),
    finalChecks: lines("large-final", PACKOUT_FINAL_CHECKS),
  },
  {
    id: "medium-packout",
    name: "Medium Packout",
    placements: [
      { kitId: "event-kit", extraItems: lines("event-kit-medium", ["Has tablet and is charged"]) },
      ...placed("mic-pack-m", "xlr-pack", "iec-pack", "power-crate-a"),
    ],
    finalChecks: lines("medium-final", PACKOUT_FINAL_CHECKS),
  },
  {
    id: "lx-packout",
    name: "LX Packout",
    placements: placed("lx-kit", "crmx-pro-kit", "true1-cable-kit", "power-crate-b"),
    finalChecks: lines("lx-final", PACKOUT_FINAL_CHECKS),
  },
  {
    id: "stands",
    name: "Mic stands & 35mm stands",
    placements: placed("stands"),
    finalChecks: lines("stands-final", ["Stands are in good condition and ready to be used"]),
  },
  {
    id: "speakers-black-shelf",
    name: "Speakers & black shelf",
    placements: placed("speakers-shelf"),
    finalChecks: lines("speakers-final", [
      "Grab bag is in good condition, cables are wrapped neatly and ready to be used",
      "Speakers are in good condition and ready to be used",
      "Black shelf items are in good condition and ready to be used",
    ]),
  },
  {
    id: "red-shelf",
    name: "Red shelf",
    placements: placed("red-shelf"),
    finalChecks: lines("red-final", ["Red shelf items are in good condition and ready to be used"]),
  },
  {
    id: "misc-wrap-up",
    name: "Misc & wrap-up",
    placements: placed("wrap-up"),
    finalChecks: [],
  },
];

export const HASHING_CHECKLIST_SEED: ChecklistTree = { kits: KITS, areas: AREAS };
