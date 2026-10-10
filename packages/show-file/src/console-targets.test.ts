import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import type { RiderInputChannel } from "@arbor/rider-document";
import { allocateEventPatch, fileStem, type ShowBandInput } from "./index";
import { buildShowPackage, loadDefaultTemplate } from "./node";
import { buildX32Scene } from "./x32";
import { buildXAirScene } from "./xair";

/** A `.msz` is a zip: an empty marker file plus one MS Scene json. */
function readMsz(bytes: Uint8Array) {
  const inner = unzipSync(bytes);
  expect(Object.keys(inner)).toHaveLength(2);
  expect(inner["preset_meta_info.json"]?.byteLength).toBe(0);
  const json = Object.entries(inner).find(([name]) => name !== "preset_meta_info.json")!;
  const scene = JSON.parse(strFromU8(json[1]));
  type Ch = { ref: { offset: number; type: number }; data: Record<string, any> };
  const ch = (n: number) =>
    (scene.ch as Ch[]).find((c) => c.ref.type === 0 && c.ref.offset === n - 1)!.data;
  return { scene, ch };
}

function input(
  partial: Partial<RiderInputChannel> &
    Pick<RiderInputChannel, "id" | "channel" | "source">,
): RiderInputChannel {
  return {
    inputType: "mic",
    stand: "tall_boom",
    phantom: false,
    providedBy: "arbor",
    ...partial,
  };
}

function band(
  name: string,
  role: ShowBandInput["role"],
  inputs: RiderInputChannel[],
): ShowBandInput {
  return { bandName: name, fileStem: fileStem(name), role, inputs };
}

const openers = band("Openers", "support", [
  input({ id: "o1", channel: 1, source: "Sam", sourceKey: "vox.lead" }),
  input({ id: "o2", channel: 2, source: "Nord", sourceKey: "keys", stereo: true, inputType: "di" }),
]);
const headliners = band("Headliners", "headliner", [
  input({ id: "h1", channel: 1, source: "Lee", sourceKey: "vox.lead" }),
  input({ id: "h2", channel: 2, source: "Nord", sourceKey: "keys", stereo: true, inputType: "di" }),
  input({ id: "h3", channel: 3, source: "OH", sourceKey: "drum.oh", stereo: true, phantom: true }),
  input({ id: "h4", channel: 4, source: "Kick", sourceKey: "drum.kick", phantom: true }),
]);

describe("X32 / M32 scene", () => {
  const template = loadDefaultTemplate();
  const allocation = allocateEventPatch([openers, headliners]);

  it("maps the AES50 A rig onto channels 1–32 in blocks of eight", () => {
    const night = buildX32Scene({ template, allocation, band: null, sceneName: "Default" });
    expect(night.text.startsWith('#4.0# "Default" "" %000000000 1\n')).toBe(true);
    expect(night.text).toContain(
      "/config/routing/IN A1-8 A9-16 A17-24 A25-32 AUX1-6",
    );
    // A slot the show never reaches is still written blank.
    expect(night.text.match(/^\/ch\/32\/config /m)?.[0]).toBe('/ch/32/config ');
  });

  it("names used channels, links stereo pairs, and 48V only on overheads", () => {
    const night = buildX32Scene({ template, allocation, band: null, sceneName: "Default" });
    // Names come from the rider's labels, packed by family: vox, kick, OH, keys.
    // The two bands' first lead vocal is one shared row, named for the anchor.
    expect(night.text).toContain('/ch/01/config "Sam" 50 CY 1');
    expect(night.text).toContain('/ch/02/config "Kick" 2 MG 2');
    expect(night.text).toContain('/ch/03/config "OH L" 10 MG 3');
    expect(night.text).toContain('/ch/04/config "OH R" 10 MG 4');
    expect(night.text).toContain('/ch/05/config "Nord L" 1 GN 5');
    expect(night.text).toContain('/ch/06/config "Nord R" 1 GN 6');
    // Phantom lives on the headamp, AES50 A.3/A.4 → headamp 034/035.
    expect(night.text).toContain("/headamp/034 +0.0 ON");
    expect(night.text).toContain("/headamp/035 +0.0 ON");
    // Kick (socket 2 → headamp 033) never gets 48V from a rider asking.
    expect(night.text).toContain("/headamp/033 +0.0 OFF");
    // Keys pair (5+6) and OH pair (3+4) are the linked pairs.
    const chlink = night.text.match(/^\/config\/chlink (.+)$/m)?.[1].split(" ");
    expect(chlink?.[1]).toBe("ON");
    expect(chlink?.[2]).toBe("ON");
    expect(chlink?.[0]).toBe("OFF");
  });

  it("scopes band scenes to mute changes and never touches gain", () => {
    const band1 = buildX32Scene({
      template,
      allocation,
      band: openers,
      sceneName: "Openers",
      previous: null,
    });
    expect(band1.text).not.toContain("/preamp");
    expect(band1.text).not.toContain("/config/routing");
    expect(band1.text).toContain("/ch/01/mix ON +0.0 ON +0 ON +0.0");

    // Middle band keeps the shared keys pair but adds Kick + OH; the headliner
    // swaps the lead vocal (Sam → Lee), so only those channels recall.
    const band2 = buildX32Scene({
      template,
      allocation,
      band: headliners,
      sceneName: "Headliners",
      previous: openers,
    });
    expect(band2.text).toContain("/ch/02/mix ON +0.0 ON +0 ON +0.0");
    expect(band2.text).toContain("/ch/03/mix ON +0.0 ON -100 ON +0.0");
    expect(band2.text).toContain("/ch/04/mix ON +0.0 ON +100 ON +0.0");
    // The shared lead and the keys pair (5+6) are identical to the previous
    // band — never re-emitted.
    expect(band2.text).not.toContain("/ch/01/mix");
    expect(band2.text).not.toContain("/ch/05/mix");
    expect(band2.text).not.toContain("/ch/06/mix");
  });
});

