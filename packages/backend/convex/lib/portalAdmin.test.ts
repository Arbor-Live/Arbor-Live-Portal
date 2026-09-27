import { describe, expect, it } from "vitest";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isPortalAdmin } from "./auth";

type OrgType = "arbor_internal" | "band";

function fakeCtx(opts: {
  profiles: Record<string, OrgType>;
  memberships?: Array<{ organizationId: string; role: string; active: boolean }>;
}): QueryCtx | MutationCtx {
  return {
    db: {
      query(table: string) {
        return {
          withIndex(
            _index: string,
            apply: (q: { eq: (field: string, value: string) => string }) => string,
          ) {
            const key = apply({ eq: (_field, value) => value });
            return {
              async unique() {
                if (table !== "organizationProfiles") return null;
                const organizationType = opts.profiles[key];
                return organizationType ? { organizationType } : null;
              },
              async take(limit: number) {
                if (table !== "userOrganizationMemberships") return [];
                return (opts.memberships ?? []).slice(0, limit);
              },
            };
          },
        };
      },
    },
  } as unknown as QueryCtx;
}

describe("isPortalAdmin", () => {
  it("keeps an Arbor Live administrator", async () => {
    const ctx = fakeCtx({
      profiles: { arbor: "arbor_internal" },
      memberships: [{ organizationId: "arbor", role: "org_admin", active: true }],
    });
    expect(await isPortalAdmin(ctx, "user-1")).toBe(true);
  });

  it("rejects a band org admin so staff email never reaches them", async () => {
    const ctx = fakeCtx({
      profiles: { arbor: "arbor_internal", band: "band" },
      memberships: [{ organizationId: "band", role: "org_admin", active: true }],
    });
    expect(await isPortalAdmin(ctx, "user-1")).toBe(false);
  });

  it("keeps a legacy admin with no memberships", async () => {
    const ctx = fakeCtx({ profiles: {}, memberships: [] });
    expect(await isPortalAdmin(ctx, "user-1")).toBe(true);
  });

  it("rejects a removed band admin left with only inactive memberships", async () => {
    const ctx = fakeCtx({
      profiles: { band: "band" },
      memberships: [{ organizationId: "band", role: "org_admin", active: false }],
    });
    expect(await isPortalAdmin(ctx, "user-1")).toBe(false);
  });

  it("keeps an Arbor admin who is also in a band", async () => {
    const ctx = fakeCtx({
      profiles: { arbor: "arbor_internal", band: "band" },
      memberships: [
        { organizationId: "band", role: "org_admin", active: true },
        { organizationId: "arbor", role: "admin", active: true },
      ],
    });
    expect(await isPortalAdmin(ctx, "user-1")).toBe(true);
  });
});
