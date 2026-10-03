import { unzipSync, strFromU8 } from "fflate";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  allocateEventPatch,
  buildPatchDiffPlan,
  buildShowFile,
  buildStageBoxDiagramModel,
  aes50Label,
  aes50PortFor,
  fileStem,
  listPhysicalChangeovers,
  type PatchPlan,
  type PortAssignment,
  type ShowBandInput,
  type SlotFamily,
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

const usedPorts = (ports: PortAssignment[], family: SlotFamily) =>
  ports.filter((p) => p.family === family && p.used);

/** The first live port of a family (stereo left half when paired). */
const usedPort = (ports: PortAssignment[], family: SlotFamily) =>
  usedPorts(ports, family)[0]!;

/** Console strip of a family's first live port. */
const stripOf = (ports: PortAssignment[], family: SlotFamily) =>
  usedPort(ports, family).strip!;

/** Live port of a family on a specific snake. */
const usedOn = (ports: PortAssignment[], snake: string, family: SlotFamily) =>
  ports.find((p) => p.snake === snake && p.family === family && p.used)!;

describe("allocateEventPatch layout", () => {
  it("keeps rows shared across bands, appending a later band's extra row", () => {
    const bands = [
      band("Openers", "support", [
        input({ id: "a1", channel: 1, source: "Lead", sourceKey: "vox.lead" }),
        input({ id: "a2", channel: 2, source: "BGV", sourceKey: "vox.bgv" }),
      ]),
      band("Headliners", "headliner", [
        input({ id: "b1", channel: 1, source: "Lead", sourceKey: "vox.lead" }),
        input({ id: "b2", channel: 2, source: "BGV", sourceKey: "vox.bgv" }),
        input({ id: "b3", channel: 3, source: "Choir", sourceKey: "vox.choir" }),
      ]),
    ];

    const { ports } = allocateEventPatch(bands);
    // Identical sourceKey + source name is the same night row: shared, once.
    const lead = ports.find((p) => p.used && p.label === "Lead")!;
    const bgv = ports.find((p) => p.used && p.label === "BGV")!;
    const choir = ports.find((p) => p.used && p.label === "Choir")!;
    expect(lead.bandLabels["Openers"]).toBe("Lead");
    expect(lead.bandLabels["Headliners"]).toBe("Lead");
    expect(bgv.bandLabels["Openers"]).toBe("BGV");
    expect(bgv.bandLabels["Headliners"]).toBe("BGV");
    // The headliner's third row appends after the shared two; the opener never
    // touches it and no family cap forces it into a block.
    expect(choir.bandLabels["Headliners"]).toBe("Choir");
    expect(choir.bandLabels["Openers"]).toBeUndefined();
    expect(choir.port).toBeGreaterThan(bgv.port);
  });

  it("merges a role across bands however each band spells it, by instance", () => {
    const bands = [
      band("Openers", "support", [
        input({ id: "a1", channel: 1, source: "BV", sourceKey: "vox.bgv" }),
      ]),
      band("Headliners", "headliner", [
        input({ id: "b1", channel: 1, source: "Backing Vocal", sourceKey: "vox.bgv" }),
        input({ id: "b2", channel: 2, source: "BGV 2", sourceKey: "vox.bgv" }),
      ]),
    ];
    const { ports } = allocateEventPatch(bands);
    // One shared first backing vocal, plus the headliner's own second.
    const bgvs = ports.filter((p) => p.used && p.family === "vox");
    expect(bgvs).toHaveLength(2);
    expect(bgvs[0]!.bandLabels).toMatchObject({
      Openers: "BV",
      Headliners: "Backing Vocal",
    });
    expect(bgvs[1]!.bandLabels).toEqual({ Headliners: "BGV 2" });
  });

  /** Rows pack in the rider's own channel order; family never decides placement. */
  const familiesOf = (ports: Array<{ port: number; family: string; used: boolean }>) =>
    ports.filter((p) => p.used).map((p) => p.family);

  it("groups the patch by family, voices and kit first", () => {
    const bands = [
      band("Full", "other", [
        input({ id: "k1", channel: 1, source: "Nord", sourceKey: "keys", stereo: true, inputType: "di" }),
        input({ id: "oh", channel: 2, source: "OH", sourceKey: "drum.oh", stereo: true, phantom: true }),
        input({ id: "kick", channel: 3, source: "Kick", sourceKey: "drum.kick", phantom: true }),
        input({ id: "v", channel: 4, source: "Vox", sourceKey: "vox.lead" }),
        input({ id: "g", channel: 5, source: "Gtr", sourceKey: "gtr", inputType: "di" }),
      ]),
    ];
    const { ports } = allocateEventPatch(bands);
    // Families pack together: voices lead, then the kit, then the mid, whatever
    // order the rider wrote them in.
    expect(familiesOf(ports)).toEqual([
      "vox",
      "kick",
      "oh",
      "oh",
      "guitar",
      "keys",
      "keys",
    ]);

    // Keys is a stereo pair; OH is stereo + 48V; kick never gets 48V.
    const keysPair = ports.filter((p) => p.family === "keys" && p.used);
    expect(keysPair).toHaveLength(2);
    expect(keysPair.every((p) => p.stereo)).toBe(true);
    expect(keysPair[0]!.port % 2).toBe(1);
    expect(keysPair[1]!.port).toBe(keysPair[0]!.port + 1);
    const oh = ports.filter((p) => p.family === "oh" && p.used);
    expect(oh.every((p) => p.phantom && p.stereo)).toBe(true);
    const kick = ports.find((p) => p.family === "kick" && p.used)!;
    expect(kick.phantom).toBe(false);
  });

  it("keeps a stereo keys pair and gives a distinctly named keyboard its own pair", () => {
    // Kickoff's real riders: Tress has one stereo Keys, Main has two; Main also
    // puts a Hi-hat on flex. Distinct identities each hold a legal stereo pair.
    const bands = [
      band("Tress Rider", "headliner", [
        input({ id: "t-k", channel: 1, source: "Kick", sourceKey: "drum.kick" }),
        input({ id: "t-s", channel: 2, source: "Snare", sourceKey: "drum.snare.top" }),
        input({ id: "t-rt", channel: 3, source: "Rack tom", sourceKey: "drum.tom.rack" }),
        input({ id: "t-ft", channel: 4, source: "Floor tom", sourceKey: "drum.tom.floor" }),
        input({ id: "t-oh", channel: 5, source: "Overheads", sourceKey: "drum.oh", stereo: true, phantom: true }),
        input({ id: "t-g1", channel: 6, source: "Guitar", sourceKey: "gtr", inputType: "di" }),
        input({ id: "t-g2", channel: 7, source: "Guitar", sourceKey: "gtr", inputType: "di" }),
        input({ id: "t-b", channel: 8, source: "Bass", sourceKey: "bass", inputType: "di" }),
        input({ id: "t-v1", channel: 9, source: "Lead vocal", sourceKey: "vox.lead" }),
        input({ id: "t-v2", channel: 10, source: "Backing vocal", sourceKey: "vox.bgv" }),
        input({ id: "t-k1", channel: 11, source: "Keys", sourceKey: "keys", inputType: "di", stereo: true }),
      ]),
      band("Main", "headliner", [
        input({ id: "m-k", channel: 1, source: "Kick", sourceKey: "drum.kick" }),
        input({ id: "m-s", channel: 2, source: "Snare", sourceKey: "drum.snare.top" }),
        input({ id: "m-hh", channel: 3, source: "Hi-hat", sourceKey: "drum.hat" }),
        input({ id: "m-rt", channel: 4, source: "Rack tom", sourceKey: "drum.tom.rack" }),
        input({ id: "m-ft", channel: 5, source: "Floor tom", sourceKey: "drum.tom.floor" }),
        input({ id: "m-oh", channel: 6, source: "Overheads", sourceKey: "drum.oh", stereo: true, phantom: true }),
        input({ id: "m-g", channel: 7, source: "Electric Guitar", sourceKey: "gtr", inputType: "di" }),
        input({ id: "m-b", channel: 8, source: "Bass", sourceKey: "bass", inputType: "di" }),
        input({ id: "m-v1", channel: 9, source: "Lead vocal", sourceKey: "vox.lead" }),
        input({ id: "m-k1", channel: 10, source: "Keys", sourceKey: "keys", inputType: "di", stereo: true }),
        input({ id: "m-k2", channel: 11, source: "Keys 2", sourceKey: "keys", inputType: "di", stereo: true }),
      ]),
    ];

    const { ports } = allocateEventPatch(bands);

    // Two distinct keyboards, each its own stereo pair.
    const keys1 = ports.find((p) => p.used && p.label === "Keys")!;
    const keys2 = ports.find((p) => p.used && p.label === "Keys 2")!;
    expect(keys1.stereo).toBe(true);
    expect(keys2.stereo).toBe(true);
    expect(keys1.port % 2).toBe(1);
    expect(keys2.port % 2).toBe(1);
    expect(keys2.port).toBeGreaterThan(keys1.port);
    // A stereo pair's right half mirrors its left and has no strip of its own.
    const right = ports.find((p) => p.port === keys1.port + 1)!;
    expect(right.stereo).toBe(true);
    expect(right.strip).toBeNull();

    // The flex row keeps its own rider name and one consistent source.
    const flex = ports.find((p) => p.family === "flex" && p.used)!;
    expect(flex.label).toBe("Hi-hat");
    expect(flex.bandLabels["Main"]).toBe("Hi-hat");
    expect(flex.nightSourceKey).toBe("drum.hat");
  });

  it("collapses a stereo row to mono only when no legal pair is left", () => {
    // 15 mono rows + 2 stereo rows cannot seat one box even all mono, so
    // nothing is broken to fit; the monos leave only an isolated socket, so a
    // stereo row collapses there and says so rather than being dropped.
    const bands = [
      band("Overflow", "headliner", [
        ...Array.from({ length: 15 }, (_, i) =>
          input({ id: `m${i}`, channel: i + 1, source: `Mono ${i}`, sourceKey: "drum.kick" }),
        ),
        ...Array.from({ length: 2 }, (_, i) =>
          input({
            id: `p${i}`,
            channel: 16 + i,
            source: `PB ${i}`,
            sourceKey: "pb",
            inputType: "playback",
            stereo: true,
          }),
        ),
      ]),
    ];
    const { warnings } = allocateEventPatch(bands);
    expect(warnings.some((w) => w.includes("no legal pair left"))).toBe(true);
  });

  it("keeps stereo on any family the rider asks for, not just keys", () => {
    const bands = [
      band("Stereo Gtr", "headliner", [
        input({ id: "v", channel: 1, source: "Vox", sourceKey: "vox.lead" }),
        input({ id: "g1", channel: 2, source: "Gtr", sourceKey: "gtr", inputType: "di" }),
        input({ id: "g2", channel: 3, source: "Gtr", sourceKey: "gtr", inputType: "di" }),
        input({ id: "g3", channel: 4, source: "Stereo Gtr", sourceKey: "gtr", inputType: "di", stereo: true }),
      ]),
    ];
    const { ports, warnings } = allocateEventPatch(bands);
    // Left halves own the pair; right halves mirror them (strip null).
    const stereoLeft = ports.filter(
      (p) => p.family === "guitar" && p.stereo && p.strip !== null,
    );
    expect(stereoLeft).toHaveLength(1);
    expect(stereoLeft[0]!.port % 2).toBe(1);
    expect(ports.find((p) => p.port === stereoLeft[0]!.port + 1)?.stereo).toBe(true);
    expect(warnings.some((w) => w.includes("no legal pair left"))).toBe(false);
  });

  it("gives each distinct unmapped instrument its own rider-ordered row", () => {
    const bands = [
      band("A", "support", [
        input({ id: "a", channel: 1, source: "Viola", sourceKey: "strings.viola", inputType: "di" }),
      ]),
      band("B", "headliner", [
        input({ id: "b", channel: 1, source: "Hi-hat", sourceKey: "drum.hat" }),
      ]),
    ];
    const { ports } = allocateEventPatch(bands);
    // Different unmapped instruments are different identities, so each seats its
    // own row and keeps its own name instead of sharing one stable "FlexN".
    const flex = usedPorts(ports, "flex");
    expect(flex.map((p) => p.label)).toEqual(["Viola", "Hi-hat"]);
    expect(flex[0]!.nightSourceKey).toBe("strings.viola");
    expect(flex[1]!.nightSourceKey).toBe("drum.hat");
  });

  it("packs two guitar rows onto their own sockets instead of a capped home", () => {
    const bands = [
      band("Twin Guitars", "support", [
        input({ id: "g1", channel: 1, source: "Gtr 1", sourceKey: "gtr", inputType: "di" }),
        input({ id: "g2", channel: 2, source: "Gtr 2", sourceKey: "gtr", inputType: "di" }),
      ]),
    ];
    const { ports } = allocateEventPatch(bands);
    // Two distinct guitar rows just pack; neither spills onto a flex home and no
    // per-family cap applies.
    const guitars = usedPorts(ports, "guitar");
    expect(guitars).toHaveLength(2);
    expect(guitars[0]!.label).toBe("Gtr 1");
    expect(guitars[1]!.label).toBe("Gtr 2");
    expect(usedPorts(ports, "flex")).toHaveLength(0);
  });

  it("diff: a band's own rows come up same; the previous set's channels mute", () => {
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
    const allocation = allocateEventPatch(bands);
    const plan = buildPatchDiffPlan(allocation);
    expect(plan.steps).toHaveLength(2);

    // Both bands' first lead vocal is one shared row, named for the anchor band.
    const lead = allocation.ports.find(
      (p) => p.used && p.family === "vox" && p.label === "Sam",
    )!;

    const openers = plan.steps[0]!;
    // Openers' own lead and sax are live from the night baseline and unchanged.
    expect(openers.ports.find((p) => p.port === lead.port)?.change).toBe("same");
    expect(openers.ports.find((p) => p.label === "Sax")?.change).toBe("same");
    // Rows only the headliners use read muted against the baseline.
    expect(openers.ports.find((p) => p.label === "BGV")?.change).toBe("mute");
    expect(openers.ports.find((p) => p.label === "Gtr")?.change).toBe("mute");

    const head = plan.steps[1]!;
    expect(head.comparedTo).toBe("Openers");
    // The shared lead stays up; the opener's own sax mutes and the headliner's
    // own rows come up.
    expect(head.ports.find((p) => p.port === lead.port)?.change).toBe("same");
    expect(head.ports.find((p) => p.label === "Sax")?.change).toBe("mute");
    expect(head.ports.find((p) => p.label === "BGV")?.change).toBe("same");
    expect(head.ports.find((p) => p.label === "Gtr")?.change).toBe("same");
    // First set never invents yellow swaps vs the night aggregate.
    expect(openers.ports.some((p) => p.change === "physical")).toBe(false);
    expect(head.ports.some((p) => p.change === "physical")).toBe(false);
  });

  it("diff: different flex instruments seat different rows and mute across the changeover", () => {
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
    // Sax and clarinet are different identities, so each gets its own row.
    const sax = allocation.ports.find((p) => p.used && p.label === "Sax")!;
    const clarinet = allocation.ports.find((p) => p.used && p.label === "Clarinet")!;
    expect(sax.port).not.toBe(clarinet.port);

    const plan = buildPatchDiffPlan(allocation);
    const head = plan.steps[1]!;
    // The opener's sax mutes; the headliner's clarinet comes up.
    expect(head.ports.find((p) => p.port === sax.port)?.change).toBe("mute");
    expect(head.ports.find((p) => p.port === clarinet.port)?.change).toBe("same");
    // A row is never remapped to another instrument, so there are no yellow
    // swaps and no changeover lines to list.
    expect(head.ports.some((p) => p.change === "physical")).toBe(false);
    expect(listPhysicalChangeovers(plan).filter((b) => b.lines.length > 0)).toHaveLength(0);
  });
});

