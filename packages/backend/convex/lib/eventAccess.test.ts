import { describe, expect, it } from "vitest";
import type { QueryCtx } from "../_generated/server";
import type { AuthUser } from "./auth";
import { canEditEventForUser } from "./eventAccess";

/** Profiles by user id; only `userAdminProfiles.by_userId` is read. */
function fakeCtx(verticalsByUserId: Record<string, string[]>): QueryCtx {
  return {
    db: {
      query(table: string) {
        return {
          withIndex(_index: string, apply: (q: { eq: (field: string, value: string) => string }) => string) {
            const userId = apply({ eq: (_field, value) => value });
            return {
              async unique() {
                if (table !== "userAdminProfiles") return null;
                const verticals = verticalsByUserId[userId];
                return verticals ? { userId, verticals } : null;
              },
            };
          },
        };
      },
    },
  } as unknown as QueryCtx;
}

const ctx = fakeCtx({ ops: ["Operations"], crew: ["Crew"], lead: ["Crew"] });
const event = { dayOfLeadUserId: "lead", eventManagerUserId: undefined };

function user(id: string, role: string = "member"): AuthUser {
  return { id, role };
}

describe("canEditEventForUser", () => {
  it("lets admins and the Operations team edit any event", async () => {
    expect(await canEditEventForUser(ctx, user("admin", "admin"), event)).toBe(true);
    expect(await canEditEventForUser(ctx, user("ops"), event)).toBe(true);
  });

  it("lets other staff edit only events they lead", async () => {
    expect(await canEditEventForUser(ctx, user("lead"), event)).toBe(true);
    expect(await canEditEventForUser(ctx, user("crew"), event)).toBe(false);
    expect(await canEditEventForUser(ctx, user("nobody"), event)).toBe(false);
  });
});
