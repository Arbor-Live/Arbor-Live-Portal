import { describe, expect, it } from "vitest";
import { renderGolfCartEventReadyEmail } from "../src/render";
import type { GolfCartEventReadyEmailProps } from "../src/types";

const props = {
  eventTitle: "Spring Showcase",
  dateRangeLabel: "Fri, Apr 17 · 7:00 PM – 10:00 PM",
  eventUrl: "http://localhost:3000/dashboard/events/abc",
  setupLabel: "Fri, Apr 17 · 4:00 PM – 7:00 PM",
} satisfies GolfCartEventReadyEmailProps;

describe("renderGolfCartEventReadyEmail", () => {
  it("shows the event and its setup window, skipping a missing strike", async () => {
    const html = await renderGolfCartEventReadyEmail(props);
    expect(html).toContain("Spring Showcase");
    expect(html).toContain("4:00 PM – 7:00 PM");
    expect(html).not.toContain("Strike");
  });

  it("links to the event", async () => {
    const html = await renderGolfCartEventReadyEmail(props);
    expect(html).toContain("http://localhost:3000/dashboard/events/abc");
  });
});
