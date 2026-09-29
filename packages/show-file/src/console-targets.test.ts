import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import type { RiderInputChannel } from "@arbor/rider-document";
import { allocateEventPatch, fileStem, type ShowBandInput } from "./index";
import { buildShowPackage, loadDefaultTemplate } from "./node";
import { buildX32Scene } from "./x32";
import { buildXAirScene } from "./xair";

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
    expect(night.text).toContain('/ch/01/config "Sam" 50 CY 1');
    expect(night.text).toContain('/ch/02/config "Lee" 50 CY 2');
    expect(night.text).toContain('/ch/03/config "Kick" 2 MG 3');
    expect(night.text).toContain('/ch/05/config "OH L" 10 MG 5');
    expect(night.text).toContain('/ch/06/config "OH R" 10 MG 6');
    expect(night.text).toContain('/ch/07/config "Nord L" 1 GN 7');
    expect(night.text).toContain('/ch/08/config "Nord R" 1 GN 8');
    // Phantom lives on the headamp, AES50 A.5/A.6 → headamp 036/037.
    expect(night.text).toContain("/headamp/036 +0.0 ON");
    expect(night.text).toContain("/headamp/037 +0.0 ON");
    // Kick (socket 3 → headamp 034) never gets 48V from a rider asking.
    expect(night.text).toContain("/headamp/034 +0.0 OFF");
    // Keys pair (7+8) and OH pair (5+6) are the linked pairs.
    const chlink = night.text.match(/^\/config\/chlink (.+)$/m)?.[1].split(" ");
    expect(chlink?.[2]).toBe("ON");
    expect(chlink?.[3]).toBe("ON");
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
    expect(band2.text).toContain("/ch/03/mix ON +0.0 ON +0 ON +0.0");
    expect(band2.text).toContain("/ch/05/mix ON +0.0 ON -100 ON +0.0");
    expect(band2.text).toContain("/ch/06/mix ON +0.0 ON +100 ON +0.0");
    // The keys pair (7+8) is identical to the previous band — never re-emitted.
    expect(band2.text).not.toContain("/ch/07/mix");
    expect(band2.text).not.toContain("/ch/08/mix");
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
    expect(night.text).toContain('/ch/03/config "Kick" 5 In03 U03');
    expect(night.text).toContain('/ch/05/config "OH L" 5 In05 U05');
    expect(night.text).toContain('/ch/06/config "OH R" 5 In06 U06');
    expect(night.text).toContain('/ch/07/config "Nord L" 2 In07 U07');
    expect(night.text).toContain('/ch/08/config "Nord R" 2 In08 U08');
    expect(night.text).toContain("/headamp/05 +0.0 ON");
    expect(night.text).toContain("/headamp/06 +0.0 ON");
    // The whole node set, or X AIR Edit will not load it.
    expect(night.text).toContain("/bus/6/config");
    expect(night.text).toContain("/lr/config");
    expect(night.text).toContain("/fx/4 DIMC OFF");
    expect(night.text).toContain("/dca/4/config");
    expect(night.text).toContain("/routing/main/01 LR");
    // A stereo right half is written once, as the R source — never again blank.
    expect(night.text.match(/^\/ch\/06\/config /gm)).toHaveLength(1);
    expect(night.text.match(/^\/ch\/08\/config /gm)).toHaveLength(1);
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
    expect(keys?.span).toBe("7+8");
    expect(keys?.patch).toBe("A7");
    expect(keys?.stereo).toBe(true);
    expect(x32.preview.find((row) => row.name === "OH")?.patch).toBe("A5");

    const xair = buildShowPackage({ eventName: "E", bands: [openers, headliners], target: "xair" });
    expect(xair.preview.find((row) => row.name === "OH")?.patch).toBe("In05");

    const wing = buildShowPackage({ eventName: "E", bands: [openers, headliners], target: "wing" });
    expect(wing.preview.find((row) => row.name === "Nord")?.patch).toBe("A.7");
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
});