describe("X Air / XR18 scene", () => {
  const template = loadDefaultTemplate();
  const allocation = allocateEventPatch([openers, headliners]);

  it("patches local inputs, carries no header, and writes a full node set", () => {
    const night = buildXAirScene({ template, allocation, band: null, sceneName: "Default" });
    expect(night.text.startsWith("/config/chlink ")).toBe(true);
    expect(night.text).not.toContain("#4.0#");
    expect(night.text).toContain('/ch/01/config "Sam" 6 In01 U01');
    expect(night.text).toContain('/ch/02/config "Kick" 5 In02 U02');
    expect(night.text).toContain('/ch/03/config "OH L" 5 In03 U03');
    expect(night.text).toContain('/ch/04/config "OH R" 5 In04 U04');
    expect(night.text).toContain('/ch/05/config "Nord L" 2 In05 U05');
    expect(night.text).toContain('/ch/06/config "Nord R" 2 In06 U06');
    expect(night.text).toContain("/headamp/03 +0.0 ON");
    expect(night.text).toContain("/headamp/04 +0.0 ON");
    // The whole node set, or X AIR Edit will not load it.
    expect(night.text).toContain("/bus/6/config");
    expect(night.text).toContain("/lr/config");
    expect(night.text).toContain("/fx/4 DIMC OFF");
    expect(night.text).toContain("/dca/4/config");
    expect(night.text).toContain("/routing/main/01 LR");
    // A stereo right half is written once, as the R source — never again blank.
    expect(night.text.match(/^\/ch\/04\/config /gm)).toHaveLength(1);
    expect(night.text.match(/^\/ch\/06\/config /gm)).toHaveLength(1);
  });
});

