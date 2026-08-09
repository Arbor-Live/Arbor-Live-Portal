import { describe, expect, it } from "vitest";
import {
  RIDER_SOURCES,
  matchRiderSource,
  riderSource,
  searchRiderSources,
} from "./sources";
import { RIDER_SYMBOLS } from "./symbols";
import {
  backfillSourceKeys,
  emptyRiderContent,
  insertByFamily,
  placeSymbol,
  sourceOrdinals,
} from "./content";

describe("source vocabulary", () => {
  it("has unique keys", () => {
    const keys = RIDER_SOURCES.map((source) => source.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps every symbol seed pointed at a real source", () => {
    for (const symbol of RIDER_SYMBOLS) {
      for (const seed of symbol.defaultInputs ?? []) {
        if (!seed.sourceKey) continue;
        expect(riderSource(seed.sourceKey), `${symbol.key} → ${seed.sourceKey}`).toBeDefined();
      }
    }
  });

  it("has no instance numbering or capture baked into a key", () => {
    for (const source of RIDER_SOURCES) {
      expect(source.key, source.key).not.toMatch(/\d$/);
      expect(source.key, source.key).not.toMatch(/\.(di|mic|stereo|mono|amp|wireless)$/);
    }
  });

  it("lists at least one capture per role, most common first", () => {
    for (const source of RIDER_SOURCES) {
      expect(source.captures.length, source.key).toBeGreaterThan(0);
      const types = source.captures.map((capture) => capture.inputType);
      expect(new Set(types).size, source.key).toBe(types.length);
    }
  });

  it("agrees with its seeds on stereo, so a strip never changes width", () => {
    for (const symbol of RIDER_SYMBOLS) {
      for (const seed of symbol.defaultInputs ?? []) {
        const source = seed.sourceKey ? riderSource(seed.sourceKey) : undefined;
        if (!source) continue;
        expect(seed.stereo ?? false, `${symbol.key} → ${seed.sourceKey}`).toBe(
          source.stereo ?? false,
        );
      }
    }
  });

  it("keeps a short common list for simple setups", () => {
    const common = RIDER_SOURCES.filter((source) => source.common);
    expect(common.length).toBeGreaterThan(10);
    expect(common.length).toBeLessThan(20);
  });
});

describe("matchRiderSource", () => {
  it("matches labels and aliases regardless of spacing or case", () => {
    expect(matchRiderSource("Kick")?.key).toBe("drum.kick");
    expect(matchRiderSource("bass drum")?.key).toBe("drum.kick");
    expect(matchRiderSource("BD")?.key).toBe("drum.kick");
    expect(matchRiderSource("  hi-hat ")?.key).toBe("drum.hat");
  });

  it("gives a shared alias to the more common entry", () => {
    expect(matchRiderSource("sax")?.key).toBe("wind.sax.tenor");
  });

  it("folds capture and instance back onto the role", () => {
    // All of these were separate keys before; they are one role now.
    expect(matchRiderSource("Wireless vocal")?.key).toBe("vox.lead");
    expect(matchRiderSource("Guitar amp")?.key).toBe("gtr");
    expect(matchRiderSource("Guitar DI")?.key).toBe("gtr");
    expect(matchRiderSource("Guitar 2")?.key).toBe("gtr");
    expect(matchRiderSource("Lead vox 3")?.key).toBe("vox.lead");
    expect(matchRiderSource("Bass DI")?.key).toBe("bass");
    expect(matchRiderSource("Bass amp")?.key).toBe("bass");
    expect(matchRiderSource("Keys L")?.key).toBe("keys");
  });

  it("returns nothing rather than guessing", () => {
    expect(matchRiderSource("Jake's weird box")).toBeUndefined();
    expect(matchRiderSource("gtr thing")).toBeUndefined();
  });
});

describe("searchRiderSources", () => {
  it("falls back to the common list when the query is empty", () => {
    expect(searchRiderSources("").every((source) => source.common)).toBe(true);
  });

  it("ranks common entries above the rest", () => {
    const hits = searchRiderSources("vocal");
    expect(hits.length).toBeGreaterThan(1);
    expect(hits[0].common).toBe(true);
  });
});

describe("backfillSourceKeys", () => {
  it("resolves a renamed symbol channel through its provenance", () => {
    const placed = placeSymbol(emptyRiderContent(), {
      symbolKey: "drum_kit",
      xFt: 4,
      yFt: 4,
    });
    // Band renamed every channel and the keys were never stored.
    const legacy = {
      ...placed.content,
      inputs: placed.content.inputs.map((input, index) => ({
        ...input,
        sourceKey: undefined,
        source: `Custom ${index}`,
      })),
    };
    const filled = backfillSourceKeys(legacy);
    expect(filled.inputs.map((input) => input.sourceKey)).toEqual([
      "drum.kick",
      "drum.snare.top",
      "drum.hat",
      "drum.oh",
    ]);
  });

  it("falls back to text for hand-added channels, and leaves the rest alone", () => {
    const content = {
      ...emptyRiderContent(),
      inputs: [
        { id: "a", channel: 1, source: "Bass Guitar", inputType: "di", stand: "none", phantom: false, providedBy: "band" },
        { id: "b", channel: 2, source: "Theremin", inputType: "di", stand: "none", phantom: false, providedBy: "band" },
      ],
    } as ReturnType<typeof emptyRiderContent>;
    const filled = backfillSourceKeys(content);
    expect(filled.inputs[0].sourceKey).toBe("bass");
    expect(filled.inputs[1].sourceKey).toBeUndefined();
  });

  it("never overwrites a key that is already set", () => {
    const content = {
      ...emptyRiderContent(),
      inputs: [
        { id: "a", channel: 1, source: "Kick", sourceKey: "drum.oh", inputType: "mic", stand: "none", phantom: false, providedBy: "band" },
      ],
    } as ReturnType<typeof emptyRiderContent>;
    expect(backfillSourceKeys(content).inputs[0].sourceKey).toBe("drum.oh");
  });
});

describe("sourceOrdinals", () => {
  const input = (id: string, sourceKey?: string) =>
    ({ id, channel: 1, source: id, sourceKey, inputType: "mic", stand: "none", phantom: false, providedBy: "band" }) as never;

  it("numbers repeats and leaves single uses alone", () => {
    const ordinals = sourceOrdinals([
      input("a", "gtr"),
      input("b", "bass"),
      input("c", "gtr"),
      input("d", "gtr"),
    ]);
    expect(ordinals.get("a")).toBe(1);
    expect(ordinals.get("c")).toBe(2);
    expect(ordinals.get("d")).toBe(3);
    expect(ordinals.has("b")).toBe(false);
  });

  it("ignores unmapped channels", () => {
    expect(sourceOrdinals([input("a"), input("b")]).size).toBe(0);
  });
});

describe("backfillSourceKeys after a reorder", () => {
  it("does not mis-map when channels have been dragged out of seed order", () => {
    const placed = placeSymbol(emptyRiderContent(), {
      symbolKey: "drum_kit",
      xFt: 4,
      yFt: 4,
    });
    const stripped = placed.content.inputs.map((input) => ({
      ...input,
      sourceKey: undefined,
    }));
    // Band dragged Overheads to the top; positional matching would call it Kick.
    const reordered = [stripped[3], stripped[0], stripped[1], stripped[2]];
    const filled = backfillSourceKeys({ ...placed.content, inputs: reordered });
    expect(filled.inputs.map((i) => `${i.source}=${i.sourceKey}`)).toEqual([
      "Overheads=drum.oh",
      "Kick=drum.kick",
      "Snare=drum.snare.top",
      "Hi-hat=drum.hat",
    ]);
  });

  it("still resolves a renamed channel positionally as a last resort", () => {
    const placed = placeSymbol(emptyRiderContent(), {
      symbolKey: "drum_kit",
      xFt: 4,
      yFt: 4,
    });
    const renamed = placed.content.inputs.map((input) => ({
      ...input,
      sourceKey: undefined,
      source: "???",
    }));
    const filled = backfillSourceKeys({ ...placed.content, inputs: renamed });
    expect(filled.inputs.map((i) => i.sourceKey)).toEqual([
      "drum.kick",
      "drum.snare.top",
      "drum.hat",
      "drum.oh",
    ]);
  });
});

describe("insertByFamily", () => {
  const row = (id: string, sourceKey?: string) =>
    ({ id, channel: 1, source: id, sourceKey, inputType: "mic", stand: "none", phantom: false, providedBy: "band" }) as never;

  const list = [row("kick", "drum.kick"), row("snare", "drum.snare.top"), row("bass", "bass"), row("vox", "vox.lead")];

  it("lands a new channel after the last of its family, not at the bottom", () => {
    const out = insertByFamily(list, row("hat", "drum.hat"));
    expect(out.map((i) => i.id)).toEqual(["kick", "snare", "hat", "bass", "vox"]);
  });

  it("appends when the family is not represented yet", () => {
    const out = insertByFamily(list, row("sax", "wind.sax.tenor"));
    expect(out.map((i) => i.id)).toEqual(["kick", "snare", "bass", "vox", "sax"]);
  });

  it("appends an unmapped channel, having nothing to group it by", () => {
    const out = insertByFamily(list, row("mystery"));
    expect(out.map((i) => i.id)).toEqual(["kick", "snare", "bass", "vox", "mystery"]);
  });

  it("groups with a family split across the list, joining the later run", () => {
    const split = [row("kick", "drum.kick"), row("bass", "bass"), row("oh", "drum.oh")];
    expect(insertByFamily(split, row("hat", "drum.hat")).map((i) => i.id)).toEqual([
      "kick",
      "bass",
      "oh",
      "hat",
    ]);
  });
});
