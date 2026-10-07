import { describe, expect, it } from "vitest";
import {
  getRingClipUrl,
  listRingCameras,
  parseRingRefreshToken,
  refreshRingAuth,
  RingAuthError,
  RingRequestError,
  ringClipKind,
  searchRingClips,
  wrapRingRefreshToken,
  type RingFetch,
} from "./ringClient";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function recordingFetch(response: Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl: RingFetch = async (url, init) => {
    calls.push({ url, init });
    return response;
  };
  return { calls, fetchImpl };
}

describe("parseRingRefreshToken", () => {
  it("unwraps ring-auth-cli output and keeps its hardware id", () => {
    const wrapped = wrapRingRefreshToken({ refreshToken: "rt-1", hardwareId: "hid-1" });
    expect(parseRingRefreshToken(`"${wrapped}"\n`, () => "unused")).toEqual({
      refreshToken: "rt-1",
      hardwareId: "hid-1",
    });
  });

  it("accepts the whole line ring-auth-cli prints", () => {
    const wrapped = wrapRingRefreshToken({ refreshToken: "rt-1", hardwareId: "hid-1" });
    expect(parseRingRefreshToken(`"refreshToken": "${wrapped}"`, () => "unused")).toEqual({
      refreshToken: "rt-1",
      hardwareId: "hid-1",
    });
  });

  it("accepts a bare token with a new hardware id", () => {
    expect(parseRingRefreshToken("plain-token", () => "new-hid")).toEqual({
      refreshToken: "plain-token",
      hardwareId: "new-hid",
    });
  });

  it("rejects an empty paste", () => {
    expect(() => parseRingRefreshToken("  ", () => "x")).toThrow(/Paste the refresh token/);
  });
});

describe("refreshRingAuth", () => {
  it("returns the rotated token wrapped with the same hardware id", async () => {
    const { calls, fetchImpl } = recordingFetch(
      json({ access_token: "at", refresh_token: "rt-2", expires_in: 3600 }),
    );
    const auth = await refreshRingAuth(fetchImpl, { refreshToken: "rt-1", hardwareId: "hid-1" }, 1_000);
    expect(auth).toEqual({
      accessToken: "at",
      refreshToken: wrapRingRefreshToken({ refreshToken: "rt-2", hardwareId: "hid-1" }),
      expiresAt: 1_000 + 3_600_000,
    });
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "rt-1",
    });
  });

  it("asks for a reconnect when Ring rejects the token", async () => {
    const { fetchImpl } = recordingFetch(json({ error: "invalid_grant" }, 400));
    await expect(refreshRingAuth(fetchImpl, { refreshToken: "x", hardwareId: "h" }, 0)).rejects.toBeInstanceOf(
      RingAuthError,
    );
  });
});

describe("refreshRingAuth errors", () => {
  it("retries other 400s instead of asking for a reconnect", async () => {
    const { fetchImpl } = recordingFetch(json({ error: "invalid_request" }, 400));
    await expect(refreshRingAuth(fetchImpl, { refreshToken: "x", hardwareId: "h" }, 0)).rejects.toBeInstanceOf(
      RingRequestError,
    );
  });
});

/** Answers each request with the first route whose key appears in the URL. */
function routedFetch(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const fetchImpl: RingFetch = async (url) => {
    calls.push(url);
    const key = Object.keys(routes).find((route) => url.includes(route));
    return key ? routes[key]() : json({}, 404);
  };
  return { calls, fetchImpl };
}

function ringEvent(id: string, startTime: string, extra: Record<string, unknown> = {}) {
  return {
    event_id: id,
    start_time: startTime,
    event_type: "motion",
    duration_ms: 31_400,
    cv: { person_detected: false },
    visualizations: {
      cloud_media_visualization: {
        media: [
          { file_type: "VIDEO", url: `https://video/${id}.mp4` },
          { file_type: "THUMBNAIL", url: `https://thumb/${id}` },
        ],
      },
    },
    ...extra,
  };
}

