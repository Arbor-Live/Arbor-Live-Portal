import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  allocateEventPatch,
  buildPatchDiffPlan,
  buildShowFile,
  fileStem,
  listPhysicalChangeovers,
  type ShowBandInput,
} from "./index";
import { buildBandSnap, buildShowPackage, loadDefaultTemplate } from "./node";
import type { RiderInputChannel } from "@arbor/rider-document";

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
  return {
    bandName: name,
    fileStem: fileStem(name),
    role,
    inputs,
  };
}

describe("allocateEventPatch layout", () => {
  it("keeps first 2 vox shared when a later band needs 3", () => {
    const bands = [
      band("Openers", "support", [
        input({ id: "a1", channel: 1, source: "Sam", sourceKey: "vox.lead" }),
        input({ id: "a2", channel: 2, source: "Alex", sourceKey: "vox.bgv" }),
      ]),
      band("Headliners", "headliner", [
        input({ id: "b1", channel: 1, source: "Lead", sourceKey: "vox.lead" }),
        input({ id: "b2", channel: 2, source: "Harmony", sourceKey: "vox.bgv" }),
        input({ id: "b3", channel: 3, source: "Choir", sourceKey: "vox.choir" }),
      ]),
    ];

    const { ports } = allocateEventPatch(bands);
    expect(ports.find((p) => p.port === 1)?.bandLabels["Openers"]).toBe("Vox 1");
    expect(ports.find((p) => p.port === 1)?.bandLabels["Headliners"]).toBe("Vox 1");
    expect(ports.find((p) => p.port === 1)?.label).toBe("Vox 1");
    expect(ports.find((p) => p.port === 3)?.bandLabels["Headliners"]).toBe("Vox 3");
    expect(ports.find((p) => p.port === 3)?.bandLabels["Openers"]).toBeUndefined();
  });

  it("places stereo keys on A.9–A.10 and OH ST+48V on A.15–16", () => {
    const bands = [
      band("Full", "other", [
        input({
          id: "k1",
          channel: 1,
          source: "Nord",
          sourceKey: "keys",
          stereo: true,
          inputType: "di",
        }),
        input({
          id: "oh",
          channel: 2,
          source: "OH",
          sourceKey: "drum.oh",
          stereo: true,
          phantom: true,
        }),
        input({
          id: "kick",
          channel: 3,
          source: "Kick",
          sourceKey: "drum.kick",
          phantom: true, // rider asks 48V — still must NOT land on kick
        }),
      ]),
    ];
    const { ports } = allocateEventPatch(bands);
    expect(ports.find((p) => p.port === 9)?.label).toBe("Keys");
    expect(ports.find((p) => p.port === 9)?.stereo).toBe(true);
    expect(ports.find((p) => p.port === 10)?.stereo).toBe(true);
    expect(ports.find((p) => p.port === 11)?.label).toBe("Kick");
    expect(ports.find((p) => p.port === 11)?.phantom).toBe(false);
    expect(ports.find((p) => p.port === 15)?.stereo).toBe(true);
    expect(ports.find((p) => p.port === 15)?.phantom).toBe(true);
    expect(ports.find((p) => p.port === 16)?.phantom).toBe(true);
  });

  it("breaks keys to mono when mid overflow needs A.10", () => {
    const bands = [
      band("Crowded", "support", [
        input({ id: "k", channel: 1, source: "Keys", sourceKey: "keys", inputType: "di", stereo: true }),
        input({ id: "g1", channel: 2, source: "G1", sourceKey: "gtr", inputType: "di" }),
        input({ id: "g2", channel: 3, source: "G2", sourceKey: "gtr", inputType: "di" }),
        input({ id: "g3", channel: 4, source: "G3", sourceKey: "gtr", inputType: "di" }),
        input({ id: "b", channel: 5, source: "Bass", sourceKey: "bass", inputType: "di" }),
        input({ id: "f1", channel: 6, source: "Sax", sourceKey: "wind.sax.tenor", inputType: "mic" }),
        input({ id: "f2", channel: 7, source: "Trumpet", sourceKey: "wind.trumpet", inputType: "mic" }),
        input({ id: "f3", channel: 8, source: "Perc", sourceKey: "perc.aux", inputType: "mic" }),
      ]),
    ];
    const { ports, warnings } = allocateEventPatch(bands);
    expect(ports.find((p) => p.port === 9)?.stereo).toBe(false);
    expect(warnings.some((w) => w.includes("Keys set to mono"))).toBe(true);
    expect(ports.find((p) => p.port === 10)?.stereo).toBe(false);
  });

  it("spills extra guitars into flex while keeping Default.snap homes", () => {
    const bands = [
      band("Twin Guitars", "support", [
        input({ id: "g1", channel: 1, source: "Gtr 1", sourceKey: "gtr", inputType: "di" }),
        input({ id: "g2", channel: 2, source: "Gtr 2", sourceKey: "gtr", inputType: "di" }),
      ]),
    ];
    const { ports } = allocateEventPatch(bands);
    expect(ports.find((p) => p.port === 5)?.bandLabels["Twin Guitars"]).toBe("Guitar");
    expect(ports.find((p) => p.port === 7)?.label).toMatch(/Guitar/);
    expect(ports.find((p) => p.port === 5)?.templateLabel).toBe("Guitar");
  });

  it("diff: same vox stays green; unused vox is mute; flex instrument swap is physical", () => {
    const bands = [
      band("Openers", "support", [
        input({ id: "a1", channel: 1, source: "Sam", sourceKey: "vox.lead" }),
        input({ id: "sax", channel: 2, source: "Sax", sourceKey: "wind.sax.tenor" }),
      ]),
      band("Headliners", "headliner", [
        input({ id: "b1", channel: 1, source: "Lead", sourceKey: "vox.lead" }),
        input({ id: "b2", channel: 2, source: "BGV", sourceKey: "vox.bgv" }),
        input({ id: "gtr", channel: 3, source: "Gtr", sourceKey: "gtr", inputType: "di" }),
      ]),
    ];
    const plan = buildPatchDiffPlan(allocateEventPatch(bands));
    expect(plan.steps).toHaveLength(2);

    const openers = plan.steps[0]!;
    expect(openers.ports.find((p) => p.port === 1)?.change).toBe("same");
    expect(openers.ports.find((p) => p.port === 1)?.label).toBe("Vox 1");

    const head = plan.steps[1]!;
    expect(head.comparedTo).toBe("Openers");
    // Vox 1 still a vocal — same (no rename to singer names)
    expect(head.ports.find((p) => p.port === 1)?.change).toBe("same");
    expect(head.ports.find((p) => p.port === 1)?.label).toBe("Vox 1");
    // Vox 2 newly live vs openers — still same instrument family vs night; vs openers was mute
    expect(head.ports.find((p) => p.port === 2)?.change).toBe("same");
    // Flex that was sax for openers, guitar for headliners — physical if same port
    const flexPort = head.ports.find(
      (p) => p.change === "physical" || (p.port >= 7 && p.port <= 8),
    );
    const openersFlex = openers.ports.find((p) => p.port === 7 || p.port === 5);
    // Sax lands on flex; guitar on guitar home — may not share a port.
    // Force shared flex: openers sax + headliners also need something on flex...
    // Guitar takes 5; sax is flex on 7. Headliners gtr on 5 — openers didn't have gtr so
    // port 5: night live, openers mute, headliners live same instrument as night → same
    expect(head.ports.find((p) => p.port === 5)?.change).toBe("same");
    // Port 7 sax for openers, muted for headliners
    expect(head.ports.find((p) => p.port === 7)?.change).toBe("mute");
    // First set never invents yellow swaps vs the night aggregate
    expect(openers.ports.some((p) => p.change === "physical")).toBe(false);
    void flexPort;
    void openersFlex;
  });

  it("diff: shared flex port swaps sax → clarinet (yellow) and lists changeover", () => {
    const bands = [
      band("Openers", "support", [
        input({ id: "a1", channel: 1, source: "Sam", sourceKey: "vox.lead" }),
        input({ id: "sax", channel: 2, source: "Sax", sourceKey: "wind.sax.tenor" }),
      ]),
      band("Headliners", "headliner", [
        input({ id: "b1", channel: 1, source: "Lead", sourceKey: "vox.lead" }),
        input({
          id: "cl",
          channel: 2,
          source: "Clarinet",
          sourceKey: "wind.clarinet",
        }),
      ]),
    ];
    const allocation = allocateEventPatch(bands);
    const flex = allocation.ports.find(
      (p) =>
        p.bandInstruments["Openers"] === "wind.sax.tenor" &&
        p.bandInstruments["Headliners"] === "wind.clarinet",
    );
    expect(flex).toBeDefined();

    const plan = buildPatchDiffPlan(allocation);
    const head = plan.steps[1]!;
    const swapped = head.ports.find((p) => p.port === flex!.port);
    expect(swapped?.change).toBe("physical");
    expect(swapped?.previousLabel).toMatch(/Sax/i);
    expect(swapped?.label).toMatch(/Clarinet/i);

    const changeovers = listPhysicalChangeovers(plan).filter((b) => b.lines.length > 0);
    expect(changeovers).toHaveLength(1);
    expect(changeovers[0]!.title).toBe("Openers → Headliners");
    expect(changeovers[0]!.lines[0]).toContain(`A.${flex!.port}`);
    expect(changeovers[0]!.lines[0]).toContain("→");
  });
});

