import { describe, expect, test } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { pickShowRider } from "./showRider";

function rider(
  id: string,
  fields: Partial<Pick<Doc<"bandRiders">, "status" | "isDefault" | "updatedAt">> = {},
) {
  return {
    _id: id as Id<"bandRiders">,
    status: "published",
    isDefault: false,
    updatedAt: 0,
    ...fields,
  } as Doc<"bandRiders">;
}

describe("pickShowRider", () => {
  const fullBand = rider("full", { isDefault: true, updatedAt: 1 });
  const acoustic = rider("acoustic", { updatedAt: 2 });
  const draftDuo = rider("duo", { status: "draft", updatedAt: 3 });

  test("uses the act's default rider when nothing is picked", () => {
    expect(pickShowRider([fullBand, acoustic], undefined)).toEqual({
      rider: fullBand,
      chosenForShow: false,
    });
  });

  test("a rider picked for the show wins over the default", () => {
    expect(pickShowRider([fullBand, acoustic], acoustic._id)).toEqual({
      rider: acoustic,
      chosenForShow: true,
    });
  });

  test("falls back to the default when the picked rider was deleted", () => {
    expect(pickShowRider([fullBand], acoustic._id)).toEqual({
      rider: fullBand,
      chosenForShow: false,
    });
  });

  test("the printed brief skips a picked draft and takes the published default", () => {
    expect(pickShowRider([fullBand, draftDuo], draftDuo._id, { publishedOnly: true })).toEqual({
      rider: fullBand,
      chosenForShow: false,
    });
    // On screen the draft pick still applies.
    expect(pickShowRider([fullBand, draftDuo], draftDuo._id).rider).toBe(draftDuo);
  });

  test("without a default, takes the latest published rider", () => {
    const older = rider("older", { updatedAt: 1 });
    const newer = rider("newer", { updatedAt: 5 });
    expect(pickShowRider([older, newer, draftDuo], undefined).rider).toBe(newer);
  });
});
