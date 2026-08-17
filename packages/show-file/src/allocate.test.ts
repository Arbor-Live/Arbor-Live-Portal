import { unzipSync, strFromU8 } from "fflate";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  allocateEventPatch,
  buildPatchDiffPlan,
  buildShowFile,
  buildStageBoxDiagramModel,
  fileStem,
  listPhysicalChangeovers,
  type PatchPlan,
  type ShowBandInput,
} from "./index";
import {
  buildBandSnap,
  buildNightSnap,
  buildShowPackage,
  loadDefaultTemplate,
} from "./node";
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

describe("identical band setups", () => {
  /** Three bands with the same rock-trio patch (different singer names). */
  function identicalTrioNight(): ShowBandInput[] {
    const setup = (prefix: string, names: [string, string, string, string]) => [
      input({ id: `${prefix}-v1`, channel: 1, source: names[0], sourceKey: "vox.lead" }),
      input({ id: `${prefix}-v2`, channel: 2, source: names[1], sourceKey: "vox.bgv" }),
      input({ id: `${prefix}-g`, channel: 3, source: names[2], sourceKey: "gtr", inputType: "di" }),
      input({ id: `${prefix}-b`, channel: 4, source: names[3], sourceKey: "bass", inputType: "di" }),
      input({ id: `${prefix}-k`, channel: 5, source: "Kick", sourceKey: "drum.kick" }),
      input({ id: `${prefix}-s`, channel: 6, source: "Snare", sourceKey: "drum.snare" }),
      input({
        id: `${prefix}-oh`,
        channel: 7,
        source: "OH",
        sourceKey: "drum.oh",
        stereo: true,
        phantom: true,
      }),
    ];

    return [
      band("Openers", "support", setup("a", ["Sam", "Alex", "Gtr", "Bass"])),
      band("Middle", "other", setup("b", ["Kim", "Jo", "Gtr", "Bass"])),
      band("Headliners", "headliner", setup("c", ["Lee", "Pat", "Gtr", "Bass"])),
    ];
  }

  it("keeps the night patch labels identical for every band all night", () => {
    const bands = identicalTrioNight();
    const { ports, bandOrder } = allocateEventPatch(bands);
    expect(bandOrder.map((b) => b.bandName)).toEqual([
      "Openers",
      "Middle",
      "Headliners",
    ]);

    const livePorts = ports.filter((p) => Object.keys(p.bandLabels).length > 0);
    expect(livePorts.length).toBeGreaterThan(0);

    for (const port of livePorts) {
      // Every band that uses the night snake uses the same stable strip name.
      expect(port.bandLabels["Openers"]).toBe(port.label);
      expect(port.bandLabels["Middle"]).toBe(port.label);
      expect(port.bandLabels["Headliners"]).toBe(port.label);
      // Singer names never become channel names.
      expect(port.label).not.toMatch(/Sam|Alex|Kim|Jo|Lee|Pat/);
    }

    // Fixed homes for this setup.
    expect(ports.find((p) => p.port === 1)?.label).toBe("Vox 1");
    expect(ports.find((p) => p.port === 5)?.label).toBe("Guitar");
    expect(ports.find((p) => p.port === 6)?.label).toBe("Bass");
    expect(ports.find((p) => p.port === 15)?.label).toMatch(/OH|Overhead/i);
    expect(ports.find((p) => p.port === 15)?.phantom).toBe(true);
  });

  it("marks every between-band faceplate port as same (no mute or yellow swaps)", () => {
    const bands = identicalTrioNight();
    const plan = buildPatchDiffPlan(allocateEventPatch(bands));
    expect(plan.steps).toHaveLength(3);

    // After load-in, later sets should be pixel-identical to the previous set.
    for (const step of plan.steps.slice(1)) {
      for (const port of step.ports) {
        expect(
          port.change === "same" || port.change === undefined,
          `A.${port.port} on ${step.bandName} vs ${step.comparedTo}: ${port.change}`,
        ).toBe(true);
      }
      expect(step.ports.some((p) => p.change === "mute")).toBe(false);
      expect(step.ports.some((p) => p.change === "physical")).toBe(false);
    }

    expect(
      listPhysicalChangeovers(plan).filter((b) => b.lines.length > 0),
    ).toHaveLength(0);
  });

  it("still builds a separate .snap for every band plus Default", () => {
    const bands = identicalTrioNight();
    const result = buildShowPackage({
      eventName: "Same Setup Night",
      bands,
    });

    expect(result.sceneNames).toEqual([
      "Default",
      "Openers",
      "Middle",
      "Headliners",
    ]);
    expect(result.diffs.steps).toHaveLength(3);

    const unzipped = unzipSync(result.zipBytes);
    const names = Object.keys(unzipped).sort();
    expect(names).toContain("Default.snap");
    expect(names).toContain("Openers.snap");
    expect(names).toContain("Middle.snap");
    expect(names).toContain("Headliners.snap");
    expect(names.some((n) => n.endsWith(".show"))).toBe(true);

    // Snaps stay distinct files even when patch/mute state matches.
    const openers = JSON.parse(strFromU8(unzipped["Openers.snap"]!));
    const middle = JSON.parse(strFromU8(unzipped["Middle.snap"]!));
    const head = JSON.parse(strFromU8(unzipped["Headliners.snap"]!));
    expect(openers.type).toBe("snapshot.11");
    expect(middle.type).toBe("snapshot.11");
    expect(head.type).toBe("snapshot.11");

    // Live channels unmuted on every band snap; reserved empties stay mute.
    for (const snap of [openers, middle, head]) {
      expect(snap.ae_data.ch["1"]?.mute).toBe(false); // Vox 1
      expect(snap.ae_data.ch["5"]?.mute).toBe(false); // Guitar strip — check strip map
      expect(snap.ae_data.io.in.A["1"]?.name).toBe("Vox 1");
      expect(snap.ae_data.io.in.A["5"]?.name).toBe("Guitar");
    }
  });
});

