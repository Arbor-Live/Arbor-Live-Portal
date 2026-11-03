import { describe, expect, it } from "vitest";
import { buildItemSearchText, isRetired, lifecycleOf } from "./inventoryLifecycle";

const type = { name: "SM58", model: "SM58-LC", manufacturer: "Shure", category: "audio" };

describe("buildItemSearchText", () => {
  it("joins tag, serial and type words in lowercase", () => {
    expect(buildItemSearchText({ assetId: "CASE-A", serialNumber: "SN123" }, type, [])).toBe(
      "case-a sn123 shure sm58 sm58-lc audio",
    );
  });

  it("adds the zero-padded number printed on short numeric tags", () => {
    expect(buildItemSearchText({ assetId: "41" }, null, [])).toBe("41 0041");
    expect(buildItemSearchText({ assetId: "12345" }, null, [])).toBe("12345");
  });

  it("keeps old tags searchable, padded forms included", () => {
    expect(buildItemSearchText({ assetId: "102" }, null, ["7", "OLD-TAG"])).toBe(
      "102 7 old-tag 0102 0007",
    );
  });

  it("skips missing and blank parts", () => {
    expect(
      buildItemSearchText(
        { assetId: undefined, serialNumber: "  " },
        { name: "Cable", model: "", manufacturer: undefined, category: "misc" },
        [],
      ),
    ).toBe("cable misc");
    expect(buildItemSearchText({}, null, [])).toBe("");
  });
});

describe("lifecycleOf", () => {
  it("treats a missing lifecycle as active", () => {
    expect(lifecycleOf({})).toBe("active");
    expect(isRetired({})).toBe(false);
    expect(lifecycleOf({ lifecycle: "in_repair" })).toBe("in_repair");
    expect(isRetired({ lifecycle: "retired" })).toBe(true);
  });
});
