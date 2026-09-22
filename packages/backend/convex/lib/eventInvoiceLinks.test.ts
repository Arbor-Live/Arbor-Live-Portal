import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  MAX_ADDITIONAL_INVOICES_PER_EVENT,
  normalizeAdditionalInvoiceIds,
  splitPrimaryAndAdditional,
} from "./eventInvoiceLinks";

const id = (value: string) => value as Id<"invoices">;

describe("splitPrimaryAndAdditional", () => {
  it("keeps the chosen primary and drops it from the extra list", () => {
    const split = splitPrimaryAndAdditional(id("primary"), [
      id("extra"),
      id("primary"),
      id("extra"),
      id("other"),
    ]);
    expect(split.primary).toBe("primary");
    expect(split.additional).toEqual(["extra", "other"]);
  });

  it("promotes the first extra invoice when no primary is set", () => {
    const split = splitPrimaryAndAdditional(undefined, [id("a"), id("b"), id("a")]);
    expect(split.primary).toBe("a");
    expect(split.additional).toEqual(["b"]);
  });

  it("clears both when the lists are empty", () => {
    expect(splitPrimaryAndAdditional(undefined, [])).toEqual({
      primary: undefined,
      additional: [],
    });
  });

  it("promotes one invoice so the rest can fill the additional cap", () => {
    const ids = Array.from({ length: MAX_ADDITIONAL_INVOICES_PER_EVENT + 1 }, (_, index) =>
      id(`inv-${index}`),
    );
    const split = splitPrimaryAndAdditional(undefined, ids);
    expect(split.primary).toBe(ids[0]);
    expect(split.additional).toHaveLength(MAX_ADDITIONAL_INVOICES_PER_EVENT);
  });

  it("rejects more additional invoices than the cap", () => {
    const ids = Array.from({ length: MAX_ADDITIONAL_INVOICES_PER_EVENT + 1 }, (_, index) =>
      id(`inv-${index}`),
    );
    expect(() => normalizeAdditionalInvoiceIds(ids, undefined)).toThrow(
      `Additional invoices max ${MAX_ADDITIONAL_INVOICES_PER_EVENT}, got ${ids.length}.`,
    );
  });
});
