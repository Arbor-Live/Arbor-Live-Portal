import { describe, expect, it } from "vitest";
import { stripQuotedReply } from "./stripQuotedReply";

describe("stripQuotedReply", () => {
  it("cuts a Gmail reply at the 'On … wrote:' line", () => {
    const text = [
      "Thanks! Sounds good, we'll load in at 4pm.",
      "",
      "Best,",
      "Maya",
      "",
      "On Mon, Nov 3, 2025 at 10:14 AM Arbor Live <alreq-k3m9x2p@arbor.st> wrote:",
      "",
      "> Hi Maya,",
      "> Your quote is ready.",
      "",
    ].join("\n");
    expect(stripQuotedReply(text)).toBe(
      "Thanks! Sounds good, we'll load in at 4pm.\n\nBest,\nMaya",
    );
  });

  it("cuts a Gmail attribution wrapped over two lines", () => {
    const text = [
      "Can we move setup to 3pm?",
      "",
      "On Tue, Nov 4, 2025 at 9:02 AM Arbor Live Notifications",
      "<noreply@arbor.st> wrote:",
      "> Show details attached",
    ].join("\n");
    expect(stripQuotedReply(text)).toBe("Can we move setup to 3pm?");
  });

  it("cuts an Apple Mail reply", () => {
    const text = [
      "Yes, confirmed.",
      "",
      "Sent from my iPhone",
      "",
      "> On Nov 3, 2025, at 10:14 AM, Arbor Live <noreply@arbor.st> wrote:",
      ">",
      "> Please confirm the date.",
    ].join("\n");
    expect(stripQuotedReply(text)).toBe("Yes, confirmed.\n\nSent from my iPhone");
  });

  it("cuts an Outlook header block", () => {
    const text = [
      "Approved on our side.",
      "",
      "Jordan Lee",
      "Stanford Student Orgs",
      "",
      "From: Arbor Live <noreply@arbor.st>",
      "Sent: Monday, November 3, 2025 10:14 AM",
      "To: Jordan Lee <jordan@stanford.edu>",
      "Subject: Your quote is ready: ALINV-8H2QWE4",
      "",
      "Hi Jordan,",
    ].join("\n");
    expect(stripQuotedReply(text)).toBe(
      "Approved on our side.\n\nJordan Lee\nStanford Student Orgs",
    );
  });

  it("cuts at the underscore rule Outlook draws above its header", () => {
    const text = [
      "See below.",
      "________________________________",
      "From: Arbor Live",
      "Sent: Monday",
      "To: Jordan",
      "Subject: Quote",
    ].join("\n");
    expect(stripQuotedReply(text)).toBe("See below.");
  });

  it("cuts at -----Original Message-----", () => {
    const text = [
      "Forwarding the PO number: 88213",
      "",
      "-----Original Message-----",
      "From: Billing",
      "Sent: Friday",
    ].join("\n");
    expect(stripQuotedReply(text)).toBe("Forwarding the PO number: 88213");
  });

  it("cuts at a run of '>' lines with no attribution", () => {
    const text = ["Looks fine.", "", "> earlier text", "> more earlier text", "", "tail"].join("\n");
    expect(stripQuotedReply(text)).toBe("Looks fine.");
  });

  it("does not treat a lone '>' line as a quote", () => {
    expect(stripQuotedReply("a\n> b\nc")).toBe("a\n> b\nc");
  });

  it("does not treat a From: line without Sent/Date as a header block", () => {
    const text = "Please bill it to:\nFrom: the ASSU fund\nthanks";
    expect(stripQuotedReply(text)).toBe(text);
  });

  it("trims trailing signature dashes and whitespace", () => {
    const text = "See you Friday.\n\n-- \n\n\nOn Mon, Nov 3, 2025 at 1:00 PM A <a@b.co> wrote:\n> hi";
    expect(stripQuotedReply(text)).toBe("See you Friday.");
  });

  it("normalizes CRLF line endings", () => {
    const text = "Okay.\r\n\r\nOn Mon, Nov 3, 2025 at 1:00 PM A <a@b.co> wrote:\r\n> hi\r\n";
    expect(stripQuotedReply(text)).toBe("Okay.");
  });

  it("returns a message with no quoted history unchanged apart from trimming", () => {
    expect(stripQuotedReply("  Hello there\n\n")).toBe("Hello there");
  });

  it("falls back to the full text when the whole message is quoted", () => {
    const text = "On Mon, Nov 3, 2025 at 1:00 PM A <a@b.co> wrote:\n> hi";
    expect(stripQuotedReply(text)).toBe(text);
  });
});
