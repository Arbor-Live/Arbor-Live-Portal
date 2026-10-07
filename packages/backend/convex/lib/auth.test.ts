import { describe, expect, it } from "vitest";
import type { QueryCtx } from "../_generated/server";
import { isStaffAdmin, type AuthUser } from "./auth";

type OrgType = "arbor_internal" | "band";

/** Organization profiles by id plus one user's memberships. */
function fakeCtx(opts: {
  profiles: Record<string, OrgType>;
  memberships: Array<{ organizationId: string; role: string; active: boolean }>;
}): QueryCtx {
  return {
    db: {
      query(table: string) {
        return {
          withIndex(_index: string, apply: (q: { eq: (field: string, value: string) => string }) => string) {
            const key = apply({ eq: (_field, value) => value });
            return {
              async unique() {
                if (table !== "organizationProfiles") return null;
                const organizationType = opts.profiles[key];
                return organizationType ? { organizationType } : null;
              },
              async take(limit: number) {
                return opts.memberships.slice(0, limit);
              },
            };
          },
        };
      },
    },
  } as unknown as QueryCtx;
}

const profiles: Record<string, OrgType> = { arbor: "arbor_internal", band: "band" };

function user(role: string): AuthUser {
  return { id: "user-1", role };
}

describe("isStaffAdmin", () => {
  it("accepts an admin role backed by an Arbor-internal admin membership", async () => {
    const ctx = fakeCtx({
      profiles,
      memberships: [{ organizationId: "arbor", role: "org_admin", active: true }],
    });
    expect(await isStaffAdmin(ctx, user("admin"))).toBe(true);
  });

  it("rejects a band org admin whose cached role is still admin", async () => {
    const ctx = fakeCtx({
      profiles,
      memberships: [{ organizationId: "band", role: "org_admin", active: true }],
    });
    expect(await isStaffAdmin(ctx, user("admin"))).toBe(false);
  });

  it("rejects a member role even with an admin-granting membership", async () => {
    const ctx = fakeCtx({
      profiles,
      memberships: [{ organizationId: "arbor", role: "org_admin", active: true }],
    });
    expect(await isStaffAdmin(ctx, user("member"))).toBe(false);
  });

  it("keeps a legacy admin with no membership rows", async () => {
    const ctx = fakeCtx({ profiles, memberships: [] });
    expect(await isStaffAdmin(ctx, user("admin"))).toBe(true);
  });

  it("rejects no user", async () => {
    const ctx = fakeCtx({ profiles, memberships: [] });
    expect(await isStaffAdmin(ctx, null)).toBe(false);
  });
});
