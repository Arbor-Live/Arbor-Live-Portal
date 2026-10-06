import { describe, expect, it } from "vitest";
import { renderCohoGiftCardLowBalanceEmail } from "../src/render";
import type { CohoGiftCardLowBalanceEmailProps } from "../src/types";

const props = {
  balanceUsd: 42.5,
  thresholdUsd: 50,
  dashboardUrl: "http://localhost:3000/dashboard",
} satisfies CohoGiftCardLowBalanceEmailProps;

describe("renderCohoGiftCardLowBalanceEmail", () => {
  it("shows the current balance and the alert threshold", async () => {
    const html = await renderCohoGiftCardLowBalanceEmail(props);
    expect(html).toContain("$42.50");
    expect(html).toContain("$50.00");
  });

  it("links back to the portal", async () => {
    const html = await renderCohoGiftCardLowBalanceEmail(props);
    expect(html).toContain("http://localhost:3000/dashboard");
  });
});
