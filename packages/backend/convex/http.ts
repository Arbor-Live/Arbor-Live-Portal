import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { handleShortLinkLookup } from "./http/shortLinkRedirect";
import { handleEmailWebhook } from "./http/emailWebhook";
import { handlePublicCalendar } from "./http/publicCalendar";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

http.route({
  path: "/short-link",
  method: "GET",
  handler: handleShortLinkLookup,
});

http.route({
  path: "/calendar.ics",
  method: "GET",
  handler: handlePublicCalendar,
});

http.route({
  path: "/email-webhook",
  method: "POST",
  handler: handleEmailWebhook,
});

export default http;
