// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { seedEvent, seedInvoice } from "./test/bookingSeeds.helpers";
import {
  addMembership,
  asUser,
  createOrg,
  createUser,
  makeTest,
  setActiveOrg,
  type Test,
} from "./test/setup.helpers";

const TOKEN = "quote-token-booking-summary";

function gatewayReply(notes: string[]) {
  return Response.json({ choices: [{ message: { content: JSON.stringify({ notes }) } }] });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  fetchMock = vi.fn(async () => gatewayReply(["Load-in through the Lagunita lot after 3pm"]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function seedBooking(
  t: Test,
  opts: { inbound?: boolean; eventNotes?: (string | undefined)[] } = {},
) {
  const invoiceId = await seedInvoice(t, { invoiceNumber: "ALINV-SUMMARY1" });
  await t.run(async (ctx) => {
    await ctx.db.patch(invoiceId, {
      status: "finalized",
      clientApprovalStatus: "pending",
      publicApprovalToken: TOKEN,
      clientContactName: "Maya Rivera",
    });
  });
  const eventIds: Id<"events">[] = [];
  for (const notes of opts.eventNotes ?? [undefined]) {
    const eventId = await seedEvent(t, { invoiceId });
    if (notes !== undefined) await t.run(async (ctx) => ctx.db.patch(eventId, { notes }));
    eventIds.push(eventId);
  }
  const threadId = await t.run(async (ctx) => {
    const now = Date.now();
    const id = await ctx.db.insert("emailThreads", {
      invoiceId,
      lastMessageAt: now,
      messageCount: 2,
      createdAt: now,
    });
    await ctx.db.insert("emailMessages", {
      threadId: id,
      direction: "outbound",
      resendEmailId: "out-1",
      references: [],
      fromEmail: "bookings@arbor.st",
      to: ["maya@client.test"],
      cc: [],
      subject: "Your quote",
      bodyText: "Your quote is ready.",
      attachments: [],
      receivedAt: now - 2000,
    });
    if (opts.inbound !== false) {
      await ctx.db.insert("emailMessages", {
        threadId: id,
        direction: "inbound",
        resendEmailId: "in-1",
        references: [],
        fromEmail: "maya@client.test",
        fromName: "Maya Rivera",
        to: ["alinv-summary1@arbor.st"],
        cc: [],
        subject: "Re: Your quote",
        bodyText: "We are in the Old Union ballroom. Load-in via the dock after 3pm.",
        attachments: [],
        receivedAt: now - 1000,
      });
    }
    return id;
  });
  return { invoiceId, eventIds, threadId };
}

async function notesOf(t: Test, ids: Id<"events">[]) {
  return await t.run(async (ctx) => Promise.all(ids.map(async (id) => (await ctx.db.get(id))?.notes ?? null)));
}

const approve = (t: Test) =>
  t.mutation(api.invoices.approveByToken, {
    token: TOKEN,
    signedName: "Maya Rivera",
    clientIsPaymentSubmitter: true,
  });

describe("approval schedules the summary", () => {
  it("writes the block into every linked event after the client approves", async () => {
    const t = makeTest();
    const { invoiceId, eventIds, threadId } = await seedBooking(t, {
      eventNotes: ["Staff: call Maya on arrival.", undefined],
    });
    await approve(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
    expect(invoice?.clientApprovalStatus).toBe("approved");
    const label = `quote approved ${new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(invoice!.approvedAt!))}`;
    const block = `Client email summary (${label})\n- Load-in through the Lagunita lot after 3pm`;
    expect(await notesOf(t, eventIds)).toEqual([`Staff: call Maya on arrival.\n\n${block}`, block]);
    const thread = await t.run(async (ctx) => ctx.db.get(threadId));
    expect(thread?.summaryBullets).toEqual(["Load-in through the Lagunita lot after 3pm"]);
    expect(thread?.summaryUpdatedAt).toBeTypeOf("number");
  });

  it("still approves when the summary cannot be written", async () => {
    const t = makeTest();
    const { invoiceId, eventIds } = await seedBooking(t);
    fetchMock.mockImplementation(async () => new Response("down", { status: 500 }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(approve(t)).resolves.toEqual({ ok: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
    expect(invoice?.clientApprovalStatus).toBe("approved");
    expect(await notesOf(t, eventIds)).toEqual([null]);
  });
});

describe("summarizeForInvoice", () => {
  it("makes no call when nobody from the client wrote", async () => {
    const t = makeTest();
    const { invoiceId, eventIds } = await seedBooking(t, { inbound: false });
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await notesOf(t, eventIds)).toEqual([null]);
  });

  it("sends the thread to the pinned model as a JSON array, oldest first", async () => {
    const t = makeTest();
    const { invoiceId } = await seedBooking(t);
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai-gateway.vercel.sh/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("zai/glm-5.3-flash");
    expect(body.providerOptions).toEqual({ gateway: { only: ["baseten"] } });
    expect(body.messages[0].content).toContain(
      "The note should not include any pricing specific discussion, discounts, etc. It should only be operational notes such as venue location or details like those.",
    );
    expect(JSON.parse(body.messages[1].content)).toEqual([
      { direction: "outbound", sender: "bookings@arbor.st", body: "Your quote is ready." },
      {
        direction: "inbound",
        sender: "Maya Rivera",
        body: "We are in the Old Union ballroom. Load-in via the dock after 3pm.",
      },
    ]);
  });

  it("replaces its own block on a later run and leaves staff text around it alone", async () => {
    const t = makeTest();
    const { invoiceId, eventIds } = await seedBooking(t, {
      eventNotes: [
        "Before\n\nClient email summary (quote approved Jan 1, 2026)\n- Stale detail\n\nAfter\n- staff bullet",
      ],
    });
    fetchMock.mockImplementation(async () => gatewayReply(["Dock access after 3pm", "Podium mic needed"]));
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });

    const [notes] = await notesOf(t, eventIds);
    expect(notes).toMatch(
      /^Before\n\nClient email summary \(as of [A-Z][a-z]{2} \d{1,2}, \d{4}\)\n- Dock access after 3pm\n- Podium mic needed\n\nAfter\n- staff bullet$/,
    );
    expect(notes!.match(/Client email summary/g)).toHaveLength(1);
  });

  it("drops pricing bullets and writes nothing, removing nothing, when none survive", async () => {
    const t = makeTest();
    const existing = "Keep me\n\nClient email summary (quote approved Jan 1, 2026)\n- Earlier detail";
    const { invoiceId, eventIds, threadId } = await seedBooking(t, { eventNotes: [existing] });
    fetchMock.mockImplementation(async () =>
      gatewayReply(["Total is $2,400", "10% discount agreed", "Deposit due Friday", "Invoice attached"]),
    );
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    expect(await notesOf(t, eventIds)).toEqual([existing]);
    expect((await t.run(async (ctx) => ctx.db.get(threadId)))?.summaryBullets).toBeUndefined();
  });

  it("keeps the operational bullets when the model mixes in pricing", async () => {
    const t = makeTest();
    const { invoiceId, eventIds } = await seedBooking(t);
    fetchMock.mockImplementation(async () =>
      gatewayReply(["Old Union ballroom", "Total is $2,400", "Load-in via the dock after 3pm"]),
    );
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    const [notes] = await notesOf(t, eventIds);
    expect(notes).toContain("- Old Union ballroom\n- Load-in via the dock after 3pm");
    expect(notes).not.toContain("2,400");
  });

  it("logs a missing key and writes nothing", async () => {
    const t = makeTest();
    const { invoiceId, eventIds } = await seedBooking(t);
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      `[bookingSummary] invoice ${invoiceId}: gave up after 1 attempt(s): AI_GATEWAY_API_KEY is not set`,
    );
    expect(await notesOf(t, eventIds)).toEqual([null]);
  });

  it("retries a gateway 500 once after 60s, then logs the second failure without writing", async () => {
    const t = makeTest();
    const { invoiceId, eventIds } = await seedBooking(t);
    fetchMock.mockImplementation(async () => new Response("boom", { status: 500 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      `[bookingSummary] invoice ${invoiceId}: gateway HTTP 500; retrying in 60s`,
    );

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith(
      `[bookingSummary] invoice ${invoiceId}: gave up after 2 attempt(s): gateway HTTP 500`,
    );
    expect(await notesOf(t, eventIds)).toEqual([null]);
  });

  it("does not retry a 403 and logs one line naming the model and the gateway message", async () => {
    const t = makeTest();
    const { invoiceId, eventIds } = await seedBooking(t);
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ error: { message: "Free tier users do not have access to this model" } }),
          { status: 403 },
        ),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      `[bookingSummary] invoice ${invoiceId}: gave up after 1 attempt(s): gateway refused model zai/glm-5.3-flash (403): Free tier users do not have access to this model — add paid AI Gateway credits or set BOOKING_SUMMARY_MODEL`,
    );
    expect(await notesOf(t, eventIds)).toEqual([null]);
  });

  it("does not retry a reply it cannot parse", async () => {
    const t = makeTest();
    const { invoiceId, eventIds } = await seedBooking(t);
    fetchMock.mockImplementation(async () =>
      Response.json({ choices: [{ message: { content: "sorry, no" } }] }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await notesOf(t, eventIds)).toEqual([null]);
  });
});

describe("addSummaryToEventNotes (the Email card button)", () => {
  async function staff(t: Test, opts: { type?: "arbor_internal" | "band" } = {}) {
    const user = await createUser(t, { role: "admin", name: "Sam Staff" });
    const org = await createOrg(t, { type: opts.type ?? "arbor_internal" });
    await addMembership(t, user._id, org.organizationId, "org_admin", true);
    await setActiveOrg(t, user._id, org.organizationId);
    return asUser(t, user);
  }

  it("adds the summary to that event and says so", async () => {
    const t = makeTest();
    const { eventIds } = await seedBooking(t, { eventNotes: ["Staff note"] });
    const as = await staff(t);
    expect(await as.action(api.bookingSummary.addSummaryToEventNotes, { eventId: eventIds[0]! })).toEqual({
      result: "added",
    });
    const [notes] = await notesOf(t, eventIds);
    expect(notes).toMatch(
      /^Staff note\n\nClient email summary \(as of [A-Z][a-z]{2} \d{1,2}, \d{4}\)\n- Load-in through the Lagunita lot after 3pm$/,
    );
  });

  it("reports nothing to add when no bullet survives or nobody from the client wrote", async () => {
    const t = makeTest();
    const { eventIds } = await seedBooking(t);
    const as = await staff(t);
    fetchMock.mockImplementation(async () => gatewayReply(["Total is $2,400"]));
    expect(await as.action(api.bookingSummary.addSummaryToEventNotes, { eventId: eventIds[0]! })).toEqual({
      result: "nothing",
    });

    const quiet = makeTest();
    const none = await seedBooking(quiet, { inbound: false });
    const quietStaff = await staff(quiet);
    fetchMock.mockClear();
    expect(
      await quietStaff.action(api.bookingSummary.addSummaryToEventNotes, { eventId: none.eventIds[0]! }),
    ).toEqual({ result: "nothing" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a gateway failure and writes nothing", async () => {
    const t = makeTest();
    const { eventIds } = await seedBooking(t);
    const as = await staff(t);
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementation(async () => new Response("boom", { status: 500 }));
    await expect(
      as.action(api.bookingSummary.addSummaryToEventNotes, { eventId: eventIds[0]! }),
    ).rejects.toThrow(/summary service is busy/);
    fetchMock.mockImplementation(async () => new Response("bad key", { status: 401 }));
    await expect(
      as.action(api.bookingSummary.addSummaryToEventNotes, { eventId: eventIds[0]! }),
    ).rejects.toThrow("The AI Gateway refused zai/glm-5.3-flash (401): no message");
    expect(await notesOf(t, eventIds)).toEqual([null]);
  });

  it("tells the caller a 403 is the model being refused, not a busy service", async () => {
    const t = makeTest();
    const { eventIds } = await seedBooking(t);
    const as = await staff(t);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ error: { message: "Free tier users do not have access to this model" } }),
          { status: 403 },
        ),
    );
    await expect(
      as.action(api.bookingSummary.addSummaryToEventNotes, { eventId: eventIds[0]! }),
    ).rejects.toThrow(
      "The AI Gateway refused zai/glm-5.3-flash (403): Free tier users do not have access to this model",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      `[bookingSummary] event ${eventIds[0]}: gateway refused model zai/glm-5.3-flash (403): Free tier users do not have access to this model — add paid AI Gateway credits or set BOOKING_SUMMARY_MODEL`,
    );
    expect(await notesOf(t, eventIds)).toEqual([null]);
  });

  it.each([
    ["unset", undefined, { gateway: { only: ["baseten"] } }],
    ["empty", "", { gateway: { only: ["baseten"] } }],
    ["none", "none", undefined],
  ])("sends the provider pin through the whole path when the variable is %s", async (_, value, expected) => {
    const t = makeTest();
    const { eventIds } = await seedBooking(t);
    const as = await staff(t);
    vi.stubEnv("BOOKING_SUMMARY_MODEL", "zai/glm-4.7-flash");
    if (value !== undefined) vi.stubEnv("BOOKING_SUMMARY_PROVIDERS", value);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await as.action(api.bookingSummary.addSummaryToEventNotes, { eventId: eventIds[0]! });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe("zai/glm-4.7-flash");
    expect(body.providerOptions).toEqual(expected);
    expect(warn).toHaveBeenCalledTimes(value === "none" ? 1 : 0);
  });

  it("refuses signed-out callers and non-staff", async () => {
    const t = makeTest();
    const { eventIds } = await seedBooking(t);
    await expect(
      t.action(api.bookingSummary.addSummaryToEventNotes, { eventId: eventIds[0]! }),
    ).rejects.toThrow();
    const band = await staff(t, { type: "band" });
    await expect(
      band.action(api.bookingSummary.addSummaryToEventNotes, { eventId: eventIds[0]! }),
    ).rejects.toThrow(/Arbor internal/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await notesOf(t, eventIds)).toEqual([null]);
  });
});
