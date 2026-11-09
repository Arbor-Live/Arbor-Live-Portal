// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { HASHING_DEFAULTS } from "./lib/hashing";
import { collectReferencedR2Keys } from "./lib/r2Lifecycle";
import {
  addMembership,
  asUser,
  createOrg,
  createUser,
  makeTest,
  setActiveOrg,
  type Test,
} from "./test/setup.helpers";

const released = vi.hoisted(() => ({ keys: [] as string[] }));

vi.mock("./inventoryR2", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./inventoryR2")>()),
  inventoryR2: {
    deleteObject: async (_ctx: unknown, key: string) => {
      released.keys.push(key);
    },
  },
}));

/** Sunday of week 6 of Autumn 2026. Tuesdays run Nov 3 through Dec 8. */
const NOW = new Date("2026-11-01T20:00:00Z").getTime();
const SETUP = { ...HASHING_DEFAULTS };
const photoRef = (name: string) => `r2:hashing/reference/${name}.jpg`;
const KIT = "event-kit";
const ITEM_LINE = "event-kit-1";
const AREA = "large-packout";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("R2_PUBLIC_BASE_URL", "https://photos.test");
  released.keys.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function member(t: Test, arbor: { organizationId: string }, verticals: ("Crew" | "Operations")[], name: string) {
  const user = await createUser(t, { name });
  await addMembership(t, user._id, arbor.organizationId, "member", true);
  await setActiveOrg(t, user._id, arbor.organizationId);
  await t.run(async (ctx) => {
    await ctx.db.insert("userAdminProfiles", {
      userId: user._id,
      status: "active",
      verticals,
      disciplines: ["Sound"],
      includeInTimecards: verticals.includes("Crew") ? undefined : false,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });
  return user;
}

/** A running hash with Ana and Ben booked; Cara is crew but isn't on it. */
async function running() {
  const t = makeTest();
  const arbor = await createOrg(t, { type: "arbor_internal" });
  const ops = await member(t, arbor, ["Operations"], "Olive Ops");
  const ana = await member(t, arbor, ["Crew"], "Ana Crew");
  const ben = await member(t, arbor, ["Crew"], "Ben Crew");
  const cara = await member(t, arbor, ["Crew"], "Cara Crew");
  const opsApi = asUser(t, ops);
  await opsApi.mutation(api.hashingSchedule.saveSetup, SETUP);
  const dates = await t.run(async (ctx) => ctx.db.query("hashDates").collect());
  const hashDateId = dates.find((row) => row.dateKey === "2026-11-03")!._id;
  await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ana._id });
  await opsApi.mutation(api.hashingSchedule.bookPerson, { hashDateId, userId: ben._id });
  await opsApi.mutation(api.hashingLive.start, { hashDateId });
  return {
    t,
    hashDateId,
    dates,
    opsApi,
    anaApi: asUser(t, ana),
    benApi: asUser(t, ben),
    caraApi: asUser(t, cara),
  };
}

type Running = Awaited<ReturnType<typeof running>>;

function submitKitPhoto({ anaApi, hashDateId }: Running, name = "stands") {
  return anaApi.mutation(api.hashingPhotos.submit, {
    hashDateId,
    level: "kit",
    targetId: KIT,
    photo: photoRef(name),
  });
}

async function onlyPhotoId(t: Test) {
  const rows = await t.run(async (ctx) => ctx.db.query("hashReferencePhotos").collect());
  expect(rows).toHaveLength(1);
  return rows[0]!._id as Id<"hashReferencePhotos">;
}

