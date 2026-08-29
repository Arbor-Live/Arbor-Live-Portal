import { describe, expect, it } from "vitest";
import {
  buildInvoiceDocumentData,
  currency,
  groupInvoiceSections,
  normalizeCrewLineLabel,
} from "./format";
import type { InvoiceDocumentInvoice, InvoiceLineItem } from "./types";

const line = (
  section: InvoiceLineItem["section"],
  overrides: Partial<InvoiceLineItem> = {},
): InvoiceLineItem => ({
  id: `${section}-x`,
  section,
  label: section,
  quantity: 1,
  rateUsd: 10,
  amountUsd: 10,
  ...overrides,
});

describe("currency", () => {
  it("delegates to the shared USD formatter", () => {
    expect(currency(2500)).toBe("$2,500.00");
  });
});

describe("normalizeCrewLineLabel", () => {
  it("collapses duplicated assignee names", () => {
    expect(normalizeCrewLineLabel("Damian Luciano Muschamp (Damian Luciano Muschamp (Lead))")).toBe(
      "Damian Luciano Muschamp (Lead)",
    );
    expect(normalizeCrewLineLabel("Damian Luciano Muschamp (Damian Luciano Muschamp)")).toBe(
      "Damian Luciano Muschamp",
    );
    expect(normalizeCrewLineLabel("Setup — Damian (Damian (Lead))")).toBe("Setup — Damian (Lead)");
    expect(normalizeCrewLineLabel("Day 1 — Damian (Damian)")).toBe("Day 1 — Damian");
  });

  it("leaves distinct role + assignee labels alone", () => {
    expect(normalizeCrewLineLabel("Sound (Damian (Lead))")).toBe("Sound (Damian (Lead))");
    expect(normalizeCrewLineLabel("FOH (Open slot)")).toBe("FOH (Open slot)");
  });
});

describe("groupInvoiceSections", () => {
  it("buckets both equipment sections under equipment", () => {
    const grouped = groupInvoiceSections([
      line("equipment_package"),
      line("equipment_type"),
      line("external_rental"),
      line("artist"),
      line("crew"),
      line("fee"),
    ]);
    expect(grouped.equipment).toHaveLength(2);
    expect(grouped.external).toHaveLength(1);
    expect(grouped.artists).toHaveLength(1);
    expect(grouped.crew).toHaveLength(1);
    expect(grouped.fees).toHaveLength(1);
  });

  it("ignores unknown sections", () => {
    const grouped = groupInvoiceSections([line("mystery")]);
    expect(grouped.equipment).toHaveLength(0);
    expect(grouped.external).toHaveLength(0);
    expect(grouped.artists).toHaveLength(0);
    expect(grouped.crew).toHaveLength(0);
    expect(grouped.fees).toHaveLength(0);
  });
});

describe("buildInvoiceDocumentData", () => {
  const invoice = { invoiceNumber: "INV-1" } as InvoiceDocumentInvoice;

  it("keeps provided line ids", () => {
    const result = buildInvoiceDocumentData({
      invoice,
      lineItems: [{ id: "keep-me", section: "crew", label: "FOH", quantity: 1, rateUsd: 1, amountUsd: 1 }],
    });
    expect(result.lineItems[0].id).toBe("keep-me");
  });

  it("synthesizes a stable id from section and index when missing", () => {
    const result = buildInvoiceDocumentData({
      invoice,
      lineItems: [
        { section: "crew", label: "A", quantity: 1, rateUsd: 1, amountUsd: 1 },
        { section: "crew", label: "B", quantity: 1, rateUsd: 1, amountUsd: 1 },
      ],
    });
    expect(result.lineItems.map((l) => l.id)).toEqual(["crew-0", "crew-1"]);
  });

  it("normalizes duplicated crew labels", () => {
    const result = buildInvoiceDocumentData({
      invoice,
      lineItems: [
        {
          section: "crew",
          label: "Alex (Alex (Lead))",
          quantity: 1,
          rateUsd: 1,
          amountUsd: 1,
        },
      ],
    });
    expect(result.lineItems[0].label).toBe("Alex (Lead)");
  });
});
