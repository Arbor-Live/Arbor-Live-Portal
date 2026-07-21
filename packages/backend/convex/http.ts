import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";
import { handleShortLinkLookup } from "./http/shortLinkRedirect";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

http.route({
  path: "/short-link",
  method: "GET",
  handler: handleShortLinkLookup,
});

http.route({
  path: "/webhooks/resend/inbound",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const payload = await req.text();
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response("Missing webhook headers", { status: 400 });
    }

    try {
      const result = await ctx.runAction(internal.http.resendInbound.handleInboundEmail, {
        payload,
        svixId,
        svixTimestamp,
        svixSignature,
      });
      return Response.json(result, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook processing failed";
      console.error("Resend inbound webhook failed", message);
      return new Response(message, { status: 400 });
    }
  }),
});

export default http;