describe("buildShowPackage targets", () => {
  it("packs X32 scenes with an x32 archive name", () => {
    const result = buildShowPackage({
      eventName: "Day N Mayfield",
      bands: [openers, headliners],
      target: "x32",
    });
    expect(result.fileName).toBe("Day N Mayfield-x32.zip");
    const files = unzipSync(result.zipBytes);
    expect(Object.keys(files)).toEqual([
      "Default.scn",
      "Openers.scn",
      "Headliners.scn",
    ]);
    expect(strFromU8(files["Default.scn"]!).startsWith("#4.0#")).toBe(true);
  });

  it("reports how the show lands on the chosen desk, with no archive", () => {
    const x32 = buildShowPackage({
      eventName: "E",
      bands: [openers, headliners],
      target: "x32",
      archive: false,
    });
    expect(x32.zipBytes.byteLength).toBe(0);
    const keys = x32.preview.find((row) => row.name === "Nord");
    expect(keys?.span).toBe("5+6");
    expect(keys?.patch).toBe("A5");
    expect(keys?.stereo).toBe(true);
    expect(x32.preview.find((row) => row.name === "OH")?.patch).toBe("A3");

    const xair = buildShowPackage({ eventName: "E", bands: [openers, headliners], target: "xair" });
    expect(xair.preview.find((row) => row.name === "OH")?.patch).toBe("In03");

    const wing = buildShowPackage({ eventName: "E", bands: [openers, headliners], target: "wing" });
    expect(wing.preview.find((row) => row.name === "Nord")?.patch).toBe("A.5");
  });

  it("names the Snake B inputs once when the X Air drops the second snake", () => {
    // Enough inputs on the headliner to force the allocator onto Snake B.
    const big = band(
      "Big Band",
      "headliner",
      Array.from({ length: 18 }, (_, i) =>
        input({ id: `b${i}`, channel: i + 1, source: `In ${i + 1}`, sourceKey: "gtr", inputType: "di" }),
      ),
    );
    const result = buildShowPackage({
      eventName: "E",
      bands: [openers, big],
      target: "xair",
      plan: { secondSnake: true, sides: {} },
    });
    const snakeWarnings = result.warnings.filter((w) =>
      w.includes("second snake"),
    );
    expect(snakeWarnings).toHaveLength(1);
    expect(snakeWarnings[0]).toContain("(");
  });

  it("packs X Air scenes with an xr18 archive name", () => {
    const result = buildShowPackage({
      eventName: "Day N Mayfield",
      bands: [openers, headliners],
      target: "xair",
    });
    expect(result.fileName).toBe("Day N Mayfield-xr18.zip");
    const files = unzipSync(result.zipBytes);
    expect(strFromU8(files["Default.scn"]!).startsWith("/config/chlink")).toBe(true);
  });

  it("packs a Mixing Station .msz per X Air scene, named, coloured and muted like the .scn", () => {
    const result = buildShowPackage({
      eventName: "Day N Mayfield",
      bands: [openers, headliners],
      target: "xair-ms",
    });
    expect(result.fileName).toBe("Day N Mayfield-xr18-mixing-station.zip");
    const files = unzipSync(result.zipBytes);
    expect(Object.keys(files)).toEqual(["Default.msz", "Openers.msz", "Headliners.msz"]);
    // Same desk, same report as the .scn download.
    const scn = buildShowPackage({ eventName: "E", bands: [openers, headliners], target: "xair" });
    expect(result.preview).toEqual(scn.preview);
    expect(result.warnings).toEqual(scn.warnings);

    const night = readMsz(files["Default.msz"]!);
    expect(night.scene.meta).toMatchObject({ name: "Default", type: "scene" });
    expect(night.scene.consoleMeta).toMatchObject({ model: "XR18" });
    expect(night.ch(1).name.generic).toMatchObject({ name: "Sam", color: 6 });
    expect(night.ch(3).name.generic.name).toBe("OH L");
    expect(night.ch(4).name.generic.name).toBe("OH R");
    expect(night.ch(3).link.generic.linked).toBe(true);
    expect(night.ch(3).headamp["+48v"]).toBe(true);
    expect(night.ch(2).headamp["+48v"]).toBe(false);
    expect(night.ch(4).main.generic["mix.pan"]).toBe(100);
    // The night baseline is all muted, faders down; In n feeds channel n.
    expect(night.ch(1).main.generic["mix.rawOn"]).toBe(false);
    expect(night.ch(1).main.generic["mix.lvl"]).toBe(-90);
    expect(night.ch(5).routing.mixer["cfg.in.0.sink.0.src"]).toBe(5);
    // An unused slot is written blank, not left with the template's name.
    expect(night.ch(16).name.generic).toMatchObject({ name: "", color: 0 });

    const headliners_ = readMsz(files["Headliners.msz"]!);
    expect(headliners_.scene.meta.name).toBe("Headliners");
    expect(headliners_.ch(2).main.generic).toMatchObject({ "mix.rawOn": true, "mix.lvl": 0 });
    // Only the night baseline carries gain/48V; a band recall leaves them be.
    expect(headliners_.ch(3).headamp).toBeUndefined();
  });

  it("routes the X32 .msz inputs from AES50 A, both snakes", () => {
    const result = buildShowPackage({
      eventName: "E",
      bands: [openers, headliners],
      target: "x32-ms",
    });
    const files = unzipSync(result.zipBytes);
    expect(Object.keys(files)).toEqual(["Default.msz", "Openers.msz", "Headliners.msz"]);
    const night = readMsz(files["Default.msz"]!);
    expect(night.scene.consoleMeta).toMatchObject({ model: "X32/M32" });
    const blocks = night.scene.console.inputRouting.mixer;
    expect([0, 1, 2, 3].map((b) => blocks[`routing.inBlocks.${b}`])).toEqual([4, 5, 6, 7]);
    expect(night.ch(2).name.generic).toMatchObject({ name: "Kick", color: 5 });
    expect(night.ch(32).routing.mixer["cfg.in.0.sink.0.src"]).toBe(32);
  });
});
