import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGatewayRequest,
  buildTranscript,
  filterOperationalBullets,
  MAX_BULLET_CHARS,
  MAX_SUMMARY_BULLETS,
  MAX_SUMMARY_MESSAGES,
  MAX_TRANSCRIPT_CHARS,
  OPERATIONAL_ONLY_RULE,
  parseSummaryResponse,
  requestOperationalNotes,
  SUMMARY_SYSTEM_PROMPT,
} from "./bookingSummary";

const message = (n: number, bodyText: string, direction: "inbound" | "outbound" = "inbound") => ({
  direction,
  fromName: `Sender ${n}`,
  fromEmail: `s${n}@client.test`,
  bodyText,
});

describe("filterOperationalBullets", () => {
  it("drops pricing talk and keeps logistics", () => {
    const { kept, dropped } = filterOperationalBullets([
      "Total is $1,200 for the night",
      "Client asked for a 10% discount",
      "Deposit due Friday",
      "Invoice attached",
      "Load-in through the Lagunita lot after 3pm",
      "Podium mic for the opening speeches",
    ]);
    expect(kept).toEqual([
      "Load-in through the Lagunita lot after 3pm",
      "Podium mic for the opening speeches",
    ]);
    expect(dropped).toEqual([
      "Total is $1,200 for the night",
      "Client asked for a 10% discount",
      "Deposit due Friday",
      "Invoice attached",
    ]);
  });

  it.each([
    "Paid in USD",
    "50 % up front",
    "Extra charges apply for overtime",
    "Prices went up",
    "Budget is tight",
    "Hourly rate for the techs",
    "They will pay on the day",
    "Late fee applies",
    "Quote approved",
    "The cost of the truck",
  ])("drops %s", (bullet) => {
    expect(filterOperationalBullets([bullet]).kept).toEqual([]);
  });

  it.each(["Separate entrance for the band", "Rating 5 star venue", "Stage is 20 percent smaller"])(
    "keeps %s (words only match whole)",
    (bullet) => {
      expect(filterOperationalBullets([bullet]).kept).toEqual([bullet]);
    },
  );
});

describe("buildTranscript", () => {
  it("keeps messages oldest first with direction and sender", () => {
    expect(
      buildTranscript([
        message(1, "Ballroom works."),
        message(2, "Great, loading dock after 3.", "outbound"),
      ]),
    ).toBe(
      [
        "--- inbound message from Sender 1 ---\nBallroom works.",
        "--- outbound message from Sender 2 ---\nGreat, loading dock after 3.",
      ].join("\n\n"),
    );
  });

  it("falls back to the address when the sender has no name", () => {
    expect(
      buildTranscript([{ direction: "inbound", fromEmail: "a@b.test", bodyText: "Hi" }]),
    ).toBe("--- inbound message from a@b.test ---\nHi");
  });

  it("keeps only the newest 60 messages", () => {
    const messages = Array.from({ length: 75 }, (_, i) => message(i + 1, `body ${i + 1}`));
    const transcript = buildTranscript(messages);
    expect(transcript.match(/--- inbound/g)).toHaveLength(MAX_SUMMARY_MESSAGES);
    expect(transcript).toContain("body 75");
    expect(transcript).toContain("body 16");
    expect(transcript).not.toContain("body 15\n");
  });

  it("drops the oldest messages first once past the character budget", () => {
    const chunk = "x".repeat(10_000);
    const transcript = buildTranscript([
      message(1, `oldest ${chunk}`),
      message(2, `middle ${chunk}`),
      message(3, `newer ${chunk}`),
      message(4, `newest ${chunk}`),
    ]);
    expect(transcript.length).toBeLessThanOrEqual(MAX_TRANSCRIPT_CHARS);
    expect(transcript).not.toContain("oldest");
    expect(transcript.indexOf("middle")).toBeLessThan(transcript.indexOf("newer"));
    expect(transcript).toContain("newest");
  });

  it("cuts a single message bigger than the whole budget", () => {
    const transcript = buildTranscript([message(1, "y".repeat(MAX_TRANSCRIPT_CHARS * 2))]);
    expect(transcript.length).toBe(MAX_TRANSCRIPT_CHARS);
  });
});

describe("buildGatewayRequest", () => {
  it("pins the model and the Baseten-only provider and carries the operational-only rule", () => {
    const body = buildGatewayRequest("--- inbound message from Maya ---\nHello");
    expect(body.model).toBe("zai/glm-5.3-flash");
    expect(body.providerOptions).toEqual({ gateway: { only: ["baseten"] } });
    expect(body.messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(body.messages[0]!.content).toContain(
      "The note should not include any pricing specific discussion, discounts, etc. It should only be operational notes such as venue location or details like those.",
    );
    expect(SUMMARY_SYSTEM_PROMPT).toContain(OPERATIONAL_ONLY_RULE);
    expect(body.messages[1]!.content).toContain("Hello");
  });
});

describe("parseSummaryResponse", () => {
  const reply = (content: string) => ({ choices: [{ message: { content } }] });

  it("reads the notes, tidies them and caps count and length", () => {
    const long = "z".repeat(300);
    const notes = parseSummaryResponse(
      reply(
        JSON.stringify({
          notes: ["  - Ballroom\n  load-in  ", "", long, ...Array.from({ length: 12 }, (_, i) => `n${i}`)],
        }),
      ),
    );
    expect(notes).toHaveLength(MAX_SUMMARY_BULLETS);
    expect(notes[0]).toBe("Ballroom load-in");
    expect(notes[1]).toHaveLength(MAX_BULLET_CHARS);
    expect(notes[1]!.endsWith("…")).toBe(true);
  });

  it("accepts a fenced JSON reply", () => {
    expect(parseSummaryResponse(reply('```json\n{"notes":["Dock after 3"]}\n```'))).toEqual(["Dock after 3"]);
  });

  it.each([
    [null],
    [{}],
    [reply("not json")],
    [reply('{"notes":"nope"}')],
    [reply('{"notes":[1,2]}')],
    [reply('{"other":[]}')],
  ])("rejects %j", (body) => {
    expect(() => parseSummaryResponse(body)).toThrow();
  });
});

describe("requestOperationalNotes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts the pinned request with the bearer key", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: '{"notes":["Dock after 3pm"]}' } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await requestOperationalNotes("key-123", "transcript");
    expect(result).toEqual({ ok: true, bullets: ["Dock after 3pm"] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ai-gateway.vercel.sh/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer key-123");
    expect(JSON.parse(init.body as string).providerOptions).toEqual({ gateway: { only: ["baseten"] } });
  });

  it.each([
    [429, true],
    [500, true],
    [503, true],
    [400, false],
    [401, false],
  ])("HTTP %i is retryable: %s", async (status, retryable) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status })));
    expect(await requestOperationalNotes("k", "t")).toEqual({
      ok: false,
      retryable,
      reason: `gateway HTTP ${status} nope`,
    });
  });

  it("treats a network error as retryable and unusable output as final", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("boom"))));
    expect(await requestOperationalNotes("k", "t")).toMatchObject({ ok: false, retryable: true });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [] })));
    expect(await requestOperationalNotes("k", "t")).toMatchObject({ ok: false, retryable: false });
  });
});