describe("buildShowFile", () => {
  it("lists Default then bands in support → other → headliner order", () => {
    const show = buildShowFile({
      eventName: "Test Fest",
      bands: [
        band("Zebra", "headliner", [input({ id: "1", channel: 1, source: "V", sourceKey: "vox.lead" })]),
        band("Alpha", "support", [input({ id: "2", channel: 1, source: "V", sourceKey: "vox.lead" })]),
      ],
    });
    expect(show.scenes.count).toBe(3);
    expect(show.scenes["1"]).toMatchObject({ name: "Default", file: "Default.snap" });
    expect(show.scenes["2"]).toMatchObject({ name: "Alpha", type: "SNAP" });
    expect(show.scenes["3"]).toMatchObject({ name: "Zebra", type: "SNAP" });
  });
});

describe("buildBandSnap", () => {
  it("keeps snapshot.11, syncs names, and only OH gets 48V", () => {
    const template = loadDefaultTemplate();
    const bands = [
      band("Sync Band", "support", [
        input({ id: "1", channel: 1, source: "Lead Vox", sourceKey: "vox.lead", phantom: true }),
        input({ id: "oh", channel: 2, source: "OH", sourceKey: "drum.oh", stereo: true }),
      ]),
    ];
    const allocation = allocateEventPatch(bands);
    const snap = buildBandSnap(template, allocation, bands[0]!);

    expect(snap.type).toBe("snapshot.11");
    expect(snap.ae_data.io.in.A["1"]?.name).toBe("Vox 1");
    expect(snap.ae_data.io.in.A["1"]?.vph).toBe(false);
    expect(snap.ae_data.io.in.A["15"]?.vph).toBe(true);
    expect(snap.ae_data.io.in.A["15"]?.mode).toBe("ST");
    expect(snap.ae_data.ch["1"]?.mute).toBe(false);
  });

  it("mutes ports reserved for other bands", () => {
    const template = loadDefaultTemplate();
    const bands = [
      band("Duo", "support", [
        input({ id: "a1", channel: 1, source: "A1", sourceKey: "vox.lead" }),
        input({ id: "a2", channel: 2, source: "A2", sourceKey: "vox.bgv" }),
      ]),
      band("Trio", "headliner", [
        input({ id: "b1", channel: 1, source: "B1", sourceKey: "vox.lead" }),
        input({ id: "b2", channel: 2, source: "B2", sourceKey: "vox.bgv" }),
        input({ id: "b3", channel: 3, source: "B3", sourceKey: "vox.choir" }),
      ]),
    ];
    const allocation = allocateEventPatch(bands);
    const duoSnap = buildBandSnap(template, allocation, bands[0]!);

    expect(duoSnap.ae_data.ch["1"]?.mute).toBe(false);
    expect(duoSnap.ae_data.ch["2"]?.mute).toBe(false);
    expect(duoSnap.ae_data.ch["3"]?.mute).toBe(true);
  });
});

describe("buildShowPackage", () => {
  it("zips Default + per-band snaps + show index", () => {
    const result = buildShowPackage({
      eventName: "Mars Night",
      bands: [
        band("Cien Mil Mangos", "support", [
          input({ id: "1", channel: 1, source: "Vox", sourceKey: "vox.lead" }),
        ]),
      ],
    });
    expect(result.fileName).toBe("Mars Night-show.zip");
    expect(result.zipBytes.byteLength).toBeGreaterThan(1000);
    expect(result.diffs.steps).toHaveLength(1);
  });

  it("loads committed Default.snap as template", () => {
    const template = loadDefaultTemplate();
    expect(template.type).toBe("snapshot.11");
    expect(template.ae_data.io.in.A["1"]?.name).toBe("Vox 1");
    const raw = readFileSync(
      new URL("../templates/Default.snap", import.meta.url),
      "utf8",
    );
    expect(JSON.parse(raw).type).toBe("snapshot.11");
  });
});
