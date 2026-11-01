// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { markInvitationAccepted } from "./email/invitations";
import {
  addMembership,
  asUser,
  createOrg,
  createUser,
  makeTest,
} from "./test/setup.helpers";

async function setup() {
  const t = makeTest();
  const admin = await createUser(t, { role: "admin" });
  const arbor = await createOrg(t, { type: "arbor_internal" });
  await addMembership(t, admin._id, arbor.organizationId, "org_admin", true);
  return { t, admin, arbor, as: asUser(t, admin) };
}

const crewArgs = { rateMode: "normal", payrollMethod: "external" } as const;

test("a crew invite lists an empty checklist, and ticking is reflected", async () => {
  const { as, arbor } = await setup();
  const { invitationId } = await as.mutation(api.users.inviteUserAdmin, {
    organizationId: arbor.organizationId,
    email: "new-crew@example.com",
    ...crewArgs,
  });

  let [invite] = await as.query(api.users.listInvitationsAdmin, {});
  expect(invite.notionChecklist).toEqual({ inviteToNotion: false, addToCrewGroup: false });

  await as.mutation(api.users.setInviteNotionChecklistItem, {
    invitationId,
    item: "inviteToNotion",
    done: true,
  });
  [invite] = await as.query(api.users.listInvitationsAdmin, {});
  expect(invite.notionChecklist).toEqual({ inviteToNotion: true, addToCrewGroup: false });

  await as.mutation(api.users.setInviteNotionChecklistItem, {
    invitationId,
    item: "inviteToNotion",
    done: false,
  });
  [invite] = await as.query(api.users.listInvitationsAdmin, {});
  expect(invite.notionChecklist).toEqual({ inviteToNotion: false, addToCrewGroup: false });
});

test("ticking an already-ticked item keeps its original timestamp", async () => {
  const { t, as, arbor } = await setup();
  const { invitationId } = await as.mutation(api.users.inviteUserAdmin, {
    organizationId: arbor.organizationId,
    email: "idempotent@example.com",
    ...crewArgs,
  });
  const tick = () =>
    as.mutation(api.users.setInviteNotionChecklistItem, {
      invitationId,
      item: "addToCrewGroup",
      done: true,
    });
  const stamp = () =>
    t.run(async (ctx) => {
      const row = await ctx.db
        .query("inviteNotionChecklists")
        .withIndex("by_invitationId", (q) => q.eq("invitationId", invitationId))
        .unique();
      return row?.addToCrewGroup;
    });

  await tick();
  const first = await stamp();
  expect(first).toBeTypeOf("number");
  await new Promise((resolve) => setTimeout(resolve, 5));
  await tick();
  expect(await stamp()).toBe(first);
});

test("re-inviting the same address keeps existing ticks", async () => {
  const { t, as, arbor } = await setup();
  const first = await as.mutation(api.users.inviteUserAdmin, {
    organizationId: arbor.organizationId,
    email: "again@example.com",
    ...crewArgs,
  });
  await as.mutation(api.users.setInviteNotionChecklistItem, {
    invitationId: first.invitationId,
    item: "inviteToNotion",
    done: true,
  });

  const second = await as.mutation(api.users.inviteUserAdmin, {
    organizationId: arbor.organizationId,
    email: "again@example.com",
    ...crewArgs,
  });
  expect(second.invitationId).toBe(first.invitationId);

  const invites = await as.query(api.users.listInvitationsAdmin, {});
  expect(invites).toHaveLength(1);
  expect(invites[0].notionChecklist).toEqual({ inviteToNotion: true, addToCrewGroup: false });
  const rows = await t.run(async (ctx) => ctx.db.query("inviteNotionChecklists").collect());
  expect(rows).toHaveLength(1);
});

test("an accepted invite keeps its ticks and stays editable", async () => {
  const { t, as, arbor } = await setup();
  const { invitationId } = await as.mutation(api.users.inviteUserAdmin, {
    organizationId: arbor.organizationId,
    email: "accepted@example.com",
    ...crewArgs,
  });
  await as.mutation(api.users.setInviteNotionChecklistItem, {
    invitationId,
    item: "inviteToNotion",
    done: true,
  });

  await t.run(async (ctx) => {
    await markInvitationAccepted(ctx, invitationId);
  });

  const [invite] = await as.query(api.users.listInvitationsAdmin, {});
  expect(invite.status).toBe("accepted");
  expect(invite.notionChecklist).toEqual({ inviteToNotion: true, addToCrewGroup: false });

  await as.mutation(api.users.setInviteNotionChecklistItem, {
    invitationId,
    item: "addToCrewGroup",
    done: true,
  });
  const [after] = await as.query(api.users.listInvitationsAdmin, {});
  expect(after.notionChecklist).toEqual({ inviteToNotion: true, addToCrewGroup: true });
});

test("an advisor invite has no checklist and cannot be ticked", async () => {
  const { as, arbor } = await setup();
  const { invitationId } = await as.mutation(api.users.inviteUserAdmin, {
    organizationId: arbor.organizationId,
    email: "advisor@example.com",
    inviteKind: "advisor",
  });

  const [invite] = await as.query(api.users.listInvitationsAdmin, {});
  expect(invite.notionChecklist).toBeNull();
  await expect(
    as.mutation(api.users.setInviteNotionChecklistItem, {
      invitationId,
      item: "inviteToNotion",
      done: true,
    }),
  ).rejects.toThrow(/INVITE_NOTION_CHECKLIST_NOT_FOUND/);
});

test("a band invite has no checklist", async () => {
  const { t, admin } = await setup();
  const band = await createOrg(t, { type: "band" });
  await addMembership(t, admin._id, band.organizationId, "org_admin", true);
  await asUser(t, admin).mutation(api.users.inviteUserAdmin, {
    organizationId: band.organizationId,
    email: "member@example.com",
  });

  const [invite] = await asUser(t, admin).query(api.users.listInvitationsAdmin, {});
  expect(invite.notionChecklist).toBeNull();
});

test("a non-admin cannot tick an item", async () => {
  const { t, as, arbor } = await setup();
  const { invitationId } = await as.mutation(api.users.inviteUserAdmin, {
    organizationId: arbor.organizationId,
    email: "guarded@example.com",
    ...crewArgs,
  });
  const member = await createUser(t, { role: "member" });
  await addMembership(t, member._id, arbor.organizationId, "member", true);

  await expect(
    asUser(t, member).mutation(api.users.setInviteNotionChecklistItem, {
      invitationId,
      item: "inviteToNotion",
      done: true,
    }),
  ).rejects.toThrow(/Admin access required/);

  const [invite] = await as.query(api.users.listInvitationsAdmin, {});
  expect(invite.notionChecklist).toEqual({ inviteToNotion: false, addToCrewGroup: false });
});
