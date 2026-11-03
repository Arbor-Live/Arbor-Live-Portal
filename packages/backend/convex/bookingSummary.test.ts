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
  return await t.run(async (ctx) =>
    Promise.all(ids.map(async (id) => (await ctx.db.get(id))?.notes ?? null)),
  );
}

const day = (ms: number) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
const asOfToday = () => `as of ${day(Date.now())}`;
const LAGUNITA = "Load-in through the Lagunita lot after 3pm";

function block(label: string, bullets: string[], invoiceNumber = "ALINV-SUMMARY1") {
  return [
    `Client email summary · ${invoiceNumber} · ${label}`,
    ...bullets.map((bullet) => `- ${bullet}`),
    "(end of client email summary)",
  ].join("\n");
}

const approve = (t: Test) =>
  t.mutation(api.invoices.approveByToken, {
    token: TOKEN,
    signedName: "Maya Rivera",
    clientIsPaymentSubmitter: true,
  });

function silenceConsole() {
  return (["log", "info", "warn", "error", "debug"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
}

function loggedText(spies: ReturnType<typeof silenceConsole>) {
  return spies.flatMap((spy) => spy.mock.calls.map((call) => call.map(String).join(" "))).join("\n");
}

describe("approval schedules the summary", () => {
  it("writes the keyed block into every linked event after the client approves", async () => {
    const t = makeTest();
    const { invoiceId, eventIds } = await seedBooking(t, {
      eventNotes: ["Staff: call Maya on arrival.", undefined],
    });
    await approve(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
    expect(invoice?.clientApprovalStatus).toBe("approved");
    const written = block(`quote approved ${day(invoice!.approvedAt!)}`, [LAGUNITA]);
    expect(await notesOf(t, eventIds)).toEqual([`Staff: call Maya on arrival.\n\n${written}`, written]);
    const stored = await t.run(async (ctx) => (await ctx.db.get(eventIds[0]!))?.emailSummaryBlocks);
    expect(stored).toEqual([{ invoiceId, text: written, generatedAt: expect.any(Number) }]);
  });

  it("still approves when the summary cannot be written", async () => {
    const t = makeTest();
    const { invoiceId, eventIds } = await seedBooking(t);
    fetchMock.mockImplementation(async () => new Response("down", { status: 500 }));
    silenceConsole();

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

  it("replaces its own unchanged block in place and keeps staff bullets typed right under it", async () => {
    const t = makeTest();
    const { invoiceId, eventIds } = await seedBooking(t, { eventNotes: ["Before"] });
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    const staffLines = "- Staff: bring the long XLRs\n- Staff: Sam has the keys";
    await t.run(async (ctx) => {
      const event = await ctx.db.get(eventIds[0]!);
      await ctx.db.patch(eventIds[0]!, { notes: `${event!.notes}\n${staffLines}\n\nAfter` });
    });

    fetchMock.mockImplementation(async () => gatewayReply(["Dock access after 3pm"]));
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    fetchMock.mockImplementation(async () => gatewayReply(["Dock access after 3pm", "Podium mic needed"]));
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });

    expect(await notesOf(t, eventIds)).toEqual([
      `Before\n\n${block(asOfToday(), ["Dock access after 3pm", "Podium mic needed"])}\n${staffLines}\n\nAfter`,
    ]);
  });

  it("appends a new block when staff edited the old one, leaving the edit as typed", async () => {
    const t = makeTest();
    const { invoiceId, eventIds } = await seedBooking(t);
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    const edited = block(asOfToday(), ["Load-in through the Lagunita lot after 4pm (Sam confirmed)"]);
    await t.run(async (ctx) => ctx.db.patch(eventIds[0]!, { notes: edited }));

    fetchMock.mockImplementation(async () => gatewayReply(["Podium mic at 7:30"]));
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    expect(await notesOf(t, eventIds)).toEqual([
      `${edited}\n\n${block(asOfToday(), ["Podium mic at 7:30"])}`,
    ]);
  });

  it("leaves a staff header lookalike and its bullets alone", async () => {
    const lookalike = "Client email summary · ALINV-SUMMARY1 · my call notes\n- Maya prefers text";
    const t = makeTest();
    const { invoiceId, eventIds } = await seedBooking(t, { eventNotes: [lookalike] });
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    expect(await notesOf(t, eventIds)).toEqual([`${lookalike}\n\n${block(asOfToday(), [LAGUNITA])}`]);
  });

  it("keeps a block per invoice when one event links two invoices", async () => {
    const t = makeTest();
    const { invoiceId, eventIds } = await seedBooking(t);
    const secondInvoiceId = await seedInvoice(t, { invoiceNumber: "ALINV-SUMMARY2" });
    await t.run(async (ctx) => {
      await ctx.db.insert("eventInvoiceLinks", {
        eventId: eventIds[0]!,
        invoiceId: secondInvoiceId,
        createdAt: Date.now(),
      });
      await ctx.db.insert("emailThreads", {
        invoiceId: secondInvoiceId,
        lastMessageAt: Date.now(),
        messageCount: 1,
        createdAt: Date.now(),
      }).then((threadId) =>
        ctx.db.insert("emailMessages", {
          threadId,
          direction: "inbound",
          resendEmailId: "in-2",
          references: [],
          fromEmail: "maya@client.test",
          to: ["alinv-summary2@arbor.st"],
          cc: [],
          subject: "Second stage",
          bodyText: "Second stage goes in the courtyard.",
          attachments: [],
          receivedAt: Date.now(),
        }),
      );
    });

    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    fetchMock.mockImplementation(async () => gatewayReply(["Second stage in the courtyard"]));
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId: secondInvoiceId });
    fetchMock.mockImplementation(async () => gatewayReply(["Dock after 3pm"]));
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });

    expect(await notesOf(t, eventIds)).toEqual([
      `${block(asOfToday(), ["Dock after 3pm"])}\n\n${block(
        asOfToday(),
        ["Second stage in the courtyard"],
        "ALINV-SUMMARY2",
      )}`,
    ]);
  });

  it("drops pricing bullets and writes nothing, removing nothing, when none survive", async () => {
    const t = makeTest();
    const existing = "Keep me";
    const { invoiceId, eventIds } = await seedBooking(t, { eventNotes: [existing] });
    fetchMock.mockImplementation(async () =>
      gatewayReply(["Total is $2,400", "10% discount agreed", "Deposit due Friday", "Invoice attached"]),
    );
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    expect(await notesOf(t, eventIds)).toEqual([existing]);
  });

  it("keeps operational bullets that come after eight pricing ones", async () => {
    const t = makeTest();
    const { invoiceId, eventIds } = await seedBooking(t);
    const pricing = Array.from({ length: 8 }, (_, i) => `Line item ${i + 1} is $100`);
    fetchMock.mockImplementation(async () => gatewayReply([...pricing, "Old Union ballroom", "Podium mic at 7:30"]));
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    expect(await notesOf(t, eventIds)).toEqual([block(asOfToday(), ["Old Union ballroom", "Podium mic at 7:30"])]);
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

  it.each([
    ["a non-JSON reply", () => Response.json({ choices: [{ message: { content: "SECRET model words" } }] })],
    ["a non-JSON body", () => new Response("SECRET gateway page", { status: 200 })],
    ["an error body", () => new Response("SECRET gateway page", { status: 400 })],
  ])("never logs model or gateway text for %s, and does not retry", async (_, reply) => {
    const t = makeTest();
    const { invoiceId, eventIds } = await seedBooking(t);
    fetchMock.mockImplementation(async () => reply());
    const spies = silenceConsole();
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(loggedText(spies)).toContain(`[bookingSummary] invoice ${invoiceId}: gave up after 1 attempt(s)`);
    expect(loggedText(spies)).not.toContain("SECRET");
    expect(await notesOf(t, eventIds)).toEqual([null]);
  });

  it("does not log dropped pricing bullets, only how many", async () => {
    const t = makeTest();
    const { invoiceId } = await seedBooking(t);
    fetchMock.mockImplementation(async () => gatewayReply(["SECRET total is $2,400", LAGUNITA]));
    const spies = silenceConsole();
    await t.action(internal.bookingSummary.summarizeForInvoice, { invoiceId });
    expect(loggedText(spies)).toContain("[bookingSummary] dropped 1 pricing-like bullet(s) from the model reply");
    expect(loggedText(spies)).not.toContain("SECRET");
  });
});

describe("writeSummary overlap", () => {
  it("never lets an older transcript overwrite a newer summary", async () => {
    const t = makeTest();
    const { invoiceId, eventIds } = await seedBooking(t);
    const write = (generatedAt: number, bullet: string) =>
      t.mutation(internal.bookingSummary.writeSummary, {
        eventIds,
        invoiceId,
        invoiceNumber: "ALINV-SUMMARY1",
        bullets: [bullet],
        label: "as of Nov 3, 2026",
        generatedAt,
      });

    expect(await write(2_000, "Newer: doors at 7pm")).toBe(1);
    expect(await write(1_000, "Older: doors at 6pm")).toBe(0);
    const newer = block("as of Nov 3, 2026", ["Newer: doors at 7pm"]);
    expect(await notesOf(t, eventIds)).toEqual([newer]);
    expect(await t.run(async (ctx) => (await ctx.db.get(eventIds[0]!))?.emailSummaryBlocks)).toEqual([
      { invoiceId, text: newer, generatedAt: 2_000 },
    ]);
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

  it("adds the summary to that event and reports one event written", async () => {
    const t = makeTest();
    const { eventIds } = await seedBooking(t, { eventNotes: ["Staff note"] });
    const as = await staff(t);
    expect(await as.action(api.bookingSummary.addSummaryToEventNotes, { eventId: eventIds[0]! })).toEqual({
      result: "written",
      events: 1,
    });
    expect(await notesOf(t, eventIds)).toEqual([`Staff note\n\n${block(asOfToday(), [LAGUNITA])}`]);
  });

  it("reports zero events when a newer summary is already there", async () => {
    const t = makeTest();
    const { invoiceId, eventIds } = await seedBooking(t);
    const as = await staff(t);
    await t.run(async (ctx) =>
      ctx.db.patch(eventIds[0]!, {
        emailSummaryBlocks: [{ invoiceId, text: "x", generatedAt: Date.now() + 60_000 }],
      }),
    );
    expect(await as.action(api.bookingSummary.addSummaryToEventNotes, { eventId: eventIds[0]! })).toEqual({
      result: "written",
      events: 0,
    });
    expect(await notesOf(t, eventIds)).toEqual([null]);
  });

  it("reports no invoice, without a model call, for an event with no quote", async () => {
    const t = makeTest();
    const eventId = await seedEvent(t);
    await t.run(async (ctx) => {
      const threadId = await ctx.db.insert("emailThreads", {
        eventId,
        lastMessageAt: Date.now(),
        messageCount: 1,
        createdAt: Date.now(),
      });
      await ctx.db.insert("emailMessages", {
        threadId,
        direction: "inbound",
        resendEmailId: "in-x",
        references: [],
        fromEmail: "maya@client.test",
        to: ["event@arbor.st"],
        cc: [],
        subject: "Hi",
        bodyText: "Old Union ballroom.",
        attachments: [],
        receivedAt: Date.now(),
      });
    });
    const as = await staff(t);
    expect(await as.action(api.bookingSummary.addSummaryToEventNotes, { eventId })).toEqual({
      result: "no_invoice",
      events: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports nothing to add when no bullet survives or nobody from the client wrote", async () => {
    const t = makeTest();
    const { eventIds } = await seedBooking(t);
    const as = await staff(t);
    fetchMock.mockImplementation(async () => gatewayReply(["Total is $2,400"]));
    expect(await as.action(api.bookingSummary.addSummaryToEventNotes, { eventId: eventIds[0]! })).toEqual({
      result: "nothing",
      events: 0,
    });

    const quiet = makeTest();
    const none = await seedBooking(quiet, { inbound: false });
    const quietStaff = await staff(quiet);
    fetchMock.mockClear();
    expect(
      await quietStaff.action(api.bookingSummary.addSummaryToEventNotes, { eventId: none.eventIds[0]! }),
    ).toEqual({ result: "nothing", events: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a gateway failure without its body and writes nothing", async () => {
    const t = makeTest();
    const { eventIds } = await seedBooking(t);
    const as = await staff(t);
    silenceConsole();
    fetchMock.mockImplementation(async () => new Response("SECRET boom", { status: 500 }));
    await expect(
      as.action(api.bookingSummary.addSummaryToEventNotes, { eventId: eventIds[0]! }),
    ).rejects.toThrow("The summary service is busy. Try again in a minute.");
    fetchMock.mockImplementation(async () => new Response("SECRET bad key", { status: 401 }));
    await expect(
      as.action(api.bookingSummary.addSummaryToEventNotes, { eventId: eventIds[0]! }),
    ).rejects.toThrow("The AI Gateway refused zai/glm-5.3-flash (401): no message");
    expect(await notesOf(t, eventIds)).toEqual([null]);
  });

  it("never puts model text in the toast", async () => {
    const t = makeTest();
    const { eventIds } = await seedBooking(t);
    const as = await staff(t);
    const spies = silenceConsole();
    fetchMock.mockImplementation(async () =>
      Response.json({ choices: [{ message: { content: "SECRET model words" } }] }),
    );
    const error = await as
      .action(api.bookingSummary.addSummaryToEventNotes, { eventId: eventIds[0]! })
      .catch((caught: unknown) => caught);
    expect(String((error as Error).message)).toContain(
      "Could not write the summary: unusable gateway reply: Model reply was not valid JSON",
    );
    expect(String((error as Error).message)).not.toContain("SECRET");
    expect(loggedText(spies)).not.toContain("SECRET");
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
