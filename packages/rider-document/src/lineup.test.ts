import { describe, expect, it } from "vitest";
import { buildRiderFromLineup, lineupFromPreset, newLineupMember } from "./lineup";

describe("buildRiderFromLineup", () => {
  it("builds a full band with one channel per instrument and a mix per person", () => {
    const content = buildRiderFromLineup({ members: lineupFromPreset("full_band"), monitors: "wedges" });
    const keys = content.inputs.map((input) => input.sourceKey);
    expect(keys.filter((key) => key === "gtr")).toHaveLength(1);
    expect(keys.filter((key) => key === "bass")).toHaveLength(1);
    expect(keys.filter((key) => key === "vox.bgv")).toHaveLength(2);
    // Vocals centre, bass stage right, guitar and keys stage left, drums.
    expect(content.monitorMixes.map((mix) => mix.label)).toEqual(["Vocals", "Bass", "Electric guitar · Keys", "Drums"]);
    // One wedge per mix: three across the front, one at the drums.
    expect(content.items.filter((item) => item.symbol === "wedge")).toHaveLength(4);
    expect(content.performerCount).toBe(5);
    expect(content.inputs.map((input) => input.channel)).toEqual(
      content.inputs.map((_, index, all) =>
        1 + all.slice(0, index).reduce((sum, input) => sum + (input.stereo ? 2 : 1), 0),
      ),
    );
  });

  it("lists channels in patch order: drums, bass, guitars, keys, vocals", () => {
    const content = buildRiderFromLineup({ members: lineupFromPreset("full_band"), monitors: "wedges" });
    const families = content.inputs.map((input) => input.sourceKey?.split(".")[0]);
    expect(families.slice(0, 4)).toEqual(["drum", "drum", "drum", "drum"]);
    expect(families.indexOf("bass")).toBeLessThan(families.indexOf("gtr"));
    expect(families.indexOf("gtr")).toBeLessThan(families.indexOf("keys"));
    expect(content.inputs.at(-1)?.sourceKey).toBe("vox.bgv");
  });

  it("names channels and mixes after the people", () => {
    const sarah = { ...newLineupMember("guitar"), name: "Sarah" };
    const content = buildRiderFromLineup({ members: [sarah], monitors: "iem" });
    expect(content.inputs.find((input) => input.sourceKey === "gtr")?.source).toBe("Sarah");
    expect(content.monitorMixes[0]).toMatchObject({ label: "Sarah", type: "iem" });
  });

  it("keeps to three front wedges plus one for drums, however big the band", () => {
    const members = ["vocals", "vocals", "guitar", "guitar", "bass", "keys", "drums", "horns", "horns", "percussion"].map(
      (role) => newLineupMember(role as never),
    );
    const content = buildRiderFromLineup({ members, monitors: "wedges" });
    expect(content.monitorMixes.length).toBeLessThanOrEqual(4);
    const wedges = content.items.filter((item) => item.symbol === "wedge");
    expect(wedges.length).toBeLessThanOrEqual(4);
    expect(wedges.filter((item) => item.yFt > content.stage.depthFt / 2).length).toBeLessThanOrEqual(3);
    expect(wedges.every((item) => content.monitorMixes.some((mix) => mix.id === item.monitorMixId))).toBe(true);
    expect(content.monitorMixes.reduce((sum, mix) => sum + mix.sends, 0)).toBe(wedges.length);
  });

  it("gives every in-ear its own mix", () => {
    const content = buildRiderFromLineup({ members: lineupFromPreset("full_band"), monitors: "iem" });
    expect(content.monitorMixes).toHaveLength(5);
  });

  it("takes a DI for a guitar without an amp", () => {
    const content = buildRiderFromLineup({ members: [{ ...newLineupMember("guitar"), amp: false }], monitors: "wedges" });
    expect(content.inputs.find((input) => input.sourceKey === "gtr")?.inputType).toBe("di");
    expect(content.items.some((item) => item.symbol === "guitar_amp")).toBe(false);
  });

  it("builds every preset without overlapping the stage edge", () => {
    for (const key of ["full_band", "power_trio", "singer_songwriter", "acoustic_duo", "dj"]) {
      const content = buildRiderFromLineup({ members: lineupFromPreset(key), monitors: "wedges" });
      for (const item of content.items) {
        expect(item.xFt).toBeGreaterThanOrEqual(0);
        expect(item.xFt).toBeLessThanOrEqual(content.stage.widthFt);
        expect(item.yFt).toBeLessThanOrEqual(content.stage.depthFt);
      }
    }
  });
});
