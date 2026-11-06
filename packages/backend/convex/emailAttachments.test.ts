// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { seedEvent, seedInvoice, seedRequest } from "./test/bookingSeeds.helpers";
import {
  addMembership,
  asUser,
  createOrg,
  createUser,
  makeTest,
  setActiveOrg,
  setVerticals,
  type Test,
} from "./test/setup.helpers";

const stored = vi.hoisted(() => ({
  keys: [] as string[],
  types: [] as (string | undefined)[],
  deleted: [] as string[],
  failSync: false,
}));

vi.mock("./inventoryR2", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./inventoryR2")>()),
  inventoryR2: {
    store: async (_ctx: unknown, _bytes: unknown, opts: { key: string; type?: string }) => {
      stored.keys.push(opts.key);
      stored.types.push(opts.type);
    },
    syncMetadata: async () => {
      if (stored.failSync) throw new Error("metadata sync failed");
    },
    deleteObject: async (_ctx: unknown, key: string) => {
      stored.deleted.push(key);
    },
  },
}));

const RECEIVED_AT = Date.UTC(2026, 10, 3, 18);
const PDF_BYTES = new Uint8Array([37, 80, 68, 70]);

let fetchMock: ReturnType<typeof vi.fn>;

function providerAttachment(id: string, filename: string, contentType = "application/pdf") {
  return {
    object: "attachment",
    id,
    filename,
    content_type: contentType,
    download_url: `https://files.resend.test/${id}`,
  };
}

