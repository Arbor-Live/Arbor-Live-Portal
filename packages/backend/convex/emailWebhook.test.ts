// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTest } from "./test/setup.helpers";

const SECRET_BYTES = new Uint8Array(24).map((_, i) => i * 5 + 3);
const SECRET = `whsec_${btoa(String.fromCharCode(...SECRET_BYTES))}`;

async function signedRequest(body: string, secret = SECRET, timestampOffsetSeconds = 0) {
  const id = "msg_test";
  const timestamp = String(Math.floor(Date.now() / 1000) + timestampOffsetSeconds);
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(secret.slice("whsec_".length)), (c) => c.charCodeAt(0)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)),
  );
  return {
    method: "POST",
    body,
    headers: {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${btoa(String.fromCharCode(...mac))}`,
    },
  };
}

let savedSecret: string | undefined;
beforeEach(() => {
  savedSecret = process.env.RESEND_WEBHOOK_SECRET;
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
});
afterEach(() => {
  if (savedSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
  else process.env.RESEND_WEBHOOK_SECRET = savedSecret;
});

describe("POST /email-webhook", () => {
  it("returns 500 when the secret is not configured", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const res = await makeTest().fetch("/email-webhook", await signedRequest("{}"));
    expect(res.status).toBe(500);
  });

  it("returns 401 for a missing or bad signature", async () => {
    const t = makeTest();
    expect((await t.fetch("/email-webhook", { method: "POST", body: "{}" })).status).toBe(401);
    const forged = await signedRequest("{}", `whsec_${btoa("a-different-secret-key!!")}`);
    expect((await t.fetch("/email-webhook", forged)).status).toBe(401);
  });

  it("returns 401 for a stale timestamp", async () => {
    const res = await makeTest().fetch("/email-webhook", await signedRequest("{}", SECRET, -600));
    expect(res.status).toBe(401);
  });

  it("returns 400 for a signed body that is not a valid event", async () => {
    const t = makeTest();
    expect((await t.fetch("/email-webhook", await signedRequest("not json"))).status).toBe(400);
    expect((await t.fetch("/email-webhook", await signedRequest('{"data":{}}'))).status).toBe(400);
    const noId = JSON.stringify({ type: "email.received", data: {} });
    expect((await t.fetch("/email-webhook", await signedRequest(noId))).status).toBe(400);
  });

  it("acknowledges other event types without scheduling anything", async () => {
    const t = makeTest();
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "re_1" } });
    expect((await t.fetch("/email-webhook", await signedRequest(body))).status).toBe(200);
    const scheduled = await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled).toHaveLength(0);
  });

  it("schedules processing for email.received and returns 200", async () => {
    const t = makeTest();
    const body = JSON.stringify({ type: "email.received", data: { email_id: "re_42" } });
    expect((await t.fetch("/email-webhook", await signedRequest(body))).status).toBe(200);
    const scheduled = await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({
      name: "emailInbound:processInboundEmail",
      args: [{ resendEmailId: "re_42" }],
    });
  });
});
