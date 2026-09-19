import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCalendarFeed } from "./calendar-feed";

const ICS_BODY = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";

describe("fetchCalendarFeed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches the ICS from the Convex site origin", async () => {
    const fetchSpy = vi.fn(async () => new Response(ICS_BODY, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchCalendarFeed("https://example.convex.site");
    expect(result).toEqual({ ok: true, body: ICS_BODY });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.convex.site/calendar.ics",
      expect.anything(),
    );
  });

  it("tolerates a trailing slash on the site URL", async () => {
    const fetchSpy = vi.fn(async () => new Response(ICS_BODY, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await fetchCalendarFeed("https://example.convex.site/");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.convex.site/calendar.ics",
      expect.anything(),
    );
  });

  it("reports 502 when the upstream feed is not OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );

    const result = await fetchCalendarFeed("https://example.convex.site");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(502);
  });

  it("reports 502 when the upstream body is not a calendar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>not ics</html>", { status: 200 })),
    );

    const result = await fetchCalendarFeed("https://example.convex.site");
    expect(result.ok).toBe(false);
  });

  it("reports 502 when the request throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const result = await fetchCalendarFeed("https://example.convex.site");
    expect(result.ok).toBe(false);
  });
});
