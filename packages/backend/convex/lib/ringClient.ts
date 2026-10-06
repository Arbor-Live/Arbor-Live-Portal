/**
 * A minimal client for Ring's (unofficial, undocumented) REST API: the handful
 * of calls the camera page needs, mirrored from `ring-client-api`
 * (github.com/dgreif/ring) rather than importing it, because that package
 * pulls in WebRTC, push-notification and system-info dependencies that only
 * live streaming uses.
 *
 * Ring rotates the refresh token on every token refresh, so callers must
 * persist `refreshToken` from each `refreshRingAuth` result.
 */

const OAUTH_URL = "https://oauth.ring.com/oauth/token";
const CLIENT_API = "https://api.ring.com/clients_api/";
const USER_AGENT = "android:com.ringapp";

export type RingFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** A refresh token plus the hardware id Ring bound it to. */
export type RingCredentials = { refreshToken: string; hardwareId: string };

export type RingAuth = {
  /** The rotated token, wrapped like `ring-auth-cli` output. Persist it. */
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
};

export type RingCamera = {
  deviceId: number;
  name: string;
  locationId: string;
  model: string;
  batteryPercent?: number;
  online?: boolean;
};

export type RingClipKind = "motion" | "ding" | "live" | "other";

export type RingClip = {
  dingId: string;
  deviceId: number;
  kind: RingClipKind;
  rawKind: string;
  createdAt: number;
  durationSec?: number;
  personDetected: boolean;
  thumbnailUrl?: string;
};

/** Thrown when Ring rejects the stored token; the admin has to reconnect. */
export class RingAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RingAuthError";
  }
}

export class RingRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RingRequestError";
  }
}

function encodeBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(text: string) {
  const binary = atob(text);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

/**
 * `ring-auth-cli` prints base64 JSON `{ rt, hid }`; older tokens are the bare
 * `rt`. A bare token gets a fresh hardware id, which Ring then binds to it.
 */
export function parseRingRefreshToken(raw: string, newHardwareId: () => string): RingCredentials {
  const token = raw.trim().replace(/^"|"$/g, "");
  if (!token) throw new Error("Paste the refresh token from ring-auth-cli.");
  try {
    const parsed: unknown = JSON.parse(decodeBase64(token));
    if (parsed && typeof parsed === "object" && "rt" in parsed && typeof parsed.rt === "string") {
      const hid = "hid" in parsed && typeof parsed.hid === "string" && parsed.hid ? parsed.hid : newHardwareId();
      return { refreshToken: parsed.rt, hardwareId: hid };
    }
  } catch {
    // Not wrapped: a bare refresh token.
  }
  return { refreshToken: token, hardwareId: newHardwareId() };
}

/** Wrap a refresh token the way `ring-auth-cli` does, so it can be pasted back elsewhere. */
export function wrapRingRefreshToken(credentials: RingCredentials) {
  return encodeBase64(JSON.stringify({ rt: credentials.refreshToken, hid: credentials.hardwareId }));
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function field(value: unknown, key: string): unknown {
  return value && typeof value === "object" && key in value ? (value as Record<string, unknown>)[key] : undefined;
}

/** Trade the refresh token for an access token (and a rotated refresh token). */
export async function refreshRingAuth(
  fetchImpl: RingFetch,
  credentials: RingCredentials,
  now: number,
): Promise<RingAuth> {
  const response = await fetchImpl(OAUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "2fa-support": "true",
      "2fa-code": "",
      hardware_id: credentials.hardwareId,
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      client_id: "ring_official_android",
      scope: "client",
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
    }),
  });
  const body = await readJson(response);
  if (!response.ok) {
    // Only `invalid_grant` (or an auth status) proves the token is dead; other 400s are retried.
    if (field(body, "error") === "invalid_grant" || response.status === 401 || response.status === 412) {
      throw new RingAuthError("Ring rejected the saved sign-in. Reconnect with a new refresh token.");
    }
    throw new RingRequestError(`Ring sign-in failed (${response.status}).`, response.status);
  }
  const accessToken = field(body, "access_token");
  const refreshToken = field(body, "refresh_token");
  const expiresIn = field(body, "expires_in");
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
    throw new RingRequestError("Ring sign-in returned an unexpected response.", response.status);
  }
  return {
    accessToken,
    refreshToken: wrapRingRefreshToken({ refreshToken, hardwareId: credentials.hardwareId }),
    expiresAt: now + (typeof expiresIn === "number" ? expiresIn : 3600) * 1000,
  };
}

function authHeaders(accessToken: string, hardwareId: string) {
  return {
    Accept: "application/json",
    authorization: `Bearer ${accessToken}`,
    hardware_id: hardwareId,
    "User-Agent": USER_AGENT,
  };
}