describe("identical band setups", () => {
  /**
   * Three bands with the same rock-trio patch. The setups must be truly
   * identical — same sourceKey *and* source name — so the union merges each
   * row into one night row, which is what "identical setups" now means.
   */
  function identicalTrioNight(): ShowBandInput[] {
    const setup = (prefix: string) => [
      input({ id: `${prefix}-v1`, channel: 1, source: "Lead", sourceKey: "vox.lead" }),
      input({ id: `${prefix}-v2`, channel: 2, source: "BGV", sourceKey: "vox.bgv" }),
      input({ id: `${prefix}-g`, channel: 3, source: "Gtr", sourceKey: "gtr", inputType: "di" }),
      input({ id: `${prefix}-b`, channel: 4, source: "Bass", sourceKey: "bass", inputType: "di" }),
      input({ id: `${prefix}-k`, channel: 5, source: "Kick", sourceKey: "drum.kick" }),
      input({ id: `${prefix}-s`, channel: 6, source: "Snare", sourceKey: "drum.snare.top" }),
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
      band("Openers", "support", setup("a")),
      band("Middle", "other", setup("b")),
      band("Headliners", "headliner", setup("c")),
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
      // One merged night row, one label, for every band that seats on it.
      expect(Object.values(port.bandLabels)).toEqual([
        port.label,
        port.label,
        port.label,
      ]);
    }

    // Stable names come straight from the rider, found by family rather than a
    // fixed socket.
    expect(usedPort(ports, "vox").label).toBe("Lead");
    expect(usedPort(ports, "guitar").label).toBe("Gtr");
    expect(usedPort(ports, "bass").label).toBe("Bass");
    const oh = usedPort(ports, "oh");
    expect(oh.label).toMatch(/OH|Overhead/i);
    expect(oh.phantom).toBe(true);
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
    const allocation = allocateEventPatch(bands);
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

    // Live channels unmuted on every band snap; the label is the rider's name.
    const vox = usedPort(allocation.ports, "vox");
    const guitar = usedPort(allocation.ports, "guitar");
    for (const snap of [openers, middle, head]) {
      expect(snap.ae_data.ch[String(vox.strip)]?.mute).toBe(false);
      expect(snap.ae_data.ch[String(guitar.strip)]?.mute).toBe(false);
      expect(snap.ae_data.io.in.A[String(vox.port)]?.name).toBe(vox.label);
      expect(snap.ae_data.io.in.A[String(guitar.port)]?.name).toBe(guitar.label);
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
    const keys = usedPorts(allocation.ports, "keys");
    const left = keys.find((p) => p.strip !== null)!;
    const right = keys.find((p) => p.strip === null)!;
    expect(left.di).toBe(true);
    // Used to be false here while the band views said true.
    expect(right.di).toBe(true);
    expect(right.stereo).toBe(true);

    const plan = buildPatchDiffPlan(allocation);
    const nightRight = plan.night.ports.find((p) => p.port === right.port)!;
    const bandRight = plan.steps[0]!.ports.find((p) => p.port === right.port)!;
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
    // A bill that fits one box seats cleanly: no overflow and no collapsed pair.
    expect(allocation.warnings).toEqual([]);

    // Contiguous packing fits the whole bill — 3 guitars + bass + 3 flex + a
    // stereo keys pair — so nothing is dropped and the pair stays a legal pair.
    const live = allocation.ports.filter((p) => p.used);
    expect(live).toHaveLength(9);
    // Every live socket reaches a console strip, directly or by mirroring the
    // left half of its stereo pair.
    for (const port of live) {
      const strip =
        port.strip ??
        allocation.ports.find((p) => p.port === port.port - 1)!.strip;
      expect(strip).not.toBeNull();
    }

    const keysLeft = usedOn(allocation.ports, "A", "keys");
    expect(keysLeft.port % 2).toBe(1);
    const keysRight = allocation.ports.find(
      (p) => p.family === "keys" && p.port === keysLeft.port + 1,
    )!;
    expect(keysRight.used).toBe(true);
    expect(keysRight.strip).toBeNull();

    const snap = buildBandSnap(loadDefaultTemplate(), allocation, bands[0]!);
    expect(snap.ae_data.ch[String(keysLeft.strip)]?.in?.conn).toMatchObject({
      grp: "A",
      in: keysLeft.port,
    });
    expect(snap.ae_data.ch[String(keysLeft.strip)]?.mute).toBe(false);
  });
});