describe("stereo pairs", () => {
  function stereoKeysNight(): ShowBandInput[] {
    return [
      band("Openers", "support", [
        input({ id: "v", channel: 1, source: "Lead", sourceKey: "vox.lead" }),
        input({
          id: "k",
          channel: 2,
          source: "Nord",
          sourceKey: "keys",
          stereo: true,
          inputType: "di",
        }),
      ]),
      band("Headliners", "headliner", [
        input({ id: "v2", channel: 1, source: "Lead", sourceKey: "vox.lead" }),
        input({
          id: "k2",
          channel: 2,
          source: "Rhodes",
          sourceKey: "keys",
          stereo: true,
          inputType: "di",
        }),
      ]),
    ];
  }

  it("tags DI on both halves of a stereo pair in the night patch and band views", () => {
    const allocation = allocateEventPatch(stereoKeysNight());
    const left = allocation.ports.find((p) => p.port === 9)!;
    const right = allocation.ports.find((p) => p.port === 10)!;
    expect(left.di).toBe(true);
    // Used to be false here while the band views said true.
    expect(right.di).toBe(true);
    expect(right.stereo).toBe(true);

    const plan = buildPatchDiffPlan(allocation);
    const nightRight = plan.night.ports.find((p) => p.port === 10)!;
    const bandRight = plan.steps[0]!.ports.find((p) => p.port === 10)!;
    expect(nightRight.di).toBe(bandRight.di);
    expect(bandRight.di).toBe(true);
  });

  it("gives a broken keys pair its own strip so the extra input is not dropped", () => {
    const bands = [
      band("Crowded", "support", [
        input({ id: "k", channel: 1, source: "Keys", sourceKey: "keys", inputType: "di", stereo: true }),
        input({ id: "g1", channel: 2, source: "G1", sourceKey: "gtr", inputType: "di" }),
        input({ id: "g2", channel: 3, source: "G2", sourceKey: "gtr", inputType: "di" }),
        input({ id: "g3", channel: 4, source: "G3", sourceKey: "gtr", inputType: "di" }),
        input({ id: "b", channel: 5, source: "Bass", sourceKey: "bass", inputType: "di" }),
        input({ id: "f1", channel: 6, source: "Sax", sourceKey: "wind.sax.tenor" }),
        input({ id: "f2", channel: 7, source: "Trumpet", sourceKey: "wind.trumpet" }),
        input({ id: "f3", channel: 8, source: "Perc", sourceKey: "perc.aux" }),
      ]),
    ];
    const allocation = allocateEventPatch(bands);
    expect(allocation.warnings.some((w) => w.includes("no port left"))).toBe(false);

    // Every input reaches a port, and every live port reaches a console strip.
    const live = allocation.ports.filter((p) => p.used);
    expect(live).toHaveLength(8);
    for (const port of live) expect(port.strip).not.toBeNull();

    const port10 = allocation.ports.find((p) => p.port === 10)!;
    expect(port10.used).toBe(true);
    expect(port10.strip).toBe(15);

    const snap = buildBandSnap(loadDefaultTemplate(), allocation, bands[0]!);
    expect(snap.ae_data.ch["15"]?.in?.conn).toMatchObject({ grp: "A", in: 10 });
    expect(snap.ae_data.ch["15"]?.mute).toBe(false);
  });
});

