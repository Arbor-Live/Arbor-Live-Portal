import { describe, expect, it } from "vitest";
import { inputFamilyLabel, renumberInputs } from "./content";
import type { RiderInputChannel } from "./types";

function input(id: string, stereo = false): RiderInputChannel {
  return { id, label: id, channel: 0, stereo } as unknown as RiderInputChannel;
}


describe("renumberInputs", () => {
  it("keeps sequential numbers for all-mono inputs", () => {
    expect(renumberInputs([input("a"), input("b"), input("c")]).map((i) => i.channel)).toEqual([1, 2, 3]);
  });

  it("gives a stereo pair the next two numbers, in list order", () => {
    const out = renumberInputs([input("a"), input("b", true), input("c")]);
    expect(out.map((i) => `${i.id}:${i.channel}`)).toEqual(["a:1", "b:2", "c:4"]);
  });

  it("numbers back-to-back stereo pairs without gaps", () => {
    expect(renumberInputs([input("a", true), input("b", true)]).map((i) => i.channel)).toEqual([1, 3]);
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
