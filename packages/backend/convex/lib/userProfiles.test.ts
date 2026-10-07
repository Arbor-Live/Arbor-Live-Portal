import { describe, expect, it } from "vitest";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { loadAdminProfilesByStatus } from "./userProfiles";

type Profile = Doc<"userAdminProfiles">;

function row(userId: string, status: string | undefined, extra: Record<string, unknown> = {}): Profile {
  return { userId, status, createdAt: 0, updatedAt: 0, ...extra } as unknown as Profile;
}

/** Key for rows with no stored `status` (looked up with `eq("status", undefined)`). */
const UNSET = "__unset__";

/** Rows keyed by stored `status`; only `userAdminProfiles.by_status` is read. */
function fakeCtx(rowsByStatus: Record<string, Profile[]>): QueryCtx {
  return {
    db: {
      query(table: string) {
        return {
          withIndex(
            index: string,
            apply: (q: { eq: (field: string, value: string | undefined) => string }) => string,
          ) {
            expect(table).toBe("userAdminProfiles");
            expect(index).toBe("by_status");
            const status = apply({
              eq: (field, value) => {
                expect(field).toBe("status");
                return value ?? UNSET;
              },
            });
            return {
              async take(numItems: number) {
                return (rowsByStatus[status] ?? []).slice(0, numItems);
              },
            };
          },
        };
      },
    },
  } as unknown as QueryCtx;
}

describe("loadAdminProfilesByStatus", () => {
  it("returns only the requested statuses", async () => {
    const ctx = fakeCtx({
      active: [row("a", "active")],
      inactive: [row("i", "inactive")],
      alumni: [row("x", "alumni")],
    });
    const rows = await loadAdminProfilesByStatus(ctx, ["active"]);
    expect(rows.map((profile) => profile.userId)).toEqual(["a"]);
  });

  it("unions several statuses", async () => {
    const active = Array.from({ length: 501 }, (_, i) => row(`a${i}`, "active"));
    const ctx = fakeCtx({ active, inactive: [row("i1", "inactive")] });
    const rows = await loadAdminProfilesByStatus(ctx, ["active", "inactive"]);
    expect(rows).toHaveLength(502);
    expect(rows.some((profile) => profile.userId === "a500")).toBe(true);
    expect(rows.some((profile) => profile.userId === "i1")).toBe(true);
  });

  it("classifies legacy rows with no stored status like resolveUserStatus", async () => {
    const ctx = fakeCtx({
      active: [row("a", "active")],
      [UNSET]: [row("legacy-active", undefined), row("legacy-alumni", undefined, { active: false })],
    });
    const active = await loadAdminProfilesByStatus(ctx, ["active"]);
    expect(active.map((profile) => profile.userId).sort()).toEqual(["a", "legacy-active"]);
    const alumni = await loadAdminProfilesByStatus(ctx, ["alumni"]);
    expect(alumni.map((profile) => profile.userId)).toEqual(["legacy-alumni"]);
  });

  it("refuses to return a partial roster past the read cap", async () => {
    const many = Array.from({ length: 5_001 }, (_, i) => row(`u${i}`, "active"));
    const ctx = fakeCtx({ active: many });
    await expect(loadAdminProfilesByStatus(ctx, ["active"])).rejects.toThrow(
      /exceeded 5000 rows/,
    );
  });
});
