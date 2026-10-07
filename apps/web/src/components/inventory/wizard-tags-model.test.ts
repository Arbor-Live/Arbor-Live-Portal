import { describe, expect, it } from "vitest";
import { applyLabelScan, emptyTag, type WizardTag } from "./wizard-tags-model";

function tag(patch: Partial<WizardTag> = {}): WizardTag {
  return { ...emptyTag(), ...patch };
}

function tagsOf(result: ReturnType<typeof applyLabelScan>): WizardTag[] {
  if ("error" in result) throw new Error(result.error);
  return result.tags;
}

describe("applyLabelScan", () => {
  it("fills Asset ID from a label, then Serial from a barcode, on the same asset", () => {
    const afterLabel = tagsOf(applyLabelScan([tag()], "https://arbor.st/e/ALE-0099", new Set()));
    const afterSerial = tagsOf(applyLabelScan(afterLabel, "SN8834KX19", new Set()));
    expect(afterSerial).toHaveLength(1);
    expect(afterSerial[0]).toMatchObject({ assetId: "99", serialNumber: "SN8834KX19" });
  });

  it("starts the next asset when the field is taken, keeping location and container", () => {
    const first = tag({ assetId: "99", serialNumber: "SN1", storageLocationId: "loc", containedInAssetId: "7" });
    const next = tagsOf(applyLabelScan([first], "ALE-0100", new Set()));
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({
      assetId: "100",
      serialNumber: "",
      storageLocationId: "loc",
      containedInAssetId: "7",
    });
  });

  it("refuses a code already in the batch or already in inventory", () => {
    expect(applyLabelScan([tag({ assetId: "99" })], "ALE-0099", new Set())).toEqual({
      error: "Asset ID 99 is already in this batch.",
    });
    expect(applyLabelScan([tag({ serialNumber: "SN1" })], "SN1", new Set())).toEqual({
      error: "Serial SN1 is already in this batch.",
    });
    expect(applyLabelScan([tag()], "ALE-0041", new Set(["41"]))).toEqual({
      error: "Asset ID already exists: 41",
    });
  });

  it("rejects a link that holds no asset id", () => {
    expect("error" in applyLabelScan([tag()], "https://example.com/manual", new Set())).toBe(true);
  });
});
