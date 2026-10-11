/// <reference types="vite/client" />
import {
  convexTest,
  type TestConvexForDataModel,
  type TestConvex,
} from "convex-test";
import { components } from "../_generated/api";
import type { DataModel, Id } from "../_generated/dataModel";
import betterAuthSchema from "../betterAuth/schema";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");
const betterAuthModules = import.meta.glob("../betterAuth/**/*.ts");

export type Test = TestConvexForDataModel<DataModel>;

export type TestUser = {
  _id: string;
  email: string;
  name: string;
};

export type TestOrg = {
  organizationId: string;
  name: string;
  slug: string;
  type: "arbor_internal" | "band";
};

export function makeTest(): TestConvex<typeof schema> {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);
  return t;
}

let userSeq = 0;

export async function createUser(
  t: Test,
  opts: { role?: "admin" | "member"; email?: string; name?: string } = {},
): Promise<TestUser> {
  userSeq += 1;
  const name = opts.name ?? `Test User ${userSeq}`;
  const email = opts.email ?? `test-user-${userSeq}@arbor.test`;
  const now = Date.now();
  const created = (await t.run(async (ctx) =>
    ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "user",
        data: {
          email,
          name,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
          role: opts.role ?? "member",
        },
      },
    }),
  )) as { _id?: string };
  if (!created?._id) throw new Error("createUser: adapter did not return _id");
  return { _id: created._id, email, name };
}

let orgSeq = 0;

export async function createOrg(
  t: Test,
  opts: { type: "arbor_internal" | "band"; name?: string },
): Promise<TestOrg> {
  orgSeq += 1;
  const name = opts.name ?? (opts.type === "arbor_internal" ? "Arbor Live" : `Test Band ${orgSeq}`);
  const slug =
    opts.type === "arbor_internal"
      ? "arbor-live"
      : `test-band-${orgSeq}`;
  const now = Date.now();
  const created = (await t.run(async (ctx) =>
    ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "organization",
        data: { name, slug, createdAt: now },
      },
    }),
  )) as { _id?: string; id?: string };
  const organizationId = created?.id ?? created?._id;
  if (!organizationId) {
    throw new Error("createOrg: adapter did not return an organization id");
  }
  await t.run(async (ctx) => {
    await ctx.db.insert("organizationProfiles", {
      organizationId,
      organizationType: opts.type,
      displayName: name,
      updatedAt: now,
    });
  });
  return { organizationId, name, slug, type: opts.type };
}

export async function addMembership(
  t: Test,
  userId: string,
  organizationId: string,
  role: string,
  active = true,
): Promise<Id<"userOrganizationMemberships">> {
  const now = Date.now();
  return await t.run(async (ctx) =>
    ctx.db.insert("userOrganizationMemberships", {
      userId,
      organizationId,
      role,
      active,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

export async function setActiveOrg(
  t: Test,
  userId: string,
  organizationId: string,
): Promise<void> {
  const now = Date.now();
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("userActiveOrganizations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { organizationId, updatedAt: now });
    } else {
      await ctx.db.insert("userActiveOrganizations", {
        userId,
        organizationId,
        updatedAt: now,
      });
    }
  });
}

export function asUser(t: Test, user: TestUser): Test {
  return t.withIdentity({ subject: user._id, email: user.email });
}