describe("one snake with a stereo row broken to mono", () => {
  // Fifteen inputs with stereo overheads and stereo keys: 17 sockets as asked,
  // 16 once keys run mono.
  function fullBill(keysStereo = true): ShowBandInput[] {
    return [
      band("Full", "headliner", [
        input({ id: "k", channel: 1, source: "Kick", sourceKey: "drum.kick" }),
        input({ id: "s", channel: 2, source: "Snare", sourceKey: "drum.snare.top" }),
        input({ id: "t1", channel: 3, source: "Tom 1", sourceKey: "drum.tom.rack" }),
        input({ id: "t2", channel: 4, source: "Tom 2", sourceKey: "drum.tom.floor" }),
        input({ id: "oh", channel: 5, source: "Overheads", sourceKey: "drum.oh", stereo: true }),
        input({ id: "p", channel: 7, source: "Aux percussion", sourceKey: "perc.aux" }),
        input({ id: "b", channel: 8, source: "Bass", sourceKey: "bass", inputType: "di" }),
        input({ id: "g2", channel: 9, source: "Guitar 2", sourceKey: "gtr", inputType: "di" }),
        input({ id: "g1", channel: 10, source: "Guitar 1", sourceKey: "gtr", inputType: "di" }),
        input({ id: "keys", channel: 11, source: "Keys", sourceKey: "keys", inputType: "di", stereo: keysStereo }),
        input({ id: "v1", channel: 13, source: "Lead vocal", sourceKey: "vox.lead" }),
        input({ id: "v2", channel: 14, source: "Wireless vocal", sourceKey: "vox.lead" }),
        input({ id: "v3", channel: 15, source: "BV", sourceKey: "vox.bgv" }),
        input({ id: "tp", channel: 16, source: "Trumpet", sourceKey: "wind.trumpet" }),
        input({ id: "sx", channel: 17, source: "Alto sax", sourceKey: "wind.sax.alto" }),
      ]),
    ];
  }

  it("offers one snake by running keys mono, never the overheads", () => {
    const allocation = allocateEventPatch(fullBill(), { secondSnake: false });
    expect(allocation.fitsOneBox).toBe(true);
    expect(allocation.monoToFit).toEqual(["Keys"]);
    expect(usedPort(allocation.ports, "keys").stereo).toBe(false);
    expect(usedPort(allocation.ports, "oh").stereo).toBe(true);
    expect(allocation.ports.filter((p) => p.used)).toHaveLength(16);
    expect(allocation.warnings.some((w) => w.includes("full"))).toBe(false);
    expect(
      allocation.warnings.some((w) => w.includes("Keys patched mono to fit one stage box")),
    ).toBe(true);
  });

  it("keeps keys stereo when the second snake is on", () => {
    const allocation = allocateEventPatch(fullBill(), { secondSnake: true });
    expect(allocation.fitsOneBox).toBe(true);
    expect(usedPort(allocation.ports, "keys").stereo).toBe(true);
    expect(allocation.warnings.some((w) => w.includes("patched mono"))).toBe(false);
  });

  it("does not offer one snake when only the overheads could collapse", () => {
    const bill = fullBill(false);
    bill[0]!.inputs.push(
      input({ id: "x", channel: 18, source: "Flute", sourceKey: "wind.flute" }),
    );
    const allocation = allocateEventPatch(bill, { secondSnake: false });
    expect(allocation.fitsOneBox).toBe(false);
    expect(usedPort(allocation.ports, "oh").stereo).toBe(true);
  });

  it("does not report Melody DCA members as past the USER1 layer", () => {
    const allocation = allocateEventPatch(fullBill(), { secondSnake: false });
    expect(allocation.melodyDca).not.toBeNull();
    expect(allocation.warnings.some((w) => w.includes("past the USER1 layer"))).toBe(false);
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
    // Every unpatched socket is listed; there are no stereo right halves here,
    // so the spare run is one unbroken stretch.
    expect(model.spare).toEqual(["2–16"]);
  });

  it("numbers spare runs on the daisy-chained box with real socket numbers", () => {
    const allocation = allocateEventPatch(soloVox, {
      secondSnake: true,
      sides: { keys: "B" },
    });
    const model = buildStageBoxDiagramModel(allocation);
    // Box B ports read as printed on the box, with the desk's sockets alongside.
    expect(model.spare).toEqual(["2–16", "1–16 (17–32)"]);
  });

  it("unpatches and blanks spare strips in the snaps", () => {
    const allocation = allocateEventPatch(soloVox);
    const snap = buildBandSnap(loadDefaultTemplate(), allocation, soloVox[0]!);

    expect(snap.ae_data.ch["1"]?.name).toBe("Lead");
    expect(snap.ae_data.ch["7"]?.name).toBe("");
    expect(snap.ae_data.ch["7"]?.mute).toBe(true);
    expect(snap.ae_data.ch["7"]?.in?.conn).toMatchObject({ grp: "OFF" });
    expect(snap.ae_data.io.in.A["7"]?.name).toBe("");
  });

  it("blanks strips the patch does not own: stereo right halves and idle box B", () => {
    const bands = [
      band("Stereo", "headliner", [
        input({ id: "v", channel: 1, source: "Lead", sourceKey: "vox.lead" }),
        input({ id: "k", channel: 2, source: "Keys", sourceKey: "keys", stereo: true, inputType: "di" }),
      ]),
    ];
    const allocation = allocateEventPatch(bands);
    const snap = buildNightSnap(loadDefaultTemplate(), allocation);

    // The keys right half has no strip of its own; its channel must not keep the
    // template's stale name, patch or tags.
    const right = allocation.ports.find(
      (p) => p.used && p.family === "keys" && p.strip === null,
    )!;
    expect(snap.ae_data.ch[String(right.port)]?.name).toBe("");
    expect(snap.ae_data.ch[String(right.port)]?.mute).toBe(true);
    expect(snap.ae_data.ch[String(right.port)]?.in?.conn).toMatchObject({ grp: "OFF" });
    expect(snap.ae_data.ch[String(right.port)]?.tags).toBe("");

    // One snake: box B's strips (17–32) are unowned, so the template's stale
    // "Kick"/"Snare" names never survive the night recall.
    expect(snap.ae_data.ch["17"]?.name).toBe("");
    expect(snap.ae_data.ch["17"]?.mute).toBe(true);
    expect(snap.ae_data.ch["17"]?.in?.conn).toMatchObject({ grp: "OFF" });
  });
});

