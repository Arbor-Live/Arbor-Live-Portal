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

  it("ends an unclosed head at the body, not at a quoted document's </head>", () => {
    const html =
      "<html><head><meta charset=utf-8><body><p>Load-in at 4pm, crew call 3pm</p>" +
      "<blockquote><html><head><style>p{}</style></head><body><p>Original</p></body></html></blockquote>";
    expect(htmlToText(html)).toBe("Load-in at 4pm, crew call 3pm\nOriginal");
  });

  it("drops only a self-closing special tag", () => {
    expect(htmlToText("<div>A</div><title/><div>B</div><title>t</title><div>C</div>")).toBe(
      "A\nB\nC",
    );
    expect(
      htmlToText('<body><script src="x.js"/><p>Load-in at 4pm</p><script>t()</script><p>after</p>'),
    ).toBe("Load-in at 4pm\nafter");
  });

  it("keeps the text after a closing tag that has no '>'", () => {
    expect(htmlToText("<head><meta x></head Load-in is still 4pm<p>Tail</p>")).toContain(
      "Load-in is still 4pm",
    );
  });

  it("drops a stylesheet cut off by the HTML cap instead of keeping it as text", () => {
    const html = `<html><head><style>${"p{color:red}".repeat(17_000)}</style></head><body><p>x</p>`;
    expect(html.length).toBeGreaterThan(MAX_HTML_CHARS);
    expect(htmlToText(html)).toBe("");
  });

  it("keeps the reply in a Gmail-shaped message", () => {
    const html =
      '<div dir="ltr">Thanks! Can the truck park in the Lagunita lot?<div><br></div><div>Maya</div></div>' +
      '<br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Mon, Nov 2, 2026 at 9:00 AM ' +
      "Arbor Live &lt;bookings@arbor.st&gt; wrote:<br></div><blockquote>Your quote is ready.</blockquote></div>";
    expect(htmlToText(html)).toBe(
      "Thanks! Can the truck park in the Lagunita lot?\n\nMaya\n\nOn Mon, Nov 2, 2026 at 9:00 AM Arbor Live <bookings@arbor.st> wrote:\n\nYour quote is ready.",
    );
  });

  it("ignores tags inside comments and keeps text after an unclosed style", () => {
    expect(
      htmlToText(
        "<html><body><!--[if mso]><style> .mso{color:red} <![endif]--><p>Load-in at 4pm, crew call 3pm</p></body></html>",
      ),
    ).toBe("Load-in at 4pm, crew call 3pm");
    expect(
      htmlToText("<html><body><!-- <script> var a = 1; --> <p>Load-in at 4pm</p></body></html>"),
    ).toBe("Load-in at 4pm");
    expect(htmlToText("<body><style>.a{} <p>Load-in 4pm</p>")).toBe("Load-in 4pm");
  });

  it("ends an unclosed head at the first body element when there is no <body>", () => {
    expect(
      htmlToText(
        "<html><head><meta charset=utf-8><p>Reply: load-in at 4pm</p><blockquote><html><head><title>q</title></head><body><p>quoted</p></body></html></blockquote>",
      ),
    ).toBe("Reply: load-in at 4pm\nquoted");
  });

  it("breaks lines at a <br> that has attributes", () => {
    expect(htmlToText('see you at 4.<br id="lineBreakAtBeginningOfSignature">Sent from my iPhone')).toBe(
      "see you at 4.\nSent from my iPhone",
    );
  });

  it("stays fast on hostile input at the HTML cap", () => {
    const fill = (unit: string) => unit.repeat(Math.ceil(MAX_HTML_CHARS / unit.length)).slice(0, MAX_HTML_CHARS);
    const hostile = [
      fill("<script>"),
      fill("<head "),
      fill("<script>x</script>"),
      fill("<title>"),
      fill(" "),
      fill("\t"),
      fill("<"),
      fill("<!--"),
      fill("<style>"),
    ];
    for (const html of hostile) {
      const started = performance.now();
      htmlToText(html);
      expect(performance.now() - started).toBeLessThan(500);
    }
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
