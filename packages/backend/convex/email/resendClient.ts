import { Resend } from "@convex-dev/resend";
import { components } from "../_generated/api";

/**
 * The `@convex-dev/resend` component: queued, rate-limited, retried sends with
 * real HTTP idempotency. Kept out of the Node-only `send.ts` so default-runtime
 * functions (the Message-ID capture) can read its email status too.
 */
export const resendClient = new Resend(components.resend, {
  testMode: process.env.EMAIL_TEST_MODE === "true",
});

const RESEND_TEST_PREFIXES = ["delivered", "bounced", "complained"];

/**
 * The component's own test-mode rule (`isTestEmail` in
 * `@convex-dev/resend/dist/component/lib.js`): `delivered`, `bounced` or
 * `complained` at `resend.dev`, optionally with a `+label`.
 */
export function isResendTestAddress(email: string) {
  const [prefix, domain] = email.split("@");
  if (domain !== "resend.dev" || !prefix) return false;
  return RESEND_TEST_PREFIXES.some((test) => prefix === test || prefix.startsWith(`${test}+`));
}
