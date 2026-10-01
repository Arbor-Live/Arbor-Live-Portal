import { describe, expect, it } from "vitest";
import { emptyRiderContent, placeSymbol, removeItem } from "./content";
import type { RiderContent } from "./types";

function place(content: RiderContent, symbolKey: string, xFt = 4, yFt = 6) {
  return placeSymbol(content, { symbolKey, xFt, yFt });
}

const guitarChannels = (content: RiderContent) => content.inputs.filter((input) => input.sourceKey === "gtr");

describe("one instrument, one channel", () => {
  it("moves the player's channel onto their amp instead of adding a second", () => {
    const player = place(emptyRiderContent(), "guitarist");
    const amp = place(player.content, "guitar_amp", 4, 3);
    expect(guitarChannels(amp.content)).toHaveLength(1);
    expect(guitarChannels(amp.content)[0].stageItemId).toBe(amp.itemId);
  });

  it("doesn't add a channel for a player whose amp is already miked", () => {
    const amp = place(emptyRiderContent(), "guitar_amp", 4, 3);
    const player = place(amp.content, "guitarist");
    expect(guitarChannels(player.content)).toHaveLength(1);
    expect(guitarChannels(player.content)[0].stageItemId).toBe(amp.itemId);
  });

  it("keeps one channel per guitar with two players and two amps", () => {
    let content = place(emptyRiderContent(), "guitarist", 4, 6).content;
    content = place(content, "guitarist", 18, 6).content;
    content = place(content, "guitar_amp", 4, 3).content;
    content = place(content, "guitar_amp", 18, 3).content;
    expect(guitarChannels(content)).toHaveLength(2);
  });

  it("hands the channel back to the player when the amp goes", () => {
    const player = place(emptyRiderContent(), "guitarist");
    const amp = place(player.content, "guitar_amp", 4, 3);
    const after = removeItem(amp.content, amp.itemId);
    expect(guitarChannels(after)).toHaveLength(1);
    expect(guitarChannels(after)[0].stageItemId).toBe(player.itemId);
  });

  it("removes the channel with an amp nobody plays", () => {
    const amp = place(emptyRiderContent(), "guitar_amp", 4, 3);
    expect(guitarChannels(removeItem(amp.content, amp.itemId))).toHaveLength(0);
  });

  it("still gives a vocalist and a vocal mic their own channels", () => {
    const singer = place(emptyRiderContent(), "vocalist");
    const mic = place(singer.content, "vocal_mic", 8, 6);
    expect(mic.content.inputs).toHaveLength(2);
  });
});

describe("drum kit defaults", () => {
  it("mics kick, snare, two toms and a stereo pair of overheads", () => {
    const kit = place(emptyRiderContent(), "drum_kit", 8, 4);
    expect(kit.content.inputs.map((input) => `${input.channel}:${input.source}`)).toEqual([
      "1:Kick",
      "2:Snare",
      "3:Tom 1",
      "4:Tom 2",
      "5:Overheads",
    ]);
    expect(kit.content.inputs.at(-1)?.stereo).toBe(true);
  });
});
