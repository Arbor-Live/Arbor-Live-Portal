import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bookingAddressFor,
  extractDisplayName,
  extractEmailAddress,
  parseBookingAddress,
} from "./emailAddresses";

let savedDomain: string | undefined;
beforeEach(() => {
  savedDomain = process.env.INBOUND_EMAIL_DOMAIN;
  delete process.env.INBOUND_EMAIL_DOMAIN;
});
afterEach(() => {
  if (savedDomain === undefined) delete process.env.INBOUND_EMAIL_DOMAIN;
  else process.env.INBOUND_EMAIL_DOMAIN = savedDomain;
});

describe("bookingAddressFor", () => {
  it("lowercases request and invoice numbers", () => {
    expect(bookingAddressFor({ kind: "request", requestNumber: "ALREQ-K3M9X2P" })).toBe(
      "alreq-k3m9x2p@arbor.st",
    );
    expect(bookingAddressFor({ kind: "invoice", invoiceNumber: "ALINV-8H2QWE4" })).toBe(
      "alinv-8h2qwe4@arbor.st",
    );
  });

  it("prefixes event ids with alevt-", () => {
    expect(bookingAddressFor({ kind: "event", id: "jx7abc123" })).toBe("alevt-jx7abc123@arbor.st");
  });

  it("has no address for a legacy request without a number", () => {
    expect(bookingAddressFor({ kind: "request" })).toBeNull();
    expect(bookingAddressFor({ kind: "request", requestNumber: "  " })).toBeNull();
  });

  it("uses INBOUND_EMAIL_DOMAIN when set", () => {
    process.env.INBOUND_EMAIL_DOMAIN = "Mail.Example.org";
    expect(bookingAddressFor({ kind: "invoice", invoiceNumber: "ALINV-1" })).toBe(
      "alinv-1@mail.example.org",
    );
  });
});

describe("parseBookingAddress", () => {
  it("parses request, invoice and event addresses case-insensitively", () => {
    expect(parseBookingAddress("ALREQ-k3m9x2p@Arbor.ST")).toEqual({
      kind: "request",
      number: "ALREQ-K3M9X2P",
    });
    expect(parseBookingAddress("alinv-8h2qwe4@arbor.st")).toEqual({
      kind: "invoice",
      number: "ALINV-8H2QWE4",
    });
    expect(parseBookingAddress("AlEvt-JX7ABC123@arbor.st")).toEqual({
      kind: "event",
      id: "jx7abc123",
    });
  });

  it("tolerates the Name <addr> form", () => {
    expect(parseBookingAddress('"Arbor Live" <alreq-k3m9x2p@arbor.st>')).toEqual({
      kind: "request",
      number: "ALREQ-K3M9X2P",
    });
  });

  it("rejects other domains and non-booking local parts", () => {
    expect(parseBookingAddress("alreq-k3m9x2p@example.com")).toBeNull();
    expect(parseBookingAddress("alreq-k3m9x2p@sub.arbor.st")).toBeNull();
    expect(parseBookingAddress("noreply@arbor.st")).toBeNull();
    expect(parseBookingAddress("alreq-@arbor.st")).toBeNull();
    expect(parseBookingAddress("alreq-a b@arbor.st")).toBeNull();
    expect(parseBookingAddress("not an address")).toBeNull();
  });

  it("only accepts the configured inbound domain", () => {
    process.env.INBOUND_EMAIL_DOMAIN = "mail.example.org";
    expect(parseBookingAddress("alreq-k3m9x2p@arbor.st")).toBeNull();
    expect(parseBookingAddress("alreq-k3m9x2p@mail.example.org")).not.toBeNull();
  });
});

describe("address helpers", () => {
  it("extracts emails and display names", () => {
    expect(extractEmailAddress("Maya R <Maya@Example.com>")).toBe("maya@example.com");
    expect(extractEmailAddress("maya@example.com")).toBe("maya@example.com");
    expect(extractEmailAddress("nope")).toBeNull();
    expect(extractDisplayName('"Maya R" <maya@example.com>')).toBe("Maya R");
    expect(extractDisplayName("maya@example.com")).toBeUndefined();
    expect(extractDisplayName("<maya@example.com>")).toBeUndefined();
  });
});
