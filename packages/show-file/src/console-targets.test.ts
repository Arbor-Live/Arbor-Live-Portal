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
    expect(night.text).toContain('/ch/01/config "Vox 1" 50 CY 1');
    expect(night.text).toContain('/ch/09/config "Keys L" 1 GN 9');
    expect(night.text).toContain('/ch/10/config "Keys R" 1 GN 10');
    expect(night.text).toContain('/ch/15/config "OH 48V L" 10 MG 15');
    // Phantom lives on the headamp, AES50 A.15 → headamp 046.
    expect(night.text).toContain("/headamp/046 +0.0 ON");
    expect(night.text).toContain("/headamp/047 +0.0 ON");
    // Kick (socket 11 → headamp 042) never gets 48V from a rider asking.
    expect(night.text).toContain("/headamp/042 +0.0 OFF");
    // Keys pair (9+10) and OH pair (15+16) are the linked pairs.
    const chlink = night.text.match(/^\/config\/chlink (.+)$/m)?.[1].split(" ");
    expect(chlink?.[4]).toBe("ON");
    expect(chlink?.[7]).toBe("ON");
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

    // Middle band adds OH and Kick on top of the same vox/keys.
    const band2 = buildX32Scene({
      template,
      allocation,
      band: headliners,
      sceneName: "Headliners",
      previous: openers,
    });
    expect(band2.text).toContain("/ch/15/mix ON +0.0 ON -100 ON +0.0");
    expect(band2.text).toContain("/ch/16/mix ON +0.0 ON +100 ON +0.0");
    expect(band2.text).not.toContain("/ch/01/mix");
  });
});

describe("X Air / XR18 scene", () => {
  const template = loadDefaultTemplate();
  const allocation = allocateEventPatch([openers, headliners]);

  it("patches local inputs, carries no header, and writes a full node set", () => {
    const night = buildXAirScene({ template, allocation, band: null, sceneName: "Default" });
    expect(night.text.startsWith("/config/chlink ")).toBe(true);
    expect(night.text).not.toContain("#4.0#");
    expect(night.text).toContain('/ch/01/config "Vox 1" 6 In01 U01');
    expect(night.text).toContain('/ch/15/config "OH 48V L" 5 In15 U15');
    expect(night.text).toContain('/ch/16/config "OH 48V R" 5 In16 U16');
    expect(night.text).toContain("/headamp/15 +0.0 ON");
    expect(night.text).toContain("/headamp/16 +0.0 ON");
    // The whole node set, or X AIR Edit will not load it.
    expect(night.text).toContain("/bus/6/config");
    expect(night.text).toContain("/lr/config");
    expect(night.text).toContain("/fx/4 DIMC OFF");
    expect(night.text).toContain("/dca/4/config");
    expect(night.text).toContain("/routing/main/01 LR");
    // A stereo right half is written once, as the R source — never again blank.
    expect(night.text.match(/^\/ch\/10\/config /gm)).toHaveLength(1);
    expect(night.text.match(/^\/ch\/16\/config /gm)).toHaveLength(1);
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
    const keys = x32.preview.find((row) => row.name === "Keys");
    expect(keys?.span).toBe("9+10");
    expect(keys?.patch).toBe("A9");
    expect(keys?.stereo).toBe(true);
    expect(x32.preview.find((row) => row.name === "OH 48V")?.patch).toBe("A15");

    const xair = buildShowPackage({ eventName: "E", bands: [openers, headliners], target: "xair" });
    expect(xair.preview.find((row) => row.name === "OH 48V")?.patch).toBe("In15");

    const wing = buildShowPackage({ eventName: "E", bands: [openers, headliners], target: "wing" });
    expect(wing.preview.find((row) => row.name === "Keys")?.patch).toBe("A.9");
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
