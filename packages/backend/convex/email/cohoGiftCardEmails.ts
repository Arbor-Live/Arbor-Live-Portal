import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { SITE_URL, subjectForTemplate } from "./constants";
import { enqueueEmail } from "./enqueue";

/**
 * Email the Ops Center-configured recipients when one CoHo gift card drops
 * below the threshold. Recipients may be external addresses (they have no
 * portal account and get email only). `crossingId` makes the alert fire once
 * per crossing — replays are no-ops.
 */
export async function scheduleCohoGiftCardLowBalanceEmails(
  ctx: MutationCtx,
  args: {
    cardId: Id<"cohoGiftCards">;
    cardLabel: string;
    balanceUsd: number;
    thresholdUsd: number;
    recipients: string[];
    crossingId: number;
  },
) {
  const subject = subjectForTemplate(
    "coho_gift_card_low_balance",
    `${args.cardLabel} · $${args.balanceUsd.toFixed(2)}`,
  );
  const dashboardUrl = `${SITE_URL}/dashboard`;

  for (const to of args.recipients) {
    await enqueueEmail(ctx, {
      template: "coho_gift_card_low_balance",
      to,
      subject,
      idempotencyKey: `coho_gift_card_low_balance:${args.cardId}:${args.crossingId}:${to}`,
      payload: {
        cardLabel: args.cardLabel,
        balanceUsd: args.balanceUsd,
        thresholdUsd: args.thresholdUsd,
        dashboardUrl,
      },
    });
  }
}
