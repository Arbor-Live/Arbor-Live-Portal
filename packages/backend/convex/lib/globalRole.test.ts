import { describe, expect, it } from "vitest";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  activeMembershipsForGlobalRole,
  resolveGlobalRoleForExistingUser,
  resolveGlobalRoleForOrganization,
} from "./globalRole";

type OrgType = "arbor_internal" | "band";

function fakeCtx(opts: {
  profiles: Record<string, OrgType>;
  memberships?: Array<{ organizationId: string; role: string; active: boolean }>;
}): QueryCtx | MutationCtx {
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
                const rows = opts.memberships ?? [];
                return rows.slice(0, limit);
              },
            };
          },
        };
      },
    },
  } as unknown as QueryCtx;
}

describe("resolveGlobalRoleForOrganization", () => {
  it("grants admin only for an Arbor internal administrator", async () => {
    const ctx = fakeCtx({
      profiles: { arbor: "arbor_internal", band: "band" },
    });
    expect(await resolveGlobalRoleForOrganization(ctx, "arbor", "org_admin")).toBe("admin");
    expect(await resolveGlobalRoleForOrganization(ctx, "band", "org_admin")).toBe("member");
    expect(await resolveGlobalRoleForOrganization(ctx, "arbor", "member")).toBe("member");
  });
});

describe("activeMembershipsForGlobalRole", () => {
  it("keeps other active memberships and replaces the org being written", () => {
    expect(
      activeMembershipsForGlobalRole(
        [
          { organizationId: "arbor", role: "org_admin", active: true },
          { organizationId: "band", role: "org_admin", active: true },
          { organizationId: "old", role: "org_admin", active: false },
        ],
        { organizationId: "band", role: "member" },
      ),
    ).toEqual([
      { organizationId: "arbor", role: "org_admin" },
      { organizationId: "band", role: "member" },
    ]);
  });
});

describe("resolveGlobalRoleForExistingUser", () => {
  it("keeps platform admin when an Arbor admin is added to a band", async () => {
    const ctx = fakeCtx({
      profiles: { arbor: "arbor_internal", band: "band" },
      memberships: [{ organizationId: "arbor", role: "org_admin", active: true }],
    });
    expect(
      await resolveGlobalRoleForExistingUser(ctx, "user-1", {
        organizationId: "band",
        role: "member",
      }),
    ).toBe("admin");
  });

  it("grants admin when the new membership is the Arbor administrator role", async () => {
    const ctx = fakeCtx({
      profiles: { arbor: "arbor_internal", band: "band" },
      memberships: [{ organizationId: "band", role: "org_admin", active: true }],
    });
    expect(
      await resolveGlobalRoleForExistingUser(ctx, "user-1", {
        organizationId: "arbor",
        role: "org_admin",
      }),
    ).toBe("admin");
  });

  it("drops admin when the Arbor administrator membership is changed to member", async () => {
    const ctx = fakeCtx({
      profiles: { arbor: "arbor_internal" },
      memberships: [{ organizationId: "arbor", role: "org_admin", active: true }],
    });
    expect(
      await resolveGlobalRoleForExistingUser(ctx, "user-1", {
        organizationId: "arbor",
        role: "member",
      }),
    ).toBe("member");
  });

  it("refuses to recompute from a truncated membership list", async () => {
    const memberships = Array.from({ length: 101 }, (_, index) => ({
      organizationId: `org-${index}`,
      role: "member",
      active: true,
    }));
    const ctx = fakeCtx({ profiles: {}, memberships });
    await expect(
      resolveGlobalRoleForExistingUser(ctx, "user-1", {
        organizationId: "band",
        role: "member",
      }),
    ).rejects.toThrow(/max 100/);
  });
});
