import { describe, expect, it } from "vitest";
import { emailSummaryToast } from "./email-summary-toast";

describe("emailSummaryToast", () => {
  it.each([
    [{ result: "written", events: 1 }, { kind: "success", message: "Summary added" }],
    [{ result: "written", events: 0 }, { kind: "info", message: "No linked event to update" }],
    [{ result: "nothing", events: 0 }, { kind: "info", message: "Nothing operational to add" }],
    [{ result: "no_invoice", events: 0 }, { kind: "info", message: "No quote to key the summary to" }],
  ] as const)("%j says %j", (outcome, toast) => {
    expect(emailSummaryToast(outcome)).toEqual(toast);
  });
});