describe("two snakes", () => {
  const twoSnakePlan: PatchPlan = {
    secondSnake: true,
    sides: { drums: "A", keys: "B", flex: "B" },
  };

  /** A headliner that needs more than one 16-socket box: 18 sockets total. */
  function bigBill(): ShowBandInput[] {
    return [
      band("Big Band", "headliner", [
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
        input({ id: "sn", channel: 13, source: "Snare", sourceKey: "drum.snare.top" }),
        input({ id: "t1", channel: 14, source: "Rack", sourceKey: "drum.tom.rack" }),
        input({ id: "t2", channel: 15, source: "Floor", sourceKey: "drum.tom.floor" }),
        input({ id: "oh", channel: 16, source: "OH", sourceKey: "drum.oh", stereo: true }),
      ]),
    ];
  }

  it("fills box A by family, then flows the remainder to box B", () => {
    const allocation = allocateEventPatch(bigBill(), twoSnakePlan);
    expect(allocation.snakes).toEqual(["A", "B"]);

    // Box A seats its 16 band inputs; the tail (flex/horns) continues on box B.
    const aUsed = allocation.ports.filter((p) => p.used && p.snake === "A");
    const bUsed = allocation.ports.filter((p) => p.used && p.snake === "B");
    expect(aUsed).toHaveLength(16);
    expect(bUsed.map((p) => p.port)).toEqual([1, 2]);

    // The keys pair still seats on A, as a legal pair, ahead of the flex.
    const keysLeft = allocation.ports.find(
      (p) => p.used && p.family === "keys" && p.strip !== null,
    )!;
    expect(keysLeft.snake).toBe("A");
    expect(keysLeft.port % 2).toBe(1);
    expect(allocation.ports.find((p) => p.port === keysLeft.port + 1)?.strip).toBeNull();

    // The rows that overflowed are the flex/horns, picking up on box B.
    expect(bUsed.every((p) => p.family === "flex")).toBe(true);
    const flexLeft = bUsed[0]!;
    expect(flexLeft.port).toBe(1);
    expect(aes50Label("B", flexLeft.port)).toBe("A.17");
    expect(aes50PortFor("B", 16)).toBe(32);
    // Box A kept its own first vox row.
    expect(usedOn(allocation.ports, "A", "vox").strip).toBe(1);
  });

  it("daisy-chains the second box onto AES50 A at 17–32", () => {
    const bands = bigBill();
    const allocation = allocateEventPatch(bands, twoSnakePlan);
    const snap = buildBandSnap(loadDefaultTemplate(), allocation, bands[0]!);

    // The first box-B row lands on the shared AES50 A link, not AES50 B.
    const firstB = allocation.ports.find(
      (p) => p.used && p.snake === "B" && p.strip !== null,
    )!;
    const socket = aes50PortFor("B", firstB.port);
    expect(socket).toBe(17);
    expect(snap.ae_data.io.in.A[String(socket)]?.name).toBe(firstB.label);
    expect(snap.ae_data.ch[String(firstB.strip)]?.in?.conn).toMatchObject({
      grp: "A",
      in: socket,
    });
    expect(snap.ae_data.ch[String(firstB.strip)]?.mute).toBe(false);
    // The next box-B socket nothing seats on tonight is unpatched, not stale.
    expect(snap.ae_data.io.in.A["19"]?.name).toBe("");
    expect(snap.ae_data.ch["19"]?.in?.conn).toMatchObject({ grp: "OFF" });
    // Nothing lands on AES50 B at all.
    expect(snap.ae_data.io.in.B?.["17"]?.name).toBe("");
  });

  it("keeps everything on A when the second snake is off, dropping the overflow", () => {
    const allocation = allocateEventPatch(bigBill(), {
      secondSnake: false,
      sides: { keys: "B" },
    });
    expect(allocation.snakes).toEqual(["A"]);
    expect(allocation.ports.every((p) => p.snake === "A")).toBe(true);
    expect(allocation.fitsOneBox).toBe(false);
    // Box A packs its 16 sockets and the rest cannot seat; the shortfall is
    // reported rather than silently dropped.
    expect(allocation.ports.filter((p) => p.used).length).toBe(16);
    expect(
      allocation.warnings.some((w) => w.includes("needs more than one stage box")),
    ).toBe(true);
    expect(allocation.warnings.some((w) => w.includes("Snake A full"))).toBe(true);
  });

  it("flows the overflow onto box B rather than shoving a group across", () => {
    const allocation = allocateEventPatch(bigBill(), { secondSnake: true, sides: {} });
    // Everything seats across the two boxes, so nothing is dropped or collapsed.
    expect(allocation.warnings.some((w) => w.includes("full"))).toBe(false);
    expect(allocation.warnings.some((w) => w.includes("no legal pair"))).toBe(false);
    expect(allocation.fitsOneBox).toBe(false);
    // Box A seats 16 band inputs; box B takes the remaining pair.
    expect(allocation.ports.filter((p) => p.used && p.snake === "A")).toHaveLength(16);
    expect(allocation.ports.filter((p) => p.used && p.snake === "B")).toHaveLength(2);
    expect(
      allocation.ports.some((p) => p.snake === "B" && p.family === "flex" && p.used),
    ).toBe(true);
    // Placement is family-grouped: box A fills 1–16, then the tail continues on B.
    expect(
      allocation.ports.filter((p) => p.snake === "A" && p.used).map((p) => p.port),
    ).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    // One console strip per live left socket across both boxes (stereo right
    // halves ride their left's strip).
    expect(
      allocation.ports.filter((p) => p.used && p.strip !== null),
    ).toHaveLength(16);
  });
});