describe("submitting and seeing photos", () => {
  test("crew on the hash submits a photo that waits for review", async () => {
    const context = await running();
    await submitKitPhoto(context);
    const rows = await context.t.run(async (ctx) => ctx.db.query("hashReferencePhotos").collect());
    expect(rows).toMatchObject([
      { status: "pending", level: "kit", targetId: KIT, r2Key: "hashing/reference/stands.jpg", hashDateId: context.hashDateId },
    ]);
  });

  test("the sender sees it as in review and nobody else does", async () => {
    const context = await running();
    await submitKitPhoto(context);
    const { hashDateId } = context;

    const mine = await context.anaApi.query(api.hashingPhotos.forHash, { hashDateId });
    expect(mine.photos).toMatchObject([
      { level: "kit", targetId: KIT, status: "pending", mine: true, byName: "Ana Crew", url: "https://photos.test/hashing/reference/stands.jpg" },
    ]);
    expect((await context.benApi.query(api.hashingPhotos.forHash, { hashDateId })).photos).toEqual([]);
    expect((await context.opsApi.query(api.hashingPhotos.forHash, { hashDateId })).photos).toEqual([]);
  });

  test("approving shows it to everyone and never publishes a checklist version", async () => {
    const context = await running();
    await submitKitPhoto(context);
    const photoId = await onlyPhotoId(context.t);
    await context.opsApi.mutation(api.hashingPhotos.approve, { photoId });
    await context.opsApi.mutation(api.hashingPhotos.approve, { photoId });

    for (const api_ of [context.anaApi, context.benApi]) {
      const seen = await api_.query(api.hashingPhotos.forHash, { hashDateId: context.hashDateId });
      expect(seen.photos).toMatchObject([{ _id: photoId, status: "approved", byName: "Ana Crew" }]);
    }
    const versions = await context.t.run(async (ctx) => ctx.db.query("hashChecklistVersions").collect());
    expect(versions).toHaveLength(1);
    const row = await context.t.run(async (ctx) => ctx.db.get(photoId));
    expect(row).toMatchObject({ status: "approved", reviewedAt: NOW });
  });

  test("only ops get the review flag", async () => {
    const context = await running();
    expect((await context.opsApi.query(api.hashingPhotos.forHash, { hashDateId: context.hashDateId })).canReview).toBe(true);
    expect((await context.anaApi.query(api.hashingPhotos.forHash, { hashDateId: context.hashDateId })).canReview).toBe(false);
  });

  test("a kit photo keeps showing after a new checklist version is published", async () => {
    const context = await running();
    await submitKitPhoto(context);
    await context.opsApi.mutation(api.hashingPhotos.approve, { photoId: await onlyPhotoId(context.t) });

    const { version, tree } = await context.opsApi.query(api.hashingChecklist.getCurrent, {});
    const edited = { ...tree, areas: tree.areas.filter((area) => area.id !== "red-shelf") };
    edited.kits = edited.kits.filter((kit) => kit.id !== "red-shelf");
    await context.opsApi.mutation(api.hashingChecklist.publish, { baseVersion: version, ...edited });

    const next = context.dates.find((row) => row.dateKey === "2026-11-10")!._id;
    await context.opsApi.mutation(api.hashingLive.start, { hashDateId: next });
    const seen = await context.benApi.query(api.hashingPhotos.forHash, { hashDateId: next });
    expect(seen.photos).toMatchObject([{ level: "kit", targetId: KIT, status: "approved" }]);
  });
});