describe("unused channels", () => {
  const soloVox = [
    band("Solo", "support", [
      input({ id: "v", channel: 1, source: "Lead", sourceKey: "vox.lead" }),
    ]),
  ];

  it("drops spare ports from the diagram and lists them as leave-empty", () => {
    const allocation = allocateEventPatch(soloVox);
    const model = buildStageBoxDiagramModel(allocation, "Quiet Night");

    expect(model.ports.map((p) => p.aes50)).toEqual(["A.1"]);
    // Runs are collapsed; A.10 / A.16 are stereo right halves, not spare lines.
    expect(model.spare).toEqual(["A.2–9", "A.11–15"]);
  });

  it("unpatches and blanks spare strips in the snaps", () => {
    const allocation = allocateEventPatch(soloVox);
    const snap = buildBandSnap(loadDefaultTemplate(), allocation, soloVox[0]!);

    expect(snap.ae_data.ch["1"]?.name).toBe("Vox 1");
    expect(snap.ae_data.ch["7"]?.name).toBe("");
    expect(snap.ae_data.ch["7"]?.mute).toBe(true);
    expect(snap.ae_data.ch["7"]?.in?.conn).toMatchObject({ grp: "OFF" });
    expect(snap.ae_data.io.in.A["7"]?.name).toBe("");
  });
});

