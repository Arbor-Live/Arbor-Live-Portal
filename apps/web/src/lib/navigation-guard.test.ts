import { describe, expect, it } from "vitest";
import { shouldGuardNavigationClick, type NavigationGuardClick } from "./navigation-guard";

const currentUrl = "https://portal.example/dashboard/ops-center/invoices/abc";

function click(overrides: Partial<NavigationGuardClick> = {}): NavigationGuardClick {
  return {
    href: "/dashboard/events/123",
    target: null,
    download: false,
    modified: false,
    button: 0,
    currentUrl,
    ...overrides,
  };
}

describe("shouldGuardNavigationClick", () => {
  it("guards a plain same-tab link to another page", () => {
    expect(shouldGuardNavigationClick(click())).toBe(true);
  });

  it("guards relative links resolved against the current page", () => {
    expect(shouldGuardNavigationClick(click({ href: "../invoices" }))).toBe(true);
    expect(shouldGuardNavigationClick(click({ href: "/dashboard/events" }))).toBe(true);
  });

  it("ignores modified and non-primary clicks", () => {
    expect(shouldGuardNavigationClick(click({ modified: true }))).toBe(false);
    expect(shouldGuardNavigationClick(click({ button: 1 }))).toBe(false);
    expect(shouldGuardNavigationClick(click({ button: 2 }))).toBe(false);
  });

  it("ignores downloads and links that open elsewhere", () => {
    expect(shouldGuardNavigationClick(click({ download: true }))).toBe(false);
    expect(shouldGuardNavigationClick(click({ target: "_blank" }))).toBe(false);
    expect(shouldGuardNavigationClick(click({ target: "_BLANK" }))).toBe(false);
    expect(shouldGuardNavigationClick(click({ target: "some-frame" }))).toBe(false);
    expect(shouldGuardNavigationClick(click({ target: "_self" }))).toBe(true);
    expect(shouldGuardNavigationClick(click({ target: "" }))).toBe(true);
  });

  it("ignores other origins and non-http schemes", () => {
    expect(shouldGuardNavigationClick(click({ href: "https://other.example/x" }))).toBe(false);
    expect(shouldGuardNavigationClick(click({ href: "mailto:crew@arbor.st" }))).toBe(false);
    expect(shouldGuardNavigationClick(click({ href: "tel:+15555550100" }))).toBe(false);
  });

  it("ignores same-page links, including hash links", () => {
    expect(shouldGuardNavigationClick(click({ href: "#feedback" }))).toBe(false);
    expect(shouldGuardNavigationClick(click({ href: "/dashboard/ops-center/invoices/abc#crew" }))).toBe(false);
    expect(shouldGuardNavigationClick(click({ href: "/dashboard/ops-center/invoices/abc?tab=fees" }))).toBe(false);
  });

  it("ignores missing and unparseable hrefs", () => {
    expect(shouldGuardNavigationClick(click({ href: null }))).toBe(false);
    expect(shouldGuardNavigationClick(click({ href: "" }))).toBe(false);
    expect(shouldGuardNavigationClick(click({ href: "https://" }))).toBe(false);
  });

  it("ignores routes that keep the draft mounted inside a surface prefix", () => {
    const prefix = "/dashboard/events/123";
    expect(
      shouldGuardNavigationClick(click({ href: "/dashboard/events/123/billing" }), prefix),
    ).toBe(false);
    expect(shouldGuardNavigationClick(click({ href: "/dashboard/events/123" }), prefix)).toBe(false);
    expect(
      shouldGuardNavigationClick(click({ href: "/dashboard/events/1234/schedule" }), prefix),
    ).toBe(true);
    expect(
      shouldGuardNavigationClick(click({ href: "/dashboard/events/456/billing" }), prefix),
    ).toBe(true);
  });
});
