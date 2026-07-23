import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { handleShortLinkLookup } from "./http/shortLinkRedirect";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

http.route({
  path: "/short-link",
  method: "GET",
  handler: handleShortLinkLookup,
});

export default http;
