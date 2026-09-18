import { describe, expect, it } from "vitest";
import { renderThisWeekAtArborEmail } from "../src/render";

/**
 * Guards the newsletter render: an empty/broken weekly email is a silent
 * failure that only shows up in 300 inboxes, so assert the pieces readers
 * depend on (events, links, per-recipient unsubscribe placeholder) survive.
 */
describe("renderThisWeekAtArborEmail", () => {
  const props = {
    recipientName: "Alex",
    weekLabel: "May 5 – May 11",
    allEventsUrl: "https://arborlive.stanford.edu/events",
    unsubscribeUrl: "{{{RESEND_UNSUBSCRIBE_URL}}}",
    events: [
      {
        title: "Spring Showcase",
        whenLabel: "Fri, May 9 7:00 PM",
        venueName: "Memorial Church",
        hostLabel: "Arbor Live",
        caption: "Six acts.",
        eventUrl: "https://arborlive.stanford.edu/events/one",
        openMicSignupUrl: "https://arborlive.stanford.edu/open-mic",
      },
      {
        title: "Outdoor Concert",
        whenLabel: "Sat, May 10 5:30 PM",
        venueName: "White Plaza",
        eventUrl: "https://arborlive.stanford.edu/events/two",
      },
    ],
  };

  it("renders every event with its detail link", async () => {
    const html = await renderThisWeekAtArborEmail(props);
    expect(html).toContain("Spring Showcase");
    expect(html).toContain("Outdoor Concert");
    expect(html).toContain(props.events[0].eventUrl);
    expect(html).toContain(props.events[1].eventUrl);
  });

  it("preserves the Resend unsubscribe placeholder verbatim", async () => {
    const html = await renderThisWeekAtArborEmail(props);
    expect(html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
  });

  it("includes the Open Mic link only for events that accept sign-ups", async () => {
    const html = await renderThisWeekAtArborEmail(props);
    expect(html).toContain(props.events[0].openMicSignupUrl);
    // Exactly one open-mic link total — the second event must not invent one.
    expect(html.split("/open-mic").length - 1).toBe(1);
  });
});
