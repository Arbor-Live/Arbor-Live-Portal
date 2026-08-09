import { describe, expect, it } from "vitest";
import { inputFamilyLabel, renumberInputs } from "./content";
import type { RiderInputChannel } from "./types";

function input(id: string, stereo = false): RiderInputChannel {
  return { id, label: id, channel: 0, stereo } as RiderInputChannel;
}


describe("renumberInputs", () => {
  it("keeps sequential numbers for all-mono inputs", () => {
    expect(renumberInputs([input("a"), input("b"), input("c")]).map((i) => i.channel)).toEqual([1, 2, 3]);
  });

  it("keeps odd-start stereo pairs and advances by two", () => {
    expect(renumberInputs([input("a", true), input("b", true)]).map((i) => i.channel)).toEqual([1, 3]);
  });

  it("pulls the next mono into an even slot vacated by stereo", () => {
    const out = renumberInputs([input("a"), input("b", true), input("c")]);
    expect(out.map((i) => `${i.id}:${i.channel}`)).toEqual(["a:1", "b:3", "c:2"]);
  });

  it("bumps the preceding mono when stereo lands at the tail", () => {
    const out = renumberInputs([input("a"), input("b"), input("c"), input("d", true)]);
    expect(out.map((i) => `${i.id}:${i.channel}`)).toEqual(["a:1", "b:2", "c:5", "d:3"]);
  });

  it("leaves no empty slots (slot 4 case)", () => {
    const out = renumberInputs([input("a"), input("b"), input("c"), input("d", true)]);
    const occupied = out.flatMap((i) => [i.channel, i.stereo ? i.channel + 1 : undefined]);
    expect([1, 2, 3, 4, 5].every((slot) => occupied.includes(slot))).toBe(true);
  });
});


describe("inputFamilyLabel", () => {
  const channel = (sourceKey?: string) =>
    ({ id: "x", channel: 1, source: "x", sourceKey, inputType: "mic", stand: "none", phantom: false, providedBy: "band" }) as never;

  it("derives the heading from the role", () => {
    expect(inputFamilyLabel(channel("drum.kick"))).toBe("Drums");
    expect(inputFamilyLabel(channel("vox.lead"))).toBe("Vocals");
    expect(inputFamilyLabel(channel("wind.sax.tenor"))).toBe("Brass & winds");
  });

  it("has no heading for an unmapped channel", () => {
    expect(inputFamilyLabel(channel())).toBeNull();
  });
});