describe("what a photo can be attached to", () => {
  test("an area, a kit and an item on the checklist are accepted", async () => {
    const context = await running();
    for (const [level, targetId] of [["area", AREA], ["kit", KIT], ["item", ITEM_LINE]] as const) {
      await context.anaApi.mutation(api.hashingPhotos.submit, {
        hashDateId: context.hashDateId,
        level,
        targetId,
        photo: photoRef(level),
      });
    }
    const rows = await context.t.run(async (ctx) => ctx.db.query("hashReferencePhotos").collect());
    expect(rows.map((row) => row.level).sort()).toEqual(["area", "item", "kit"]);
  });

  test("an unknown target is refused, and so is the right id at the wrong level", async () => {
    const context = await running();
    const submit = (level: "area" | "kit" | "item", targetId: string) =>
      context.anaApi.mutation(api.hashingPhotos.submit, {
        hashDateId: context.hashDateId,
        level,
        targetId,
        photo: photoRef("x"),
      });
    await expect(submit("kit", "no-such-kit")).rejects.toThrow(/isn't on this hash's checklist/);
    await expect(submit("item", "no-such-line")).rejects.toThrow(/isn't on this hash's checklist/);
    await expect(submit("area", KIT)).rejects.toThrow(/isn't on this hash's checklist/);
    expect(await context.t.run(async (ctx) => ctx.db.query("hashReferencePhotos").collect())).toHaveLength(0);
  });

  test("a file that wasn't uploaded for a hash is refused", async () => {
    const context = await running();
    const submit = (photo: string) =>
      context.anaApi.mutation(api.hashingPhotos.submit, {
        hashDateId: context.hashDateId,
        level: "kit",
        targetId: KIT,
        photo,
      });
    await expect(submit("r2:inventory/items/i/damage/u-photo.jpg")).rejects.toThrow(/uploaded for a hash/);
    await expect(submit("hashing/reference/no-prefix.jpg")).rejects.toThrow(/uploaded for a hash/);
    await expect(submit("https://example.com/photo.jpg")).rejects.toThrow(/uploaded for a hash/);
  });

  test("a hash that isn't running takes no photos", async () => {
    const context = await running();
    const scheduled = context.dates.find((row) => row.dateKey === "2026-11-10")!._id;
    await expect(submitKitPhoto({ ...context, anaApi: context.opsApi, hashDateId: scheduled })).rejects.toThrow(/isn't running/);
    await context.opsApi.mutation(api.hashingLive.finish, { hashDateId: context.hashDateId, attendeeUserIds: [] });
    await expect(submitKitPhoto(context)).rejects.toThrow(/isn't running/);
  });

  test("crew who aren't on the hash can't submit", async () => {
    const context = await running();
    await expect(
      context.caraApi.mutation(api.hashingPhotos.submit, {
        hashDateId: context.hashDateId,
        level: "kit",
        targetId: KIT,
        photo: photoRef("x"),
      }),
    ).rejects.toThrow(/not booked/);
  });

  test("one person can have 20 photos waiting, not 21", async () => {
    const context = await running();
    for (let index = 0; index < 20; index += 1) await submitKitPhoto(context, `p${index}`);
    await expect(submitKitPhoto(context, "p20")).rejects.toThrow(/20 photos waiting/);
    await context.benApi.mutation(api.hashingPhotos.submit, {
      hashDateId: context.hashDateId,
      level: "kit",
      targetId: KIT,
      photo: photoRef("ben"),
    });
  });
});

describe("adding from the checklist editor", () => {
  const addFromSetup = (api_: Running["opsApi"], level: "area" | "kit" | "item", targetId: string, name = "setup") =>
    api_.mutation(api.hashingPhotos.addFromSetup, { level, targetId, photo: photoRef(name) });

  test("an approved photo with no hash shows to crew on a running hash", async () => {
    const context = await running();
    await addFromSetup(context.opsApi, "kit", KIT);

    const rows = await context.t.run(async (ctx) => ctx.db.query("hashReferencePhotos").collect());
    expect(rows).toMatchObject([
      { status: "approved", level: "kit", targetId: KIT, r2Key: "hashing/reference/setup.jpg", reviewedAt: NOW },
    ]);
    const [row] = rows;
    expect(row!.status === "approved" && row!.submittedBy === row!.reviewedBy).toBe(true);
    expect(row).not.toHaveProperty("hashDateId");

    const seen = await context.benApi.query(api.hashingPhotos.forHash, { hashDateId: context.hashDateId });
    expect(seen.photos).toMatchObject([
      { level: "kit", targetId: KIT, status: "approved", mine: false, byName: "Olive Ops", url: "https://photos.test/hashing/reference/setup.jpg" },
    ]);
  });

  test("an area, a kit and an item are accepted, and so are area extras and final checks", async () => {
    const context = await running();
    const { version, tree } = await context.opsApi.query(api.hashingChecklist.getCurrent, {});
    const area = tree.areas.find((row) => row.finalChecks.length > 0 && row.placements.length > 0)!;
    await addFromSetup(context.opsApi, "area", AREA, "a");
    await addFromSetup(context.opsApi, "kit", KIT, "k");
    await addFromSetup(context.opsApi, "item", ITEM_LINE, "i");
    await addFromSetup(context.opsApi, "item", area.finalChecks[0]!.id, "f");

    const extraId = "only-here-line";
    const withExtra = {
      ...tree,
      areas: tree.areas.map((row) =>
        row.id === area.id
          ? { ...row, placements: row.placements.map((p, index) => (index === 0 ? { ...p, extraItems: [{ id: extraId, text: "Extra" }] } : p)) }
          : row,
      ),
    };
    await context.opsApi.mutation(api.hashingChecklist.publish, { baseVersion: version, ...withExtra });
    await addFromSetup(context.opsApi, "item", extraId, "e");

    expect(await context.t.run(async (ctx) => ctx.db.query("hashReferencePhotos").collect())).toHaveLength(5);
  });

  test("an unknown target is refused, and so is the right id at the wrong level", async () => {
    const context = await running();
    await expect(addFromSetup(context.opsApi, "kit", "no-such-kit")).rejects.toThrow(/published checklist/);
    await expect(addFromSetup(context.opsApi, "item", "no-such-line")).rejects.toThrow(/published checklist/);
    await expect(addFromSetup(context.opsApi, "area", KIT)).rejects.toThrow(/published checklist/);
    await expect(addFromSetup(context.opsApi, "item", KIT)).rejects.toThrow(/published checklist/);
    await expect(addFromSetup(context.opsApi, "kit", AREA)).rejects.toThrow(/published checklist/);
    expect(await context.t.run(async (ctx) => ctx.db.query("hashReferencePhotos").collect())).toHaveLength(0);
  });

  test("a file that wasn't uploaded for a hash is refused", async () => {
    const context = await running();
    await expect(
      context.opsApi.mutation(api.hashingPhotos.addFromSetup, {
        level: "kit",
        targetId: KIT,
        photo: "r2:inventory/items/i/damage/u-photo.jpg",
      }),
    ).rejects.toThrow(/uploaded for a hash/);
  });

  test("crew can't add from setup", async () => {
    const context = await running();
    await expect(addFromSetup(context.anaApi, "kit", KIT)).rejects.toThrow(/access|Access/);
    expect(await context.t.run(async (ctx) => ctx.db.query("hashReferencePhotos").collect())).toHaveLength(0);
  });

  test("the checklist lists approved photos for admin and ops only, never a waiting one", async () => {
    const context = await running();
    await addFromSetup(context.opsApi, "kit", KIT, "setup");
    await submitKitPhoto(context, "waiting");

    expect(await context.opsApi.query(api.hashingPhotos.forChecklist, {})).toMatchObject([
      { level: "kit", targetId: KIT, status: "approved", byName: "Olive Ops", url: "https://photos.test/hashing/reference/setup.jpg" },
    ]);
    await expect(context.anaApi.query(api.hashingPhotos.forChecklist, {})).rejects.toThrow(/access|Access/);
  });

  test("a setup photo can be removed, and the queue still reads", async () => {
    const context = await running();
    await addFromSetup(context.opsApi, "kit", KIT);
    await submitKitPhoto(context);
    const [setup] = await context.opsApi.query(api.hashingPhotos.forChecklist, {});
    expect(await context.opsApi.query(api.hashingPhotos.listPending, {})).toMatchObject([{ level: "kit", dateKey: "2026-11-03" }]);

    await context.opsApi.mutation(api.hashingPhotos.remove, { photoId: setup!._id });
    expect(released.keys).toEqual(["hashing/reference/setup.jpg"]);
    expect(await context.opsApi.query(api.hashingPhotos.forChecklist, {})).toEqual([]);
  });

  test("the orphan sweep counts a setup photo as referenced", async () => {
    const context = await running();
    await addFromSetup(context.opsApi, "kit", KIT, "setup");
    const scan = await context.t.run(async (ctx) => [...(await collectReferencedR2Keys(ctx)).keys]);
    expect(scan).toContain("hashing/reference/setup.jpg");
  });
});

describe("review", () => {
  test("rejecting deletes the photo and its file, and it never shows", async () => {
    const context = await running();
    await submitKitPhoto(context);
    const photoId = await onlyPhotoId(context.t);
    await context.opsApi.mutation(api.hashingPhotos.reject, { photoId });
    await context.opsApi.mutation(api.hashingPhotos.reject, { photoId });

    expect(await context.t.run(async (ctx) => ctx.db.get(photoId))).toBeNull();
    expect(released.keys).toEqual(["hashing/reference/stands.jpg"]);
    expect((await context.anaApi.query(api.hashingPhotos.forHash, { hashDateId: context.hashDateId })).photos).toEqual([]);
    expect(await context.opsApi.query(api.hashingPhotos.listPending, {})).toEqual([]);
  });

  test("removing takes an approved photo off the hash", async () => {
    const context = await running();
    await submitKitPhoto(context);
    const photoId = await onlyPhotoId(context.t);
    await context.opsApi.mutation(api.hashingPhotos.approve, { photoId });
    await context.opsApi.mutation(api.hashingPhotos.remove, { photoId });

    expect(await context.t.run(async (ctx) => ctx.db.get(photoId))).toBeNull();
    expect(released.keys).toEqual(["hashing/reference/stands.jpg"]);
    expect((await context.benApi.query(api.hashingPhotos.forHash, { hashDateId: context.hashDateId })).photos).toEqual([]);
  });

  test("a stale click can't delete an approved photo by rejecting it, or a waiting one by removing it", async () => {
    const context = await running();
    await submitKitPhoto(context);
    const photoId = await onlyPhotoId(context.t);
    await expect(context.opsApi.mutation(api.hashingPhotos.remove, { photoId })).rejects.toThrow(/Reject it instead/);
    await context.opsApi.mutation(api.hashingPhotos.approve, { photoId });
    await expect(context.opsApi.mutation(api.hashingPhotos.reject, { photoId })).rejects.toThrow(/Remove it instead/);
    expect(await context.t.run(async (ctx) => ctx.db.get(photoId))).toMatchObject({ status: "approved" });
    expect(released.keys).toEqual([]);
  });

  test("the queue names where each photo goes and how many it already has", async () => {
    const context = await running();
    await context.anaApi.mutation(api.hashingPhotos.submit, {
      hashDateId: context.hashDateId,
      level: "item",
      targetId: ITEM_LINE,
      photo: photoRef("first"),
    });
    await context.opsApi.mutation(api.hashingPhotos.approve, { photoId: await onlyPhotoId(context.t) });
    await context.benApi.mutation(api.hashingPhotos.submit, {
      hashDateId: context.hashDateId,
      level: "item",
      targetId: ITEM_LINE,
      photo: photoRef("second"),
    });
    await submitKitPhoto(context);

    const queue = await context.opsApi.query(api.hashingPhotos.listPending, {});
    expect(queue).toMatchObject([
      { level: "kit", title: "Event Kit", byName: "Ana Crew", dateKey: "2026-11-03", approvedCount: 0 },
      { level: "item", title: "Container is clean and usable", context: "Event Kit", byName: "Ben Crew", approvedCount: 1 },
    ]);
  });

  test("a photo for something since removed from the checklist reads as removed", async () => {
    const context = await running();
    await context.anaApi.mutation(api.hashingPhotos.submit, {
      hashDateId: context.hashDateId,
      level: "area",
      targetId: "red-shelf",
      photo: photoRef("shelf"),
    });
    const { version, tree } = await context.opsApi.query(api.hashingChecklist.getCurrent, {});
    const edited = { ...tree, areas: tree.areas.filter((area) => area.id !== "red-shelf") };
    edited.kits = edited.kits.filter((kit) => kit.id !== "red-shelf");
    await context.opsApi.mutation(api.hashingChecklist.publish, { baseVersion: version, ...edited });

    expect(await context.opsApi.query(api.hashingPhotos.listPending, {})).toMatchObject([
      { level: "area", title: "Removed area" },
    ]);
  });

  test("the overview counts photos waiting, for ops only", async () => {
    const context = await running();
    await submitKitPhoto(context);
    expect((await context.opsApi.query(api.hashing.getOverview, { now: NOW })).pendingPhotos).toBe(1);
    expect((await context.anaApi.query(api.hashing.getOverview, { now: NOW })).pendingPhotos).toBe(0);
  });
});

describe("storage", () => {
  test("the orphan sweep counts approved and waiting photos as referenced", async () => {
    const context = await running();
    await submitKitPhoto(context, "approved");
    await context.opsApi.mutation(api.hashingPhotos.approve, { photoId: await onlyPhotoId(context.t) });
    await submitKitPhoto(context, "waiting");

    const scan = await context.t.run(async (ctx) => {
      const { keys, complete } = await collectReferencedR2Keys(ctx);
      return { keys: [...keys], complete };
    });
    expect(scan.complete).toBe(true);
    expect(scan.keys).toContain("hashing/reference/approved.jpg");
    expect(scan.keys).toContain("hashing/reference/waiting.jpg");
  });
});

describe("authorization", () => {
  test("crew can't approve, reject, remove or list the queue", async () => {
    const context = await running();
    await submitKitPhoto(context);
    const photoId = await onlyPhotoId(context.t);
    const denied = /access|Access/;
    await expect(context.anaApi.mutation(api.hashingPhotos.approve, { photoId })).rejects.toThrow(denied);
    await expect(context.anaApi.mutation(api.hashingPhotos.reject, { photoId })).rejects.toThrow(denied);
    await expect(context.anaApi.mutation(api.hashingPhotos.remove, { photoId })).rejects.toThrow(denied);
    await expect(context.anaApi.query(api.hashingPhotos.listPending, {})).rejects.toThrow(denied);

    await context.opsApi.mutation(api.hashingPhotos.approve, { photoId });
    await expect(context.benApi.mutation(api.hashingPhotos.remove, { photoId })).rejects.toThrow(denied);
    expect(await context.t.run(async (ctx) => ctx.db.get(photoId))).toMatchObject({ status: "approved" });
  });
});