describe("Ring devices and clips", () => {
  it("lists owned cameras and cameras at shared locations", async () => {
    const { fetchImpl } = routedFetch({
      ring_devices: () =>
        json({
          doorbots: [],
          chimes: [{ id: 7, kind: "chime_v2" }],
          stickup_cams: [
            {
              id: 42,
              description: "Loading dock",
              location_id: "loc",
              kind: "stickup_cam_v4",
              battery_life: "87",
              alerts: { connection: "online" },
            },
          ],
        }),
      "device_info/v3/devices": () =>
        json({
          devices: [
            { id: 42, kind: "stickup_cam_v4", description: "Loading dock" },
            {
              id: 99,
              kind: "cocoa_camera",
              description: "Tech room",
              location_id: "shared-loc",
              owned: false,
              battery_life: "62",
              alerts: { connection: "offline" },
            },
            { id: 8, kind: "chime_pro_v2" },
            { kind: "cocoa_camera" },
          ],
        }),
    });
    expect(await listRingCameras(fetchImpl, "at", "hid")).toEqual([
      {
        deviceId: 42,
        name: "Loading dock",
        locationId: "loc",
        model: "stickup_cam_v4",
        batteryPercent: 87,
        online: true,
      },
      {
        deviceId: 99,
        name: "Tech room",
        locationId: "shared-loc",
        model: "cocoa_camera",
        batteryPercent: 62,
        online: false,
      },
    ]);
  });

  it("pages event history back to the start instant", async () => {
    const pages = [
      json({
        items: [
          ringEvent("e3", "2026-10-06T22:00:00.000Z", { cv: { person_detected: true } }),
          ringEvent("e2", "2026-10-05T10:00:00.000Z", { event_type: "on_demand", duration_ms: 0 }),
        ],
        pagination_key: "page-2",
      }),
      json({
        items: [{ start_time: "2026-10-04T00:00:00.000Z" }, ringEvent("e1", "2026-10-01T00:00:00.000Z")],
        pagination_key: "page-3",
      }),
    ];
    const { calls, fetchImpl } = routedFetch({ "history/devices/42": () => pages.shift() ?? json({ items: [] }) });
    const clips = await searchRingClips(fetchImpl, "at", "hid", {
      deviceId: 42,
      since: Date.parse("2026-10-02T00:00:00.000Z"),
    });
    expect(clips).toEqual([
      {
        dingId: "e3",
        deviceId: 42,
        kind: "motion",
        rawKind: "motion",
        createdAt: Date.parse("2026-10-06T22:00:00.000Z"),
        durationSec: 31,
        personDetected: true,
        thumbnailUrl: "https://thumb/e3",
      },
      {
        dingId: "e2",
        deviceId: 42,
        kind: "live",
        rawKind: "on_demand",
        createdAt: Date.parse("2026-10-05T10:00:00.000Z"),
        durationSec: undefined,
        personDetected: false,
        thumbnailUrl: "https://thumb/e2",
      },
    ]);
    // e1 is older than `since`, so the third page is never requested.
    expect(calls).toHaveLength(2);
    expect(new URL(calls[1]).searchParams.get("pagination_key")).toBe("page-2");
  });

  it("returns the clip's video link from its event", async () => {
    const { calls, fetchImpl } = routedFetch({
      "history/events/e3": () => json(ringEvent("e3", "2026-10-06T22:00:00.000Z")),
    });
    expect(await getRingClipUrl(fetchImpl, "at", "hid", "e3")).toBe("https://video/e3.mp4");
    expect(calls[0]).toBe("https://api.ring.com/evm/v2/history/events/e3");
  });

  it("says when Ring has no video yet", async () => {
    const { fetchImpl } = routedFetch({ "history/events/e4": () => json({ event_id: "e4" }) });
    await expect(getRingClipUrl(fetchImpl, "at", "hid", "e4")).rejects.toThrow(/no video/);
  });

  it("groups Ring's kinds", () => {
    expect(ringClipKind("ding")).toBe("ding");
    expect(ringClipKind("on_demand_link")).toBe("live");
    expect(ringClipKind("alarm")).toBe("other");
  });
});
