import type { MutationCtx } from "../_generated/server";
import { SITE_URL, subjectForTemplate } from "./constants";
import { enqueueEmail } from "./enqueue";

/**
 * Email the Ops Center-configured recipients when the shared CoHo gift card
 * drops below the threshold. Recipients may be external addresses (they have
 * no portal account and get email only). `crossingId` makes the alert fire
 * once per crossing — replays are no-ops.
 */
export async function scheduleCohoGiftCardLowBalanceEmails(
  ctx: MutationCtx,
  args: {
    balanceUsd: number;
    thresholdUsd: number;
    recipients: string[];
    crossingId: number;
  },
) {
  const subject = subjectForTemplate(
    "coho_gift_card_low_balance",
    `$${args.balanceUsd.toFixed(2)}`,
  );
  const dashboardUrl = `${SITE_URL}/dashboard`;

  for (const to of args.recipients) {
    await enqueueEmail(ctx, {
      template: "coho_gift_card_low_balance",
      to,
      subject,
      idempotencyKey: `coho_gift_card_low_balance:${args.crossingId}:${to}`,
      payload: {
        balanceUsd: args.balanceUsd,
        thresholdUsd: args.thresholdUsd,
        dashboardUrl,
      },
    });
  }
}
