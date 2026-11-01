import { describe, expect, it } from "vitest";
import {
  addKit,
  areasUsingKit,
  duplicateKit,
  moveKit,
  removeArea,
  removeKitEverywhere,
  removeKitFromArea,
  shareKit,
  type ChecklistDraft,
} from "./hashing-checklist-draft";

const draft: ChecklistDraft = {
  kits: [
    { id: "shared", name: "Shared", items: [{ id: "s1", text: "One" }] },
    { id: "solo", name: "Solo", items: [{ id: "x1", text: "Two" }] },
  ],
  areas: [
    {
      id: "a",
      name: "A",
      placements: [
        { kitId: "shared", extraItems: [{ id: "e1", text: "Extra" }] },
        { kitId: "solo", extraItems: [] },
      ],
      finalChecks: [],
    },
    { id: "b", name: "B", placements: [{ kitId: "shared", extraItems: [] }], finalChecks: [] },
    { id: "c", name: "C", placements: [], finalChecks: [] },
  ],
};

const kitIds = (result: ChecklistDraft, areaId: string) =>
  result.areas.find((area) => area.id === areaId)?.placements.map((placement) => placement.kitId);

describe("checklist draft", () => {
  it("adds a kit to the end of an area", () => {
    const next = addKit(draft, "c", { id: "new", name: "New" });
    expect(kitIds(next, "c")).toEqual(["new"]);
    expect(next.kits.at(-1)).toEqual({ id: "new", name: "New", items: [] });
  });
  it("moves a kit with its extras", () => {
    const next = moveKit(draft, "shared", "a", "c");
    expect(kitIds(next, "a")).toEqual(["solo"]);
    expect(next.areas[2]?.placements[0]?.extraItems).toEqual([{ id: "e1", text: "Extra" }]);
  });
  it("won't move a kit into an area that already has it", () => {
    expect(moveKit(draft, "shared", "a", "b")).toBe(draft);
  });
  it("duplicates into separate ids right after the original", () => {
    let id = 0;
    const next = duplicateKit(draft, "a", "shared", () => `copy-${(id += 1)}`);
    expect(kitIds(next, "a")).toEqual(["shared", "copy-1", "solo"]);
    expect(next.kits.at(-1)).toEqual({ id: "copy-1", name: "Shared copy", items: [{ id: "copy-2", text: "One" }] });
    expect(next.areas[0]?.placements[1]?.extraItems).toEqual([{ id: "copy-3", text: "Extra" }]);
  });
  it("shares a kit once", () => {
    const next = shareKit(draft, "solo", "b");
    expect(areasUsingKit(next, "solo").map((area) => area.id)).toEqual(["a", "b"]);
    expect(shareKit(next, "solo", "b")).toBe(next);
  });
  it("removing a shared kit from one area keeps it elsewhere", () => {
    const next = removeKitFromArea(draft, "a", "shared");
    expect(kitIds(next, "b")).toEqual(["shared"]);
    expect(next.kits.map((kit) => kit.id)).toEqual(["shared", "solo"]);
  });
  it("removing the last use drops the kit", () => {
    expect(removeKitFromArea(draft, "a", "solo").kits.map((kit) => kit.id)).toEqual(["shared"]);
  });
  it("removes a kit everywhere", () => {
    const next = removeKitEverywhere(draft, "shared");
    expect(kitIds(next, "a")).toEqual(["solo"]);
    expect(kitIds(next, "b")).toEqual([]);
    expect(next.kits.map((kit) => kit.id)).toEqual(["solo"]);
  });
  it("removing an area drops kits only it used", () => {
    expect(removeArea(draft, "a").kits.map((kit) => kit.id)).toEqual(["shared"]);
  });
});
