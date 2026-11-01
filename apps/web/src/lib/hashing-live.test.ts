import { describe, expect, it } from "vitest";
import { applyTick } from "./hashing-live";

const live = () => ({
  totals: { total: 3, checked: 1, flagged: 1 },
  areas: [
    {
      checked: 1,
      kits: [{ rows: [{ itemKey: "a:k:1" }, { itemKey: "a:k:2", check: { status: "flagged" } }] }],
      finalChecks: [{ itemKey: "a:final:1" }],
    },
  ],
});
const done = { status: "done" };

describe("applyTick", () => {
  it("ticks an item and bumps both counts", () => {
    const next = applyTick(live(), "a:k:1", true, done);
    expect(next.totals.checked).toBe(2);
    expect(next.areas[0]?.checked).toBe(2);
    expect(next.areas[0]?.kits[0]?.rows[0]?.check).toEqual(done);
  });
  it("counts a final check", () => {
    const next = applyTick(live(), "a:final:1", true, done);
    expect(next.totals.checked).toBe(2);
    expect(next.areas[0]?.checked).toBe(2);
  });
  it("unticks", () => {
    const ticked = applyTick(live(), "a:k:1", true, done);
    const next = applyTick(ticked, "a:k:1", false, done);
    expect(next.totals.checked).toBe(1);
    expect(next.areas[0]?.kits[0]?.rows[0]?.check).toBeUndefined();
  });
  it("is idempotent and leaves flags alone", () => {
    const ticked = applyTick(live(), "a:k:1", true, done);
    expect(applyTick(ticked, "a:k:1", true, done).totals.checked).toBe(2);
    expect(applyTick(live(), "a:k:2", false, done).totals.checked).toBe(1);
  });
});
