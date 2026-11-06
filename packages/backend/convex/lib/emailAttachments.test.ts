import { describe, expect, it } from "vitest";
import {
  parseResendAttachment,
  pickAttachmentByFilename,
  type ResendAttachment,
} from "./emailAttachments";

const entry = (id: string, filename?: string): ResendAttachment => ({
  id,
  filename,
  downloadUrl: `https://files.resend.test/${id}`,
});

describe("parseResendAttachment", () => {
  it("reads the provider's snake_case fields", () => {
    expect(
      parseResendAttachment({
        object: "attachment",
        id: "att_1",
        filename: "po.pdf",
        content_type: "application/pdf",
        download_url: "https://files.resend.test/att_1",
      }),
    ).toEqual({
      id: "att_1",
      filename: "po.pdf",
      contentType: "application/pdf",
      downloadUrl: "https://files.resend.test/att_1",
    });
  });

  it("drops an entry with no id or download link", () => {
    expect(parseResendAttachment({ id: "att_1" })).toBeNull();
    expect(parseResendAttachment({ download_url: "https://x.test" })).toBeNull();
    expect(parseResendAttachment("nope")).toBeNull();
  });
});

describe("pickAttachmentByFilename", () => {
  const listed = [entry("a", "map.png"), entry("b", "po.pdf"), entry("c", "po.pdf")];

  it("finds the entry sharing the stored filename", () => {
    const stored = [{ filename: "map.png" }, { filename: "po.pdf" }];
    expect(pickAttachmentByFilename(listed, stored, 0)?.id).toBe("a");
    expect(pickAttachmentByFilename(listed, stored, 1)?.id).toBe("b");
  });

  it("takes the Nth same-named entry for the Nth same-named stored attachment", () => {
    const stored = [{ filename: "po.pdf" }, { filename: "map.png" }, { filename: "po.pdf" }];
    expect(pickAttachmentByFilename(listed, stored, 0)?.id).toBe("b");
    expect(pickAttachmentByFilename(listed, stored, 2)?.id).toBe("c");
  });

  it("matches a nameless entry to the stored placeholder name", () => {
    expect(pickAttachmentByFilename([entry("z")], [{ filename: "attachment" }], 0)?.id).toBe("z");
  });

  it("returns null when the provider no longer lists it", () => {
    expect(pickAttachmentByFilename([entry("a", "map.png")], [{ filename: "po.pdf" }], 0)).toBeNull();
    expect(pickAttachmentByFilename(listed, [{ filename: "po.pdf" }], 3)).toBeNull();
  });
});