async function ringGet(fetchImpl: RingFetch, url: string, accessToken: string, hardwareId: string) {
  const response = await fetchImpl(url, { headers: authHeaders(accessToken, hardwareId) });
  const body = await readJson(response);
  if (!response.ok) {
    throw new RingRequestError(`Ring request failed (${response.status}).`, response.status);
  }
  return body;
}

/** Register this "device" with Ring; clients_api calls 404 without a session. */
export async function createRingSession(fetchImpl: RingFetch, accessToken: string, hardwareId: string) {
  const response = await fetchImpl(`${CLIENT_API}session`, {
    method: "POST",
    headers: { ...authHeaders(accessToken, hardwareId), "Content-Type": "application/json" },
    body: JSON.stringify({
      device: {
        hardware_id: hardwareId,
        metadata: { api_version: 11, device_model: "Arbor Live Portal" },
        os: "android",
      },
    }),
  });
  if (!response.ok) {
    throw new RingRequestError(`Ring session failed (${response.status}).`, response.status);
  }
}

function toCamera(device: unknown): RingCamera | null {
  const id = field(device, "id");
  if (typeof id !== "number") return null;
  const battery = Number(field(device, "battery_life"));
  const connection = field(field(device, "alerts"), "connection");
  return {
    deviceId: id,
    name: String(field(device, "description") ?? "Ring camera"),
    locationId: String(field(device, "location_id") ?? ""),
    model: String(field(device, "kind") ?? ""),
    batteryPercent: Number.isFinite(battery) ? battery : undefined,
    online: connection === "online" ? true : connection === "offline" ? false : undefined,
  };
}

/** Every camera on the account: doorbells, stick-up/battery cams, shared doorbells. */
export async function listRingCameras(fetchImpl: RingFetch, accessToken: string, hardwareId: string) {
  const body = await ringGet(fetchImpl, `${CLIENT_API}ring_devices`, accessToken, hardwareId);
  const groups = ["doorbots", "authorized_doorbots", "stickup_cams"];
  return groups.flatMap((group) => {
    const devices = field(body, group);
    return Array.isArray(devices) ? devices.map(toCamera).filter((camera) => camera !== null) : [];
  });
}

export function ringClipKind(rawKind: string): RingClipKind {
  if (rawKind === "motion") return "motion";
  if (rawKind === "ding") return "ding";
  if (rawKind === "on_demand" || rawKind === "on_demand_link") return "live";
  return "other";
}

function toClip(entry: unknown, deviceId: number): RingClip | null {
  const dingId = field(entry, "ding_id");
  const createdAt = field(entry, "created_at");
  if ((typeof dingId !== "string" && typeof dingId !== "number") || typeof createdAt !== "number") return null;
  const rawKind = String(field(entry, "kind") ?? "other");
  const duration = field(entry, "duration");
  const thumbnail = field(entry, "thumbnail_url");
  return {
    dingId: String(dingId),
    deviceId,
    kind: ringClipKind(rawKind),
    rawKind,
    createdAt,
    durationSec: typeof duration === "number" && duration > 0 ? duration : undefined,
    personDetected: Boolean(field(field(entry, "cv_properties"), "person_detected")),
    thumbnailUrl: typeof thumbnail === "string" && thumbnail ? thumbnail : undefined,
  };
}

/** Recorded clips between two instants, oldest first. Needs Ring Protect. */
export async function searchRingClips(
  fetchImpl: RingFetch,
  accessToken: string,
  hardwareId: string,
  args: { deviceId: number; from: number; to: number },
): Promise<RingClip[]> {
  const params = new URLSearchParams({
    doorbot_id: String(args.deviceId),
    date_from: String(Math.floor(args.from)),
    date_to: String(Math.floor(args.to)),
    order: "asc",
    api_version: "11",
  });
  params.append("includes[]", "pva");
  const body = await ringGet(fetchImpl, `${CLIENT_API}video_search/history?${params}`, accessToken, hardwareId);
  const entries = field(body, "video_search");
  return Array.isArray(entries)
    ? entries.map((entry) => toClip(entry, args.deviceId)).filter((clip) => clip !== null)
    : [];
}

/** A short-lived MP4 link for one clip. */
export async function getRingClipUrl(fetchImpl: RingFetch, accessToken: string, hardwareId: string, dingId: string) {
  const body = await ringGet(
    fetchImpl,
    `${CLIENT_API}dings/${encodeURIComponent(dingId)}/share/play?disable_redirect=true`,
    accessToken,
    hardwareId,
  );
  const url = field(body, "url");
  if (typeof url !== "string" || !url) {
    throw new RingRequestError("Ring has no video for this clip yet.", 404);
  }
  return url;
}
