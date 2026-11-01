// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { markInvitationAccepted } from "./email/invitations";
import { backfillInviteNotionChecklist } from "./migrations";
import {
  addMembership,
  asUser,
  createOrg,
  createUser,
  makeTest,
  type Test,
} from "./test/setup.helpers";

async function setup() {
  const t = makeTest();
  const admin = await createUser(t, { role: "admin" });
  const arbor = await createOrg(t, { type: "arbor_internal" });
  await addMembership(t, admin._id, arbor.organizationId, "org_admin", true);
  return { t, admin, arbor, as: asUser(t, admin) };
}

const crewArgs = { rateMode: "normal", payrollMethod: "external" } as const;

function insertApplication(t: Test, status: "trainee" | "converted" = "trainee") {
  return t.run(async (ctx) =>
    ctx.db.insert("crewApplications", {
      status,
      name: "Applicant",
      email: "applicant@example.com",
      phone: "555-0100",
      heardAboutUs: "Friend",
      vertical: "Crew",
      stanfordPosition: "undergrad",
      submittedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}

async function convertApplication(t: Test, as: ReturnType<typeof asUser>) {
  const applicationId = await insertApplication(t);
  const result = await as.mutation(api.crewApplications.convertToMember, {
    applicationId,
    ...crewArgs,
  });
  return { ...result, applicationId };
}

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

test("re-inviting a pending crew invite as an advisor removes its checklist", async () => {
  const { t, as, arbor } = await setup();
  const email = "switched@example.com";
  await as.mutation(api.users.inviteUserAdmin, {
    organizationId: arbor.organizationId,
    email,
    ...crewArgs,
  });

  await as.mutation(api.users.inviteUserAdmin, {
    organizationId: arbor.organizationId,
    email,
    inviteKind: "advisor",
  });

  const [invite] = await as.query(api.users.listInvitationsAdmin, {});
  expect(invite.notionChecklist).toBeNull();
  const rows = await t.run(async (ctx) => ctx.db.query("inviteNotionChecklists").collect());
  expect(rows).toHaveLength(0);
});

test("converting a crew application lists an empty checklist", async () => {
  const { t, as } = await setup();
  const { invitationId } = await convertApplication(t, as);

  const invites = await as.query(api.users.listInvitationsAdmin, {});
  const invite = invites.find((row) => row.id === invitationId);
  expect(invite?.notionChecklist).toEqual({ inviteToNotion: false, addToCrewGroup: false });
});

test("the crew application list carries the checklist and shares ticks with invitations", async () => {
  const { t, as } = await setup();
  const { invitationId, applicationId } = await convertApplication(t, as);
  const listed = async () =>
    (await as.query(api.crewApplications.listAdmin, {})).find((row) => row._id === applicationId);

  expect(await listed()).toMatchObject({
    status: "converted",
    invitationId,
    notionChecklist: { inviteToNotion: false, addToCrewGroup: false },
  });

  await as.mutation(api.users.setInviteNotionChecklistItem, {
    invitationId,
    item: "addToCrewGroup",
    done: true,
  });

  expect((await listed())?.notionChecklist).toEqual({
    inviteToNotion: false,
    addToCrewGroup: true,
  });
  const invite = (await as.query(api.users.listInvitationsAdmin, {})).find(
    (row) => row.id === invitationId,
  );
  expect(invite?.notionChecklist).toEqual({ inviteToNotion: false, addToCrewGroup: true });
});

test("an application converted before checklists were linked has no checklist", async () => {
  const { t, as } = await setup();
  const applicationId = await insertApplication(t, "converted");

  const row = (await as.query(api.crewApplications.listAdmin, {})).find(
    (application) => application._id === applicationId,
  );
  expect(row?.invitationId).toBeUndefined();
  expect(row?.notionChecklist).toBeNull();
});

test("the backfill covers crew invites and skips advisor and band invites", async () => {
  const { t, as, admin, arbor } = await setup();
  const band = await createOrg(t, { type: "band" });
  await addMembership(t, admin._id, band.organizationId, "org_admin", true);
  const crew = await as.mutation(api.users.inviteUserAdmin, {
    organizationId: arbor.organizationId,
    email: "pending-crew@example.com",
    ...crewArgs,
  });
  const applicant = await convertApplication(t, as);
  await as.mutation(api.users.inviteUserAdmin, {
    organizationId: arbor.organizationId,
    email: "pending-advisor@example.com",
    inviteKind: "advisor",
  });
  await as.mutation(api.users.inviteUserAdmin, {
    organizationId: band.organizationId,
    email: "pending-band@example.com",
  });

  const covered = await t.run(async (ctx) => {
    for (const row of await ctx.db.query("inviteNotionChecklists").collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db.query("pendingUserInvites").collect()) {
      await backfillInviteNotionChecklist(ctx, row);
    }
    const rows = await ctx.db.query("inviteNotionChecklists").collect();
    return rows.map((row) => row.invitationId).sort();
  });

  expect(covered).toEqual([crew.invitationId, applicant.invitationId].sort());
});

test("listAdmin finds one application by id past the per-status cap", async () => {
  const { t, as } = await setup();
  const ids = await t.run(async (ctx) => {
    const inserted = [];
    for (let submittedAt = 0; submittedAt <= 200; submittedAt += 1) {
      inserted.push(
        await ctx.db.insert("crewApplications", {
          status: "converted",
          name: `Applicant ${submittedAt}`,
          email: `applicant-${submittedAt}@example.com`,
          phone: "555-0100",
          heardAboutUs: "Friend",
          vertical: "Crew",
          stanfordPosition: "undergrad",
          submittedAt,
          createdAt: 1,
          updatedAt: 1,
        }),
      );
    }
    return inserted;
  });
  const oldest = ids[0];

  const capped = await as.query(api.crewApplications.listAdmin, { statuses: ["converted"] });
  expect(capped.map((row) => row._id)).not.toContain(oldest);

  const single = await as.query(api.crewApplications.listAdmin, { applicationId: oldest });
  expect(single.map((row) => row._id)).toEqual([oldest]);
});
