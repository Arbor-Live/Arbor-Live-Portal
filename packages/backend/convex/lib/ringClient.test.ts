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

describe("Ring devices and clips", () => {
  it("lists doorbells and battery cams", async () => {
    const { fetchImpl } = recordingFetch(
      json({
        doorbots: [],
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
    );
    expect(await listRingCameras(fetchImpl, "at", "hid")).toEqual([
      {
        deviceId: 42,
        name: "Loading dock",
        locationId: "loc",
        model: "stickup_cam_v4",
        batteryPercent: 87,
        online: true,
      },
    ]);
  });

  it("maps video search results to clips", async () => {
    const { calls, fetchImpl } = recordingFetch(
      json({
        video_search: [
          {
            ding_id: "7001",
            created_at: 1_700_000_000_000,
            kind: "motion",
            duration: 31,
            thumbnail_url: "https://thumb",
            cv_properties: { person_detected: true },
          },
          { ding_id: 7002, created_at: 1_700_000_100_000, kind: "on_demand", duration: 0 },
          { created_at: 1 },
        ],
      }),
    );
    const clips = await searchRingClips(fetchImpl, "at", "hid", { deviceId: 42, from: 10, to: 20 });
    expect(clips).toEqual([
      {
        dingId: "7001",
        deviceId: 42,
        kind: "motion",
        rawKind: "motion",
        createdAt: 1_700_000_000_000,
        durationSec: 31,
        personDetected: true,
        thumbnailUrl: "https://thumb",
      },
      {
        dingId: "7002",
        deviceId: 42,
        kind: "live",
        rawKind: "on_demand",
        createdAt: 1_700_000_100_000,
        durationSec: undefined,
        personDetected: false,
        thumbnailUrl: undefined,
      },
    ]);
    const url = new URL(calls[0].url);
    expect(url.searchParams.get("doorbot_id")).toBe("42");
    expect(url.searchParams.get("date_from")).toBe("10");
    expect(url.searchParams.get("date_to")).toBe("20");
  });

  it("returns the clip's playback link", async () => {
    const { calls, fetchImpl } = recordingFetch(json({ url: "https://video.mp4" }));
    expect(await getRingClipUrl(fetchImpl, "at", "hid", "7001")).toBe("https://video.mp4");
    expect(calls[0].url).toContain("dings/7001/share/play?disable_redirect=true");
  });

  it("groups Ring's kinds", () => {
    expect(ringClipKind("ding")).toBe("ding");
    expect(ringClipKind("on_demand_link")).toBe("live");
    expect(ringClipKind("alarm")).toBe("other");
  });
});