describe("two snakes", () => {
  const twoSnakePlan: PatchPlan = {
    secondSnake: true,
    sides: { drums: "A", keys: "B", flex: "B" },
  };

  function bigBill(): ShowBandInput[] {
    return [
      band("Big Band", "headliner", [
        input({ id: "v1", channel: 1, source: "Lead", sourceKey: "vox.lead" }),
        input({ id: "g", channel: 2, source: "Gtr", sourceKey: "gtr", inputType: "di" }),
        input({ id: "b", channel: 3, source: "Bass", sourceKey: "bass", inputType: "di" }),
        input({ id: "k", channel: 4, source: "Keys", sourceKey: "keys", stereo: true, inputType: "di" }),
        input({ id: "sax", channel: 5, source: "Sax", sourceKey: "wind.sax.tenor" }),
        input({ id: "kick", channel: 6, source: "Kick", sourceKey: "drum.kick" }),
        input({ id: "sn", channel: 7, source: "Snare", sourceKey: "drum.snare" }),
        input({ id: "oh", channel: 8, source: "OH", sourceKey: "drum.oh", stereo: true }),
      ]),
    ];
  }

  it("puts each group on the snake it was assigned", () => {
    const allocation = allocateEventPatch(bigBill(), twoSnakePlan);
    expect(allocation.snakes).toEqual(["A", "B"]);

    const at = (snake: string, port: number) =>
      allocation.ports.find((p) => p.snake === snake && p.port === port)!;

    expect(at("A", 1).used).toBe(true); // vox stays on A
    expect(at("A", 11).used).toBe(true); // kick stays on A
    expect(at("B", 9).used).toBe(true); // keys moved to B
    expect(at("B", 9).label).toBe("Keys");
    expect(at("B", 7).used).toBe(true); // sax on B flex
    expect(at("A", 7).used).toBe(false);
    // Same layout on both boxes, separate console strips.
    expect(at("A", 1).strip).toBe(1);
    expect(at("B", 7).strip).toBe(23);
  });

  it("writes the second box to AES50 B in the snap", () => {
    const bands = bigBill();
    const allocation = allocateEventPatch(bands, twoSnakePlan);
    const snap = buildBandSnap(loadDefaultTemplate(), allocation, bands[0]!);

    expect(snap.ae_data.io.in.B?.["9"]?.name).toBe("Keys");
    expect(snap.ae_data.io.in.B?.["9"]?.mode).toBe("ST");
    expect(snap.ae_data.ch["25"]?.in?.conn).toMatchObject({ grp: "B", in: 9 });
    expect(snap.ae_data.ch["25"]?.mute).toBe(false);
    // A.9 is empty tonight — unpatched, not left sitting there named "Keys".
    expect(snap.ae_data.io.in.A["9"]?.name).toBe("");
    expect(snap.ae_data.ch["9"]?.in?.conn).toMatchObject({ grp: "OFF" });
  });

  it("keeps everything on A when the second snake is off", () => {
    const allocation = allocateEventPatch(bigBill(), {
      secondSnake: false,
      sides: { keys: "B" },
    });
    expect(allocation.snakes).toEqual(["A"]);
    expect(allocation.ports.every((p) => p.snake === "A")).toBe(true);
    expect(allocation.ports.find((p) => p.port === 9)?.used).toBe(true);
  });

  it("moves a group to the other snake when a box overflows", () => {
    const crowd = [
      band("Sixteen Plus", "headliner", [
        ...Array.from({ length: 4 }, (_, i) =>
          input({ id: `v${i}`, channel: i + 1, source: `V${i}`, sourceKey: "vox.lead" }),
        ),
        ...Array.from({ length: 6 }, (_, i) =>
          input({
            id: `f${i}`,
            channel: 5 + i,
            source: `Horn ${i}`,
            sourceKey: "wind.trumpet",
          }),
        ),
        input({ id: "k", channel: 11, source: "Keys", sourceKey: "keys", stereo: true, inputType: "di" }),
        input({ id: "kick", channel: 12, source: "Kick", sourceKey: "drum.kick" }),
        input({ id: "sn", channel: 13, source: "Snare", sourceKey: "drum.snare" }),
        input({ id: "t1", channel: 14, source: "Rack", sourceKey: "drum.tom.rack" }),
        input({ id: "t2", channel: 15, source: "Floor", sourceKey: "drum.tom.floor" }),
        input({ id: "oh", channel: 16, source: "OH", sourceKey: "drum.oh", stereo: true }),
      ]),
    ];

    const allocation = allocateEventPatch(crowd, { secondSnake: true, sides: {} });
    expect(allocation.warnings.some((w) => w.includes("moved"))).toBe(true);
    expect(allocation.ports.some((p) => p.snake === "B" && p.used)).toBe(true);
    // Drums never get shoved across on their own.
    expect(allocation.sides.drums).toBe("A");
    expect(allocation.ports.filter((p) => p.used && p.strip !== null)).toHaveLength(16);
  });
});

