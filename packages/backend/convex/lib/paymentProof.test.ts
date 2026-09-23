import { describe, expect, it } from "vitest";
import { resolvePaymentProofFlags } from "./paymentProof";

describe("resolvePaymentProofFlags", () => {
  it("opens payment once the quote is approved", () => {
    const flags = resolvePaymentProofFlags({
      invoice: { clientApprovalStatus: "approved", approvedAt: 1_000 },
      nowMs: 2_000,
      hasActiveSubmission: false,
      paymentReceived: false,
    });
    expect(flags.eligible).toBe(true);
    expect(flags.canSubmit).toBe(true);
    expect(flags.opensAt).toBe(1_000);
  });

  it("stays closed before approval", () => {
    const flags = resolvePaymentProofFlags({
      invoice: { clientApprovalStatus: "pending" },
      nowMs: 2_000,
      hasActiveSubmission: false,
      paymentReceived: false,
    });
    expect(flags.eligible).toBe(false);
    expect(flags.canSubmit).toBe(false);
  });

  it("does not accept another submission after proof or payment", () => {
    const approved = { clientApprovalStatus: "approved" as const, approvedAt: 1_000 };
    expect(
      resolvePaymentProofFlags({
        invoice: approved,
        nowMs: 2_000,
        hasActiveSubmission: true,
        paymentReceived: false,
      }).canSubmit,
    ).toBe(false);
    expect(
      resolvePaymentProofFlags({
        invoice: approved,
        nowMs: 2_000,
        hasActiveSubmission: false,
        paymentReceived: true,
      }).canSubmit,
    ).toBe(false);
  });
});
