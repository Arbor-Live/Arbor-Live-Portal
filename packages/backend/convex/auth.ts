import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import type { GenericCtx } from "@convex-dev/better-auth/utils";
import { passkey } from "@better-auth/passkey";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin, organization } from "better-auth/plugins";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import schema from "./betterAuth/schema";
import { buildTrustedOrigins } from "./lib/trustedOrigins";

export const authComponent = createClient<DataModel, typeof schema>(
  components.betterAuth,
  {
    local: { schema },
    verbose: false,
  },
);

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
  const siteOrigin = new URL(siteUrl).origin;
  const rpID = new URL(siteUrl).hostname;

  return {
    appName: "Arbor Live Portal",
    baseURL: siteUrl,
    trustedOrigins: buildTrustedOrigins(siteUrl),
    secret: process.env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          if ("runMutation" in ctx && typeof ctx.runMutation === "function") {
            void ctx.runMutation(internal.email.authEmails.enqueueChangeEmailConfirmation, {
              to: user.email,
              newEmail,
              confirmUrl: url,
              recipientName: user.name ?? undefined,
            });
          }
        },
      },
    },
    emailVerification: {
      sendOnSignUp: false,
      async sendVerificationEmail({ user, url }) {
        if ("runMutation" in ctx && typeof ctx.runMutation === "function") {
          void ctx.runMutation(internal.email.authEmails.enqueueEmailVerification, {
            to: user.email,
            verificationUrl: url,
            recipientName: user.name ?? undefined,
          });
        }
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      async sendResetPassword({ url, user }) {
        if ("runMutation" in ctx && typeof ctx.runMutation === "function") {
          await ctx.runMutation(internal.email.authEmails.enqueuePasswordReset, {
            to: user.email,
            resetUrl: url,
            recipientName: user.name ?? undefined,
          });
          return;
        }
        console.log(`[better-auth] Reset password link for ${user.email}: ${url}`);
      },
    },
    plugins: [
      convex({ authConfig }),
      admin(),
      organization(),
      passkey({
        rpID,
        rpName: "Arbor Live Portal",
        origin: siteOrigin,
      }),
    ],
  } satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth(createAuthOptions(ctx));
};

// Static export used by Better Auth CLI schema generation.
export const options = createAuthOptions({} as GenericCtx<DataModel>);