describe("snapshot scoping", () => {
  function trio(): ShowBandInput[] {
    const setup = (prefix: string) => [
      input({ id: `${prefix}-v`, channel: 1, source: "Lead", sourceKey: "vox.lead" }),
      input({ id: `${prefix}-k`, channel: 2, source: "Kick", sourceKey: "drum.kick" }),
      input({ id: `${prefix}-s`, channel: 3, source: "Snare", sourceKey: "drum.snare.top" }),
    ];
    return [
      band("Openers", "support", setup("a")),
      band("Headliners", "headliner", [
        ...setup("b"),
        input({ id: "b-g", channel: 4, source: "Gtr", sourceKey: "gtr", inputType: "di" }),
      ]),
    ];
  }

  /** `scopes` strings are one char per item: "+" in scope, " " out. */
  const inScope = (scope: string, oneBased: number) => scope[oneBased - 1] === "+";

  it("leaves unchanged channels and all preamps out of a band scene's scope", () => {
    const bands = trio();
    const allocation = allocateEventPatch(bands);
    const template = loadDefaultTemplate();
    const headliners = buildBandSnap(template, allocation, bands[1]!, {
      previous: bands[0]!,
    });
    const scopes = headliners.scopes!;

    expect(scopes.ch).toHaveLength(40);
    // Kick and snare are identical to the opener's scene, so recalling this
    // scene must not re-gain them.
    expect(inScope(scopes.ch, stripOf(allocation.ports, "kick"))).toBe(false);
    expect(inScope(scopes.ch, stripOf(allocation.ports, "snare"))).toBe(false);
    // The guitar only the headliners use does change.
    expect(inScope(scopes.ch, stripOf(allocation.ports, "guitar"))).toBe(true);
    // Preamps are the engineer's from load-in onwards.
    expect(scopes.source.A).toBe(" ".repeat(48));
    expect(scopes.bus).toBe(" ".repeat(16));
    // An in-scope channel recalls its whole strip; gain is protected by the
    // source scope above, not by narrowing contents.
    expect(scopes.contents).toBe("+".repeat(15));
  });

  it("scopes in everything the first band lights up, and recalls the night baseline in full", () => {
    const bands = trio();
    const allocation = allocateEventPatch(bands);
    const template = loadDefaultTemplate();

    const openers = buildBandSnap(template, allocation, bands[0]!, { previous: null });
    const voxStrip = stripOf(allocation.ports, "vox");
    const kickStrip = stripOf(allocation.ports, "kick");
    expect(inScope(openers.scopes!.ch, voxStrip)).toBe(true); // vox unmutes vs the baseline
    expect(inScope(openers.scopes!.ch, kickStrip)).toBe(true); // kick unmutes too
    expect(inScope(openers.scopes!.ch, stripOf(allocation.ports, "guitar"))).toBe(
      false,
    ); // guitar is muted in both

    const night = buildNightSnap(template, allocation);
    expect(night.scopes!.ch).toBe("+".repeat(40));
    expect(night.scopes!.source.A).toBe("+".repeat(48));
    expect(night.ae_data.ch[String(voxStrip)]?.mute).toBe(true);
    expect(night.ae_data.ch[String(voxStrip)]?.name).toBe(
      usedPort(allocation.ports, "vox").label,
    );
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

  it("writes the same scope shape a desk-saved snapshot.11 uses", () => {
    const reference = JSON.parse(
      readFileSync(new URL("../templates/scopes-reference.json", import.meta.url), "utf8"),
    ).samples.mixed as Record<string, unknown>;

    const bands = trio();
    const scopes = buildNightSnap(
      loadDefaultTemplate(),
      allocateEventPatch(bands),
    ).scopes as unknown as Record<string, unknown>;

    const shape = (value: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) =>
          typeof entry === "string"
            ? [key, entry.length]
            : [
                key,
                Object.fromEntries(
                  Object.entries(entry as Record<string, string>).map(([k, v]) => [
                    k,
                    v.length,
                  ]),
                ),
              ],
        ),
      );

    expect(shape(scopes)).toEqual(shape(reference));
    // Only "+" and " " are legal; a full-scope scene is all "+".
    expect(JSON.stringify(scopes)).not.toMatch(/[^\s"+:{},a-zA-Z]/);
  });

  it("encodes deselected channels the way the console does", () => {
    const console = JSON.parse(
      readFileSync(new URL("../templates/scopes-reference.json", import.meta.url), "utf8"),
    ).samples.channelsDeselected as { ch: string; contents: string };

    // Saved from the desk with CH 10-13 dropped from the object grid.
    expect(console.ch).toHaveLength(40);
    expect([...console.ch].flatMap((c, i) => (c === " " ? [i + 1] : []))).toEqual([
      10, 11, 12, 13,
    ]);
    expect(console.contents).toBe("+".repeat(15));

    // Ours is the same string shape: "+" for a channel this scene touches.
    const bands = trio();
    const scene = buildBandSnap(loadDefaultTemplate(), allocateEventPatch(bands), bands[1]!, {
      previous: bands[0]!,
    });
    expect(scene.scopes!.ch).toHaveLength(console.ch.length);
    expect(scene.scopes!.ch).toMatch(/^[+ ]+$/);
    expect(scene.scopes!.contents).toBe(console.contents);
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
    const bands = trio();
    const allocation = allocateEventPatch(bands);
    const result = buildShowPackage({ eventName: "Scoped Night", bands });
    const unzipped = unzipSync(result.zipBytes);
    const headliners = JSON.parse(strFromU8(unzipped["Headliners.snap"]!));
    const base = JSON.parse(strFromU8(unzipped["Default.snap"]!));

    const kick = usedPort(allocation.ports, "kick");
    // Kick is unchanged between opener and headliner scenes, so it stays out.
    expect(headliners.scopes.ch[kick.strip! - 1]).toBe(" ");
    expect(base.scopes.ch).toBe("+".repeat(40));
    expect(base.ae_data.io.in.A[String(kick.port)].name).toBe("Kick");
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

    const vox = usedPort(allocation.ports, "vox");
    const oh = usedPort(allocation.ports, "oh");
    expect(snap.type).toBe("snapshot.11");
    expect(snap.ae_data.io.in.A[String(vox.port)]?.name).toBe(vox.label);
    expect(snap.ae_data.io.in.A[String(vox.port)]?.vph).toBe(false);
    expect(snap.ae_data.io.in.A[String(oh.port)]?.vph).toBe(true);
    expect(snap.ae_data.io.in.A[String(oh.port)]?.mode).toBe("ST");
    expect(snap.ae_data.ch[String(vox.strip)]?.mute).toBe(false);
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

describe("desk layers", () => {
  const bandWith = (inputs: ShowBandInput["inputs"]): ShowBandInput => ({
    bandName: "Layered",
    fileStem: fileStem("Layered"),
    role: "headliner",
    inputs,
  });

  it("explodes vocals and collapses drums, with USB music on fader 12", () => {
    const bands = [
      bandWith([
        input({ id: "k", channel: 1, source: "Kick", sourceKey: "drum.kick" }),
        input({ id: "s", channel: 2, source: "Snare", sourceKey: "drum.snare.top" }),
        input({ id: "v1", channel: 3, source: "Lead vocal", sourceKey: "vox.lead" }),
        input({ id: "v2", channel: 4, source: "BV 1", sourceKey: "vox.bgv" }),
        input({ id: "g", channel: 5, source: "Guitar", sourceKey: "gtr", inputType: "di" }),
      ]),
    ];
    const { groups, layers } = allocateEventPatch(bands);
    expect(groups.map((group) => group.label)).toEqual(["Vocals", "Guitars", "Drums"]);

    const page1 = layers[0]!;

    // Vocals lead: Vocals DCA, then the Vox FX DCA, then every vocal exploded.
    expect(page1.slots[0]).toMatchObject({ kind: "dca", name: "Vocals" });
    expect(page1.slots[1]).toMatchObject({ kind: "dca", name: "Vox FX DCA" });
    expect(page1.slots[2]).toMatchObject({ kind: "channel", name: "Lead vocal" });
    expect(page1.slots[3]).toMatchObject({ kind: "channel", name: "BV 1" });

    // Drums always collapse to a single DCA — no kick/snare faders.
    expect(page1.slots.filter((s) => s.kind === "dca" && s.name === "Drums")).toHaveLength(1);
    expect(
      page1.slots.some((s) => s.kind === "channel" && s.name === "Kick"),
    ).toBe(false);

    // A one-channel group (Bass/Guitar here) gets no wasted DCA.
    expect(page1.slots.some((s) => s.kind === "dca" && s.name === "Guitars")).toBe(
      false,
    );

    // USB 1/2 walk-in music owns fader 12 — pinned by position, not list order.
    const usbIndex = page1.slots.findIndex((s) => s.kind === "usb");
    expect(usbIndex).toBeGreaterThanOrEqual(0);
    expect(page1.positions[usbIndex]).toBe(12);
  });

  it("folds the melodic frontline into one Melody DCA when faders are tight", () => {
    // 23 melodic channels + vocals + drums way past 23 usable faders.
    const bands = [
      bandWith([
        ...Array.from({ length: 2 }, (_, i) =>
          input({ id: `v${i}`, channel: i + 1, source: `V${i}`, sourceKey: "vox.lead" }),
        ),
        input({ id: "k", channel: 3, source: "Kick", sourceKey: "drum.kick" }),
        ...Array.from({ length: 20 }, (_, i) =>
          input({ id: `g${i}`, channel: 4 + i, source: `Gtr ${i}`, sourceKey: "gtr", inputType: "di" }),
        ),
      ]),
    ];
    const { layers } = allocateEventPatch(bands, { secondSnake: true, sides: {} });
    const all = layers.flatMap((page) => page.slots);
    expect(all.some((slot) => slot.kind === "dca" && slot.name === "Melody")).toBe(
      true,
    );
  });

  it("inserts pitch correction on vocals only, leads first", () => {
    const bands = [
      bandWith([
        input({ id: "k", channel: 1, source: "Kick", sourceKey: "drum.kick" }),
        input({ id: "v", channel: 2, source: "Lead vocal", sourceKey: "vox.lead" }),
        input({ id: "b1", channel: 3, source: "BV 1", sourceKey: "vox.bgv" }),
        input({ id: "b2", channel: 4, source: "BV 2", sourceKey: "vox.bgv" }),
      ]),
    ];
    const allocation = allocateEventPatch(bands);
    const snap = buildNightSnap(loadDefaultTemplate(), allocation);
    const preinsOf = (label: string) => {
      const strip = allocation.ports.find(
        (port) => port.used && port.label === label,
      )!.strip!;
      return (snap.ae_data.ch[String(strip)] as { preins?: { on: boolean; ins: string } })
        .preins;
    };

    // Lead first, then backings, cycling the PCORR slots.
    expect(preinsOf("Lead vocal")).toMatchObject({ on: true, ins: "FX12" });
    expect(preinsOf("BV 1")).toMatchObject({ on: true, ins: "FX13" });
    expect(preinsOf("BV 2")).toMatchObject({ on: true, ins: "FX14" });
    // No pitch correction on the kit, even though the template left it on ch1–4.
    expect(preinsOf("Kick")).toMatchObject({ on: false });
  });

  it("writes the pages into USER1 and reports anything past its 24 slots", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      input({ id: `c${i}`, channel: i + 1, source: `Ch ${i}`, sourceKey: "vox.lead" }),
    );
    // Two snakes so all 30 inputs patch; 30 channels then exceed USER1's 24.
    const allocation = allocateEventPatch([bandWith(many)], {
      secondSnake: true,
      sides: {},
    });
    const snap = buildNightSnap(loadDefaultTemplate(), allocation);
    const user1 = (snap.ce_data?.layer?.CMPCT?.["8"] ?? {}) as Record<string, unknown>;
    expect(user1.name).toBe("USER1");
    // USER1 holds exactly 24 slots; the rest are still patched and named.
    expect(Object.keys(user1).filter((key) => /^\d+$/.test(key))).toHaveLength(24);
    expect(allocation.warnings.some((w) => w.includes("past the USER1 layer"))).toBe(
      true,
    );
  });

  it("writes USER1/USER2 into band scenes too, so a recall never blanks them", () => {
    const bands = [
      bandWith([
        input({ id: "v", channel: 1, source: "Lead vocal", sourceKey: "vox.lead" }),
        input({ id: "k", channel: 2, source: "Kick", sourceKey: "drum.kick" }),
      ]),
    ];
    const allocation = allocateEventPatch(bands);
    const night = buildNightSnap(loadDefaultTemplate(), allocation);
    const bandSnap = buildBandSnap(loadDefaultTemplate(), allocation, bands[0]!);

    for (const bank of ["8", "9"]) {
      const fromBand = bandSnap.ce_data?.layer?.CMPCT?.[bank] as Record<string, unknown>;
      const fromNight = night.ce_data?.layer?.CMPCT?.[bank] as Record<string, unknown>;
      expect(fromBand).toEqual(fromNight);
      expect(fromBand.name).toBe(bank === "8" ? "USER1" : "USER2");
    }
  });
});

describe("desk rebuild", () => {
  /**
   * The template is a blueprint: it supplies DCA names, bus inserts and channel
   * inserts that the bill may not justify. These tests pin what gets rebuilt
   * versus what is kept.
   */
  const leadVocal = input({ id: "v", channel: 1, source: "Lead vocal", sourceKey: "vox.lead" });
  const kick = input({ id: "k", channel: 3, source: "Kick", sourceKey: "drum.kick" });
  const snare = input({ id: "s", channel: 4, source: "Snare", sourceKey: "drum.snare.top" });

  const stripFor = (allocation: ReturnType<typeof allocateEventPatch>, label: string) =>
    allocation.ports.find((port) => port.used && port.label === label)!.strip!;

  it("names the DCAs the bill justifies and blanks the template's leftovers", () => {
    // Only vocals and drums are on this bill → D1/D2 are live, nothing else is.
    const allocation = allocateEventPatch([
      band("Two Groups", "headliner", [leadVocal, kick, snare]),
    ]);
    expect(allocation.groups.map((group) => [group.dca, group.label])).toEqual([
      [1, "Vocals"],
      [2, "Drums"],
    ]);

    // The Vox FX DCA is separate from the family DCAs and takes the first slot
    // after them, so it can never collide however many families are present.
    expect(allocation.fxDca).toMatchObject({ name: "Vox FX DCA", dca: 3 });

    const snap = buildNightSnap(loadDefaultTemplate(), allocation);
    const dcas = snap.ae_data.dca as Record<string, { name?: string }>;
    expect(dcas["1"]?.name).toBe("Vocals");
    expect(dcas["2"]?.name).toBe("Drums");
    // The template's stale "Melody DCA" / "Keys DCA" / "FX DCA" do not survive.
    expect(dcas["4"]?.name).toBe("");
    expect(dcas["5"]?.name).toBe("");
    expect(dcas["3"]?.name).toBe("Vox FX DCA");
    // The vocal FX returns ride that DCA.
    const buses = snap.ae_data.bus as Record<string, { tags?: string }>;
    expect(buses["13"]?.tags).toBe("#D3");
    expect(buses["14"]?.tags).toBe("#D3");
  });

  it("puts PCORR pre and DE-S2 post on the lead, and clears the rest", () => {
    // The backing vocal lands first on the desk; the lead still gets the first
    // FX slots because vocals are ordered leads first.
    const allocation = allocateEventPatch([
      band("Vox Night", "headliner", [
        input({ id: "bv", channel: 1, source: "BV 1", sourceKey: "vox.bgv" }),
        input({ id: "v", channel: 2, source: "Lead vocal", sourceKey: "vox.lead" }),
        input({ id: "k", channel: 3, source: "Kick", sourceKey: "drum.kick" }),
      ]),
    ]);
    const snap = buildNightSnap(loadDefaultTemplate(), allocation);
    const channel = (label: string) =>
      snap.ae_data.ch[String(stripFor(allocation, label))] as {
        preins?: { on: boolean; ins?: string };
        postins?: { on: boolean; ins?: string };
      };

    const lead = channel("Lead vocal");
    expect(lead.preins).toMatchObject({ on: true, ins: "FX12" });
    expect(lead.postins).toMatchObject({ on: true, ins: "FX11" });

    // Every vocal gets its own de-esser: the backing's is a clone in a spare
    // standard slot (the blueprint loads only one DE-S2, on FX11).
    const backing = channel("BV 1");
    expect(backing.preins).toMatchObject({ on: true, ins: "FX13" });
    expect(backing.postins?.on).toBe(true);
    const backingDeEss = Number(backing.postins?.ins?.replace("FX", ""));
    expect(backingDeEss).toBeGreaterThanOrEqual(9); // standard slot, not premium
    expect(backingDeEss).not.toBe(11); // its own engine, not the lead's
    // The clone carries the blueprint DE-S2's settings.
    expect(snap.ae_data.fx?.[String(backingDeEss)]?.mdl).toBe("DE-S2");

    // Drums never get the template's stray PCORR (it was left on ch1–4).
    const kit = channel("Kick");
    expect(kit.preins).toMatchObject({ on: false, ins: "NONE" });
    expect(kit.postins).toMatchObject({ on: false, ins: "NONE" });
  });

  it("keeps standard engines out of the premium FX slots", () => {
    // Two vocals need two PCORR + two DE-S2 engines. The blueprint has spare
    // PCORR on FX12–15 and one DE-S2 on FX11; the extra DE-S2 must land in a
    // standard slot, never steal a premium one a reverb might need.
    const allocation = allocateEventPatch([
      band("Vox Night", "headliner", [
        input({ id: "v1", channel: 1, source: "Lead 1", sourceKey: "vox.lead" }),
        input({ id: "v2", channel: 2, source: "Lead 2", sourceKey: "vox.lead" }),
      ]),
    ]);
    const snap = buildNightSnap(loadDefaultTemplate(), allocation);
    const used = new Set<number>();
    for (const channel of Object.values(snap.ae_data.ch)) {
      const ins = channel as { postins?: { on?: boolean; ins?: string } };
      if (ins.postins?.on && ins.postins.ins?.startsWith("FX")) {
        used.add(Number(ins.postins.ins.replace("FX", "")));
      }
    }
    expect(used.size).toBe(2);
    for (const slot of used) expect(slot).toBeGreaterThanOrEqual(9);
  });

  it("clears the stray de-esser insert on bus 15 but keeps the reverb returns", () => {
    const allocation = allocateEventPatch([band("Bus Night", "headliner", [leadVocal])]);
    const snap = buildNightSnap(loadDefaultTemplate(), allocation);
    const buses = snap.ae_data.bus as Record<
      string,
      { name?: string; preins?: { on: boolean; ins?: string } }
    >;

    // Bus 15 is unnamed blueprint space; its DE-S2 insert is a stray.
    expect(buses["15"]?.preins).toMatchObject({ on: false, ins: "NONE" });
    // Bus 13/14 are the named Vox/Plate reverb returns — blueprint, kept.
    expect(buses["13"]?.preins).toMatchObject({ on: true, ins: "FX1" });
    expect(buses["14"]?.preins).toMatchObject({ on: true, ins: "FX2" });
  });

  it("flattens every channel's EQ so no blueprint curve rides along", () => {
    // The template leaves a shaped EQ (a -1.8 dB dip at 244 Hz, a +2.7 dB bell
    // at 1.5k) on every channel. The rebuild keeps the block's on/off but must
    // zero the gains, or a Kick inherits an FX return's curve.
    const allocation = allocateEventPatch([
      band("EQ Night", "headliner", [leadVocal, kick]),
    ]);
    const snap = buildNightSnap(loadDefaultTemplate(), allocation);
    const eqOf = (label: string) =>
      snap.ae_data.ch[String(stripFor(allocation, label))] as {
        eq?: Record<string, unknown>;
      };

    const flat = { lg: 0, "1g": 0, "2g": 0, "3g": 0, "4g": 0, hg: 0 };
    // Kick: EQ on, curve flat.
    expect(eqOf("Kick").eq).toMatchObject({ on: true, ...flat });
    // Vocal: EQ off, curve also flat (so enabling it later starts neutral).
    expect(eqOf("Lead vocal").eq).toMatchObject({ on: false, ...flat });
  });

  it("blanks FX engines the bill never reaches and keeps the ones it does", () => {
    // One lead vocal uses one PCORR + one DE-S2. The blueprint's spare PCORR
    // (FX14/15) and its unused UKROCK amp sims (FX9/10) must not squat slots.
    const allocation = allocateEventPatch([
      band("Solo Night", "headliner", [leadVocal]),
    ]);
    const snap = buildNightSnap(loadDefaultTemplate(), allocation);
    const fx = snap.ae_data.fx as Record<string, { mdl?: string }>;

    for (const slot of ["9", "10", "14", "15"]) {
      expect(fx[slot]?.mdl, `FX${slot} should be blank`).toBe("NONE");
    }
    // The named reverb returns the buses still use stay loaded.
    expect(fx["1"]?.mdl).toBe("VSS3");
    expect(fx["2"]?.mdl).toBe("PLATE");
  });

  it("frees a spare standard engine instead of pushing a clone into a premium slot", () => {
    // Three vocals need three DE-S2 but the blueprint loads one on FX11. The
    // spare PCORR on FX15 is released, so both extra DE-S2 land in standard
    // slots (15/16) rather than squatting FX3 in the reverb range.
    const allocation = allocateEventPatch([
      band("Vox Night", "headliner", [
        input({ id: "v1", channel: 1, source: "Lead 1", sourceKey: "vox.lead" }),
        input({ id: "v2", channel: 2, source: "Lead 2", sourceKey: "vox.lead" }),
        input({ id: "v3", channel: 3, source: "Lead 3", sourceKey: "vox.lead" }),
      ]),
    ]);
    const snap = buildNightSnap(loadDefaultTemplate(), allocation);
    const slots: number[] = [];
    for (const channel of Object.values(snap.ae_data.ch)) {
      const ins = channel as { postins?: { on?: boolean; ins?: string } };
      if (ins.postins?.on && ins.postins.ins?.startsWith("FX")) {
        slots.push(Number(ins.postins.ins.replace("FX", "")));
      }
    }
    expect(slots).toHaveLength(3);
    for (const slot of slots) expect(slot).toBeGreaterThanOrEqual(9);
  });
});

describe("melody compression and reserved DCAs", () => {
  function bandWith(inputs: ShowBandInput["inputs"]): ShowBandInput {
    return { bandName: "Layered", fileStem: fileStem("Layered"), role: "headliner", inputs };
  }
  const many = (sourceKey: string, count: number, start = 1) =>
    Array.from({ length: count }, (_, i) =>
      input({ id: `${sourceKey}${i}`, channel: start + i, source: `${sourceKey} ${i}`, sourceKey }),
    );

  it("tags every melodic channel into the compressed Melody DCA", () => {
    // Vocals + drums + 12 guitars: the guitars cannot fit page 1 exploded, so
    // they compress into one Melody DCA that must actually own them all.
    const inputs = [
      ...many("vox.lead", 2),
      input({ id: "k", channel: 3, source: "Kick", sourceKey: "drum.kick" }),
      ...many("gtr", 12, 4),
    ];
    const allocation = allocateEventPatch([bandWith(inputs)]);
    const melody = allocation.melodyDca;
    expect(melody).not.toBeNull();

    const guitars = allocation.ports.filter(
      (port) => port.used && port.family === "guitar" && port.strip !== null,
    );
    expect(guitars.length).toBeGreaterThan(1);
    for (const guitar of guitars) {
      expect(guitar.tags).toBe(`#D${melody!.dca}`);
    }
    // The Melody DCA is named on the desk.
    const snap = buildNightSnap(loadDefaultTemplate(), allocation);
    const dcas = snap.ae_data.dca as Record<string, { name?: string }>;
    expect(dcas[String(melody!.dca)]?.name).toBe("Melody");
  });

  it("reserves distinct DCA slots so the FX and Melody DCAs never collide", () => {
    const inputs = [
      ...many("vox.lead", 2),
      ...many("gtr", 12, 3),
    ];
    const allocation = allocateEventPatch([bandWith(inputs)]);
    const slots = [
      ...allocation.groups.map((group) => group.dca),
      ...(allocation.fxDca ? [allocation.fxDca.dca] : []),
      ...(allocation.melodyDca ? [allocation.melodyDca.dca] : []),
    ];
    expect(new Set(slots).size).toBe(slots.length);
  });
});

describe("USER2 vocal FX returns", () => {
  it("puts each reverb return on its own USER2 fader once", () => {
    const allocation = allocateEventPatch([
      band("Vox Night", "headliner", [
        input({ id: "v", channel: 1, source: "Lead", sourceKey: "vox.lead" }),
      ]),
    ]);
    const snap = buildNightSnap(loadDefaultTemplate(), allocation);
    const user2 = (snap.ce_data?.layer?.CMPCT?.["9"] ?? {}) as Record<
      string,
      { type?: string; i?: number }
    >;
    expect(user2.name).toBe("USER2");
    expect(user2["1"]).toMatchObject({ type: "BUS", i: 13 });
    expect(user2["2"]).toMatchObject({ type: "BUS", i: 14 });
    // No duplicate: fader 3 is not another copy of bus 13.
    expect(user2["3"]?.type).toBe("OFF");
  });
});

describe("talkback", () => {
  it("keeps talkback on strip 40 patched from local input 24", () => {
    const allocation = allocateEventPatch([
      band("Solo", "headliner", [
        input({ id: "v", channel: 1, source: "Lead", sourceKey: "vox.lead" }),
      ]),
    ]);
    const snap = buildNightSnap(loadDefaultTemplate(), allocation);
    const talkback = snap.ae_data.ch["40"] as {
      name?: string;
      in?: { conn?: { grp?: string; in?: number } };
    };
    expect(talkback.name).toBe("TALKBACK");
    expect(talkback.in?.conn).toMatchObject({ grp: "LCL", in: 24 });
  });

  it("names and patches USB 1/2 so the reserved USER1 fader reads", () => {
    const allocation = allocateEventPatch([
      band("Solo", "headliner", [
        input({ id: "v", channel: 1, source: "Lead", sourceKey: "vox.lead" }),
      ]),
    ]);
    const snap = buildNightSnap(loadDefaultTemplate(), allocation);
    // AUX 1 is console channel 41; the template already feeds it from USB 1/2.
    const usb = snap.ae_data.aux?.["1"] as {
      name?: string;
      in?: { conn?: { grp?: string; in?: number } };
    };
    expect(usb.name).toBe("USB 1/2");
    expect(usb.in?.conn).toMatchObject({ grp: "USB", in: 1 });

    // The USER1 fader that the page reserves points at AUX 1 (channel 41).
    const user1 = (snap.ce_data?.layer?.CMPCT?.["8"] ?? {}) as Record<
      string,
      { type?: string; i?: number }
    >;
    expect(user1["12"]).toMatchObject({ type: "CH", i: 41 });
  });
});
