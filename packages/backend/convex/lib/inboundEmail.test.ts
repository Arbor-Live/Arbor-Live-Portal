import { describe, expect, it } from "vitest";
import { htmlToText, normalizeMessageId, parseReceivedEmail } from "./inboundEmail";

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
