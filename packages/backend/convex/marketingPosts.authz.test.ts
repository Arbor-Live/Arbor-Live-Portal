// @vitest-environment edge-runtime
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  addMembership,
  asUser,
  createOrg,
  createUser,
  makeTest,
  setActiveOrg,
  type Test,
} from "./test/setup.helpers";

async function member(
  t: Test,
  arbor: { organizationId: string },
  verticals: ("Crew" | "Operations" | "Marketing")[],
) {
  const user = await createUser(t, {});
  await addMembership(t, user._id, arbor.organizationId, "member", true);
  await setActiveOrg(t, user._id, arbor.organizationId);
  await t.run(async (ctx) => {
    await ctx.db.insert("userAdminProfiles", {
      userId: user._id,
      status: "active",
      verticals,
      disciplines: ["Design"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  return asUser(t, user);
}

describe("work posts are Marketing-team work", () => {
  test("a Marketing member who is not an admin can list, create and edit posts", async () => {
    const t = makeTest();
    const arbor = await createOrg(t, { type: "arbor_internal" });
    const marketer = await member(t, arbor, ["Crew", "Marketing"]);

    const postId = await marketer.mutation(api.marketingPosts.create, {
      title: "Spring showcase recap",
      kind: "case_study",
    });
    await marketer.mutation(api.marketingPosts.update, {
      id: postId,
      title: "Spring showcase recap, with photos",
    });

    const posts = await marketer.query(api.marketingPosts.listAdmin, {});
    expect(posts.map((post) => post._id)).toContain(postId);
  });

  test("crew outside Marketing are still refused", async () => {
    const t = makeTest();
    const arbor = await createOrg(t, { type: "arbor_internal" });
    const crew = await member(t, arbor, ["Crew"]);

    await expect(crew.query(api.marketingPosts.listAdmin, {})).rejects.toThrow(
      "Marketing team access required.",
    );
    await expect(
      crew.mutation(api.inventoryR2.generateR2UploadUrl, {
        scope: "marketing",
        purpose: "hero",
        marketingImageKind: "hero",
        fileName: "cover.jpg",
        contentType: "image/jpeg",
        contentLength: 1024,
        uploadId: "upload-1",
      }),
    ).rejects.toThrow("Marketing team access required.");
  });
});