beforeEach(() => {
  stored.keys.length = 0;
  stored.types.length = 0;
  stored.deleted.length = 0;
  stored.failSync = false;
  vi.stubEnv("RESEND_API_KEY", "re_test");
  fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("https://files.resend.test/")) return new Response(PDF_BYTES);
    if (url.includes("/attachments/att_1")) return Response.json(providerAttachment("att_1", "po.pdf"));
    if (url.includes("/attachments?")) {
      return Response.json({
        object: "list",
        has_more: false,
        data: [providerAttachment("att_a", "po.pdf"), providerAttachment("att_b", "po.pdf")],
      });
    }
    return new Response("missing", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

type Attachment = { filename: string; contentType?: string; size?: number; resendAttachmentId?: string };

async function seedBooking(t: Test, attachments: Attachment[]) {
  const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA" });
  const invoiceId = await seedInvoice(t, {
    invoiceNumber: "ALINV-BBBBBBB",
    sourceEventRequestId: requestId,
  });
  await t.run(async (ctx) => ctx.db.patch(requestId, { linkedInvoiceId: invoiceId }));
  const eventId = await seedEvent(t, { invoiceId, sourceEventRequestId: requestId });
  await t.mutation(internal.emailInbound.recordInboundEmail, {
    resendEmailId: "re_1",
    messageId: "m1@client.test",
    references: [],
    fromEmail: "maya@client.test",
    fromName: "Maya Rivera",
    to: ["alreq-aaaaaaa@arbor.st"],
    cc: [],
    receivedFor: [],
    subject: "Re: Your quote",
    text: "Our PO is attached",
    attachments,
    receivedAt: RECEIVED_AT,
  });
  const message = await t.run(async (ctx) => ctx.db.query("emailMessages").first());
  return { eventId, messageId: message!._id };
}

async function staffViewer(t: Test) {
  const user = await createUser(t, { email: "staff@arbor.st" });
  const arbor = await createOrg(t, { type: "arbor_internal" });
  await addMembership(t, user._id, arbor.organizationId, "member", true);
  await setActiveOrg(t, user._id, arbor.organizationId);
  await setVerticals(t, user._id, ["Operations"]);
  return asUser(t, user);
}

const artifactsOf = (t: Test, eventId: Id<"events">) =>
  t.run(async (ctx) =>
    ctx.db
      .query("eventArtifacts")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
  );

describe("emailAttachments.addToEventFiles", () => {
  it("copies the attachment into the event's files with a note of who sent it", async () => {
    const t = makeTest();
    const { eventId, messageId } = await seedBooking(t, [
      { filename: "po.pdf", contentType: "application/pdf", size: 4, resendAttachmentId: "att_1" },
    ]);
    const staff = await staffViewer(t);

    const result = await staff.action(api.emailAttachments.addToEventFiles, {
      eventId,
      messageId,
      index: 0,
    });

    expect(result.status).toBe("added");
    const [artifact] = await artifactsOf(t, eventId);
    expect(artifact).toMatchObject({
      _id: result.artifactId,
      artifactType: "document",
      title: "po.pdf",
      markdown: "Emailed by Maya Rivera on Tue, Nov 3, 2026",
      sourceEmailAttachment: { messageId, index: 0 },
      version: 1,
      active: true,
    });
    expect(artifact!.linkUrl).toBe(`r2:${stored.keys[0]}`);
    expect(stored.keys[0]).toMatch(new RegExp(`^events/${eventId}/artifacts/.+-po\\.pdf$`));
    expect(stored.types).toEqual(["application/pdf"]);
    const calls = fetchMock.mock.calls as [string, RequestInit?][];
    expect(calls[0]).toEqual([
      "https://api.resend.com/emails/receiving/re_1/attachments/att_1",
      { headers: { Authorization: "Bearer re_test" } },
    ]);
    expect(calls[1]![0]).toBe("https://files.resend.test/att_1");
    expect(calls[1]![1]).toBeUndefined();
  });

  it("deletes the upload and adds no file when a step after storing it fails", async () => {
    const t = makeTest();
    const { eventId, messageId } = await seedBooking(t, [
      { filename: "po.pdf", contentType: "application/pdf", size: 4, resendAttachmentId: "att_1" },
    ]);
    const staff = await staffViewer(t);
    stored.failSync = true;

    await expect(
      staff.action(api.emailAttachments.addToEventFiles, { eventId, messageId, index: 0 }),
    ).rejects.toThrow("metadata sync failed");
    expect(stored.deleted).toEqual(stored.keys);
    expect(stored.keys).toHaveLength(1);
    expect(await artifactsOf(t, eventId)).toHaveLength(0);
  });

  it("answers already_added without fetching when the attachment was copied before", async () => {
    const t = makeTest();
    const { eventId, messageId } = await seedBooking(t, [
      { filename: "po.pdf", resendAttachmentId: "att_1" },
    ]);
    const staff = await staffViewer(t);
    const args = { eventId, messageId, index: 0 };
    const first = await staff.action(api.emailAttachments.addToEventFiles, args);
    fetchMock.mockClear();

    const second = await staff.action(api.emailAttachments.addToEventFiles, args);

    expect(second).toEqual({ status: "already_added", artifactId: first.artifactId });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await artifactsOf(t, eventId)).toHaveLength(1);
  });

  it("finds an attachment stored without a provider id by its position among same-named files", async () => {
    const t = makeTest();
    const { eventId, messageId } = await seedBooking(t, [
      { filename: "po.pdf" },
      { filename: "po.pdf" },
    ]);
    const staff = await staffViewer(t);

    await staff.action(api.emailAttachments.addToEventFiles, { eventId, messageId, index: 1 });

    const urls = (fetchMock.mock.calls as [string][]).map(([url]) => url);
    expect(urls).toEqual([
      "https://api.resend.com/emails/receiving/re_1/attachments?limit=100",
      "https://files.resend.test/att_b",
    ]);
  });

  it("refuses a file over the size limit before downloading it", async () => {
    const t = makeTest();
    const { eventId, messageId } = await seedBooking(t, [
      { filename: "deck.pdf", size: 26 * 1024 * 1024, resendAttachmentId: "att_1" },
    ]);
    const staff = await staffViewer(t);

    await expect(
      staff.action(api.emailAttachments.addToEventFiles, { eventId, messageId, index: 0 }),
    ).rejects.toThrow(/25 MB/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await artifactsOf(t, eventId)).toHaveLength(0);
  });

  it("says so when the mail provider no longer has the attachment", async () => {
    const t = makeTest();
    const { eventId, messageId } = await seedBooking(t, [
      { filename: "po.pdf", resendAttachmentId: "att_gone" },
    ]);
    const staff = await staffViewer(t);

    await expect(
      staff.action(api.emailAttachments.addToEventFiles, { eventId, messageId, index: 0 }),
    ).rejects.toThrow(/no longer available/);
    expect(stored.keys).toEqual([]);
    expect(await artifactsOf(t, eventId)).toHaveLength(0);
  });
});

describe("emailAttachments.loadAttachmentForEvent", () => {
  it("refuses a message from another booking's thread", async () => {
    const t = makeTest();
    const { eventId } = await seedBooking(t, [{ filename: "po.pdf" }]);
    await seedRequest(t, { requestNumber: "ALREQ-CCCCCCC" });
    await t.mutation(internal.emailInbound.recordInboundEmail, {
      resendEmailId: "re_other",
      references: [],
      fromEmail: "sam@other.test",
      to: ["alreq-ccccccc@arbor.st"],
      cc: [],
      receivedFor: [],
      subject: "Hello",
      text: "Hi",
      attachments: [{ filename: "secret.pdf" }],
      receivedAt: RECEIVED_AT,
    });
    const other = await t.run(async (ctx) =>
      ctx.db
        .query("emailMessages")
        .withIndex("by_resendEmailId", (q) => q.eq("resendEmailId", "re_other"))
        .unique(),
    );
    expect(other?.threadId).toBeDefined();
    const staff = await staffViewer(t);

    await expect(
      staff.query(internal.emailAttachments.loadAttachmentForEvent, {
        eventId,
        messageId: other!._id,
        index: 0,
      }),
    ).rejects.toThrow(/not on this event's booking thread/);
  });

  it("refuses an index past the message's attachments", async () => {
    const t = makeTest();
    const { eventId, messageId } = await seedBooking(t, [{ filename: "po.pdf" }]);
    const staff = await staffViewer(t);
    await expect(
      staff.query(internal.emailAttachments.loadAttachmentForEvent, { eventId, messageId, index: 1 }),
    ).rejects.toThrow(/no longer exists/);
  });

  it("refuses a caller who cannot edit the event before reaching the mail provider", async () => {
    const t = makeTest();
    const { eventId, messageId } = await seedBooking(t, [{ filename: "po.pdf" }]);
    const user = await createUser(t, { email: "plain@arbor.st" });
    const arbor = await createOrg(t, { type: "arbor_internal" });
    await addMembership(t, user._id, arbor.organizationId, "member", true);
    await setActiveOrg(t, user._id, arbor.organizationId);

    await expect(
      asUser(t, user).action(api.emailAttachments.addToEventFiles, { eventId, messageId, index: 0 }),
    ).rejects.toThrow(/permission/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("emailAttachments.recordAttachmentArtifact", () => {
  it("keeps one file per attachment and releases the loser's upload", async () => {
    const t = makeTest();
    const { eventId, messageId } = await seedBooking(t, [{ filename: "po.pdf" }]);
    const args = { eventId, messageId, index: 0 };

    const first = await t.mutation(internal.emailAttachments.recordAttachmentArtifact, {
      ...args,
      key: `events/${eventId}/artifacts/one-po.pdf`,
    });
    const second = await t.mutation(internal.emailAttachments.recordAttachmentArtifact, {
      ...args,
      key: `events/${eventId}/artifacts/two-po.pdf`,
    });

    expect(first.status).toBe("added");
    expect(second).toEqual({ status: "already_added", artifactId: first.artifactId });
    expect(await artifactsOf(t, eventId)).toHaveLength(1);
    expect(stored.deleted).toEqual([`events/${eventId}/artifacts/two-po.pdf`]);
  });
});