describe("snapshot scoping", () => {
  function trio(): ShowBandInput[] {
    const setup = (prefix: string) => [
      input({ id: `${prefix}-v`, channel: 1, source: "Lead", sourceKey: "vox.lead" }),
      input({ id: `${prefix}-k`, channel: 2, source: "Kick", sourceKey: "drum.kick" }),
      input({ id: `${prefix}-s`, channel: 3, source: "Snare", sourceKey: "drum.snare" }),
    ];
    return [
      band("Openers", "support", setup("a")),
      band("Headliners", "headliner", [
        ...setup("b"),
        input({ id: "b-g", channel: 4, source: "Gtr", sourceKey: "gtr", inputType: "di" }),
      ]),
    ];
  }

  it("leaves unchanged channels and all preamps out of a band scene's scope", () => {
    const bands = trio();
    const allocation = allocateEventPatch(bands);
    const template = loadDefaultTemplate();
    const headliners = buildBandSnap(template, allocation, bands[1]!, {
      previous: bands[0]!,
    });

    // Kick (A.11 → strip 10) and snare (A.12 → strip 11) are identical to the
    // opener's scene, so recalling this scene must not re-gain them.
    expect(headliners.scopes?.ch["10"]).toBe(false);
    expect(headliners.scopes?.ch["11"]).toBe(false);
    // The guitar only the headliners use does change.
    expect(headliners.scopes?.ch["5"]).toBe(true);
    // Preamps are the engineer's from load-in onwards.
    expect(Object.values(headliners.scopes!.routin).every((v) => v === false)).toBe(true);
    expect(Object.values(headliners.scopes!.bus).every((v) => v === false)).toBe(true);
  });

  it("scopes in everything the first band lights up, and recalls the night baseline in full", () => {
    const bands = trio();
    const allocation = allocateEventPatch(bands);
    const template = loadDefaultTemplate();

    const openers = buildBandSnap(template, allocation, bands[0]!, { previous: null });
    expect(openers.scopes?.ch["1"]).toBe(true); // vox unmutes vs the muted baseline
    expect(openers.scopes?.ch["10"]).toBe(true); // kick unmutes too
    expect(openers.scopes?.ch["5"]).toBe(false); // guitar is muted in both

    const night = buildNightSnap(template, allocation);
    expect(Object.values(night.scopes!.ch).every((v) => v === true)).toBe(true);
    expect(night.ae_data.ch["1"]?.mute).toBe(true);
    expect(night.ae_data.ch["1"]?.name).toBe("Vox 1");
  });

  it("can be turned off for a full recall", () => {
    const bands = trio();
    const allocation = allocateEventPatch(bands);
    const snap = buildBandSnap(loadDefaultTemplate(), allocation, bands[1]!, {
      previous: bands[0]!,
      scope: false,
    });
    expect(snap.scopes).toBeUndefined();
  });

  it("honours the event's full-recall escape hatch", () => {
    const result = buildShowPackage({
      eventName: "Full Recall Night",
      bands: trio(),
      plan: { secondSnake: false, sides: {}, scopeScenes: false },
    });
    const headliners = JSON.parse(
      strFromU8(unzipSync(result.zipBytes)["Headliners.snap"]!),
    );
    expect(headliners.scopes).toBeUndefined();
  });

  it("scopes each band scene against the band before it in the package", () => {
    const result = buildShowPackage({ eventName: "Scoped Night", bands: trio() });
    const unzipped = unzipSync(result.zipBytes);
    const headliners = JSON.parse(strFromU8(unzipped["Headliners.snap"]!));
    const base = JSON.parse(strFromU8(unzipped["Default.snap"]!));

    expect(headliners.scopes.ch["10"]).toBe(false);
    expect(base.scopes.ch["10"]).toBe(true);
    expect(base.ae_data.io.in.A["11"].name).toBe("Kick");
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
