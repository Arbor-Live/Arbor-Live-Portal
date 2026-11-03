import { describe, expect, it } from "vitest";
import {
  htmlToText,
  MAX_FULL_TEXT_CHARS,
  MAX_HTML_CHARS,
  normalizeMessageId,
  parseReceivedEmail,
} from "./inboundEmail";

describe("normalizeMessageId", () => {
  it("strips angle brackets and whitespace", () => {
    expect(normalizeMessageId(" <abc@mail.gmail.com> ")).toBe("abc@mail.gmail.com");
    expect(normalizeMessageId("abc@host")).toBe("abc@host");
    expect(normalizeMessageId("  ")).toBeUndefined();
  });
});

describe("htmlToText", () => {
  it("turns blocks into lines and decodes entities", () => {
    const html =
      "<style>p{color:red}</style><div>Hi&nbsp;Maya,</div><div>Fish &amp; chips &#8217;ok&#x21;</div><p>Bye<br>now</p>";
    expect(htmlToText(html)).toBe("Hi Maya,\nFish & chips ’ok!\nBye\nnow");
  });

  it("drops script and head blocks but keeps a header element", () => {
    const html =
      "<HEAD><title>x</title></HEAD><header><p>Top</p></header><SCRIPT>alert(1)</script><p>Body</p>";
    expect(htmlToText(html)).toBe("Top\nBody");
  });

  it("keeps the body when the head is never closed", () => {
    expect(htmlToText("<head><meta charset=utf-8><body><p>Load-in at 4pm</p>")).toBe(
      "Load-in at 4pm",
    );
  });

  it("keeps body text when a closing tag looks like a longer tag name", () => {
    expect(
      htmlToText("<head><title>T</title><body><header><p>Hi Maya</p></header><p>Body</p>"),
    ).toBe("Hi Maya\nBody");
    expect(htmlToText("<head-nav><p>SETUP</p></head-nav><p>Show</p>")).toBe("SETUP\nShow");
  });

  it("keeps the body when text before a closing tag changes length when lowercased", () => {
    const turkish = "<p>İSTANBUL İZMİR İSKENDERUN İNEBOLU</p>".repeat(8);
    expect(
      htmlToText(`${turkish}<style>p{}</style><p>Load-in at 4pm, crew call 3pm</p><p>tail</p>`),
    ).toBe(`${"İSTANBUL İZMİR İSKENDERUN İNEBOLU\n".repeat(8)}Load-in at 4pm, crew call 3pm\ntail`);
    const title = `${"İ".repeat(16)}stanbul`;
    expect(
      htmlToText(`<html><head><title>${title}</title></head><body><p>Load-in at 4pm</p></body>`),
    ).toBe("Load-in at 4pm");
  });

  it("drops only a special tag that never closes its angle bracket", () => {
    expect(htmlToText("<head Load-in at 4pm, bring the van")).toBe(
      "Load-in at 4pm, bring the van",
    );
  });

  it("stays fast on hostile input at the HTML cap", () => {
    const tagCount = Math.floor(MAX_HTML_CHARS / 16);
    const hostile = [
      "<script>".repeat(tagCount) + "<style>".repeat(tagCount) + "<p>end</p>",
      " ".repeat(MAX_HTML_CHARS),
      "\t".repeat(MAX_HTML_CHARS),
      "<".repeat(MAX_HTML_CHARS),
    ];
    for (const html of hostile) {
      const started = performance.now();
      htmlToText(html);
      expect(performance.now() - started).toBeLessThan(500);
    }
    expect(htmlToText(hostile[0]!)).toBe("end");
  });
});

describe("parseReceivedEmail", () => {
  const base = {
    object: "email",
    id: "re_1",
    from: '"Maya Rivera" <Maya@Client.test>',
    to: ["Arbor <alreq-k3m9x2p@arbor.st>"],
    cc: null,
    received_for: ["alreq-k3m9x2p@arbor.st"],
    subject: "Re: Your quote",
    text: "Sounds good",
    html: "<p>Sounds good</p>",
    message_id: "<new@client.test>",
    created_at: "2026-11-03 18:00:00+00",
    headers: {
      "In-Reply-To": "<prev@arbor.st>",
      References: "<first@arbor.st>\r\n <prev@arbor.st>",
    },
    attachments: [
      { id: "a1", filename: "po.pdf", size: 1200, content_type: "application/pdf" },
      { id: "a2", filename: null, size: 5, content_type: "image/png" },
    ],
  };

  it("narrows the Resend response into the typed shape", () => {
    expect(parseReceivedEmail(base, "re_1")).toEqual({
      resendEmailId: "re_1",
      messageId: "new@client.test",
      inReplyTo: "prev@arbor.st",
      references: ["first@arbor.st", "prev@arbor.st"],
      fromEmail: "maya@client.test",
      fromName: "Maya Rivera",
      to: ["alreq-k3m9x2p@arbor.st"],
      cc: [],
      receivedFor: ["alreq-k3m9x2p@arbor.st"],
      subject: "Re: Your quote",
      text: "Sounds good",
      attachments: [
        { filename: "po.pdf", contentType: "application/pdf", size: 1200 },
        { filename: "attachment", contentType: "image/png", size: 5 },
      ],
      receivedAt: Date.UTC(2026, 10, 3, 18),
    });
  });

  it("derives text from html when the text part is missing", () => {
    const parsed = parseReceivedEmail({ ...base, text: null, html: "<p>Hello</p>" }, "re_1");
    expect(parsed.text).toBe("Hello");
  });

  it("caps the text before it becomes a mutation argument", () => {
    const fromText = parseReceivedEmail({ ...base, text: "x".repeat(150_000) }, "re_1");
    const fromHtml = parseReceivedEmail(
      { ...base, text: null, html: `<p>${"y".repeat(250_000)}</p>` },
      "re_1",
    );
    expect([fromText.text.length, fromHtml.text.length]).toEqual([
      MAX_FULL_TEXT_CHARS,
      MAX_FULL_TEXT_CHARS,
    ]);
  });

  it("caps references at the most recent 50", () => {
    const refs = Array.from({ length: 60 }, (_, i) => `<m${i}@h>`).join(" ");
    const parsed = parseReceivedEmail({ ...base, headers: { references: refs } }, "re_1");
    expect(parsed.references).toHaveLength(50);
    expect(parsed.references[0]).toBe("m10@h");
    expect(parsed.references[49]).toBe("m59@h");
  });

  it("rejects a response with no sender", () => {
    expect(() => parseReceivedEmail({ ...base, from: undefined }, "re_1")).toThrow(/from/);
    expect(() => parseReceivedEmail("nope", "re_1")).toThrow(/expected an object/);
  });
});
