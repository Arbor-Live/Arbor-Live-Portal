import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import type { GenericCtx } from "@convex-dev/better-auth/utils";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin, organization } from "better-auth/plugins";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import schema from "./betterAuth/schema";

export const authComponent = createClient<DataModel, typeof schema>(
  components.betterAuth,
  {
    local: { schema },
    verbose: false,
  },
);

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";

  return {
    appName: "Arbor Live Portal",
    baseURL: siteUrl,
    trustedOrigins: [siteUrl, "http://localhost:3000", "http://127.0.0.1:3000"],
    secret: process.env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      async sendResetPassword({ url, user }) {
        // Dev-friendly placeholder: wire this to your email provider next.
        console.log(
          `[better-auth] Reset password link for ${user.email}: ${url}`,
        );
      },
    },
    plugins: [convex({ authConfig }), admin(), organization()],
  } satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth(createAuthOptions(ctx));
};
