import { describe, expect, it } from "vitest";
import { SVIX_TOLERANCE_SECONDS, verifySvixSignature } from "./svixSignature";

const SECRET_BYTES = new Uint8Array(24).map((_, i) => i * 7 + 1);
const SECRET = `whsec_${Buffer.from(SECRET_BYTES).toString("base64")}`;
const OTHER_SECRET = `whsec_${Buffer.from(SECRET_BYTES.map((b) => b ^ 0xff)).toString("base64")}`;
const NOW_MS = Date.UTC(2026, 10, 3, 18);
const TIMESTAMP = String(Math.floor(NOW_MS / 1000));
const ID = "msg_2abc";
const BODY = JSON.stringify({ type: "email.received", data: { email_id: "re_123" } });

async function sign(secret: string, id: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    Buffer.from(secret.slice("whsec_".length), "base64"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  return `v1,${Buffer.from(mac).toString("base64")}`;
}

async function verify(overrides: Partial<Parameters<typeof verifySvixSignature>[0]> = {}) {
  return await verifySvixSignature({
    secret: SECRET,
    id: ID,
    timestamp: TIMESTAMP,
    signature: await sign(SECRET, ID, TIMESTAMP, BODY),
    body: BODY,
    nowMs: NOW_MS,
    ...overrides,
  });
}

describe("verifySvixSignature", () => {
  it("accepts a valid signature", async () => {
    expect(await verify()).toBe(true);
  });

  it("rejects a tampered body", async () => {
    expect(await verify({ body: BODY.replace("re_123", "re_999") })).toBe(false);
  });

  it("rejects a tampered id or timestamp", async () => {
    expect(await verify({ id: "msg_other" })).toBe(false);
    const shifted = String(Number(TIMESTAMP) + 1);
    expect(await verify({ timestamp: shifted })).toBe(false);
  });

  it("rejects a signature made with a different secret", async () => {
    expect(await verify({ signature: await sign(OTHER_SECRET, ID, TIMESTAMP, BODY) })).toBe(false);
  });

  it("rejects a stale or future timestamp even when correctly signed", async () => {
    const stale = String(Number(TIMESTAMP) - SVIX_TOLERANCE_SECONDS - 1);
    expect(
      await verify({ timestamp: stale, signature: await sign(SECRET, ID, stale, BODY) }),
    ).toBe(false);
    const future = String(Number(TIMESTAMP) + SVIX_TOLERANCE_SECONDS + 1);
    expect(
      await verify({ timestamp: future, signature: await sign(SECRET, ID, future, BODY) }),
    ).toBe(false);
  });

  it("accepts a timestamp at the edge of the tolerance", async () => {
    const edge = String(Number(TIMESTAMP) - SVIX_TOLERANCE_SECONDS);
    expect(
      await verify({ timestamp: edge, signature: await sign(SECRET, ID, edge, BODY) }),
    ).toBe(true);
  });

  it("passes when any signature in the list matches", async () => {
    const good = await sign(SECRET, ID, TIMESTAMP, BODY);
    const bad = await sign(OTHER_SECRET, ID, TIMESTAMP, BODY);
    expect(await verify({ signature: `${bad} ${good}` })).toBe(true);
    expect(await verify({ signature: `v1,notbase64!! ${good}` })).toBe(true);
    expect(await verify({ signature: `${bad} v1,${Buffer.from("junk").toString("base64")}` })).toBe(
      false,
    );
  });

  it("ignores signature versions other than v1", async () => {
    const good = await sign(SECRET, ID, TIMESTAMP, BODY);
    expect(await verify({ signature: good.replace("v1,", "v2,") })).toBe(false);
  });

  it("rejects a malformed timestamp or secret", async () => {
    expect(await verify({ timestamp: "soon" })).toBe(false);
    expect(await verify({ secret: "whsec_%%%" })).toBe(false);
  });
});
