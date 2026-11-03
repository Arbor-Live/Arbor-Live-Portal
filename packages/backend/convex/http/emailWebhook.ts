import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { verifySvixSignature } from "../lib/svixSignature";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resend Receiving → `email.received`. The webhook only carries the email id;
 * the body is fetched by the scheduled action so this answers inside Resend's
 * delivery timeout.
 */
export const handleEmailWebhook = httpAction(async (ctx, req) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("RESEND_WEBHOOK_SECRET is not configured");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const body = await req.text();
  const verified = await verifySvixSignature({
    secret,
    id: req.headers.get("svix-id") ?? "",
    timestamp: req.headers.get("svix-timestamp") ?? "",
    signature: req.headers.get("svix-signature") ?? "",
    body,
  });
  if (!verified) return new Response("Invalid signature", { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Body is not JSON", { status: 400 });
  }
  if (!isRecord(payload) || typeof payload.type !== "string") {
    return new Response("Missing event type", { status: 400 });
  }
  if (payload.type !== "email.received") return new Response(null, { status: 200 });

  const emailId = isRecord(payload.data) ? payload.data.email_id : undefined;
  if (typeof emailId !== "string" || !emailId) {
    return new Response("Missing data.email_id", { status: 400 });
  }

  await ctx.scheduler.runAfter(0, internal.emailInbound.processInboundEmail, {
    resendEmailId: emailId,
  });
  return new Response(null, { status: 200 });
});
