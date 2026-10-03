"use client";

import { useQuery } from "convex/react";
import { CurrencyDollarIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { DashboardWidget, WidgetRows } from "@/components/dashboard/dashboard-widget";
import { RowCell, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";

const PAYOUTS_HREF = "/dashboard/financial-hub/artist-payouts";

export function AdminPayoutQueueWidget() {
  const counts = useQuery(api.bandPayments.getQueueCounts, {});
  const stages = counts
    ? [
        { label: "Ready to pay", detail: "Signed and waiting on payment", count: counts.ready_to_pay, urgent: true },
        { label: "Ready to send", detail: "Payout email not sent yet", count: counts.needs_email, urgent: true },
        { label: "Waiting on signature", detail: "Sent to the artist", count: counts.awaiting_reply, urgent: false },
        {
          label: "Waiting on artist",
          detail: "Onboarding or payee details missing",
          count: counts.needs_onboarding + counts.needs_payee,
          urgent: false,
        },
        { label: "Upcoming", detail: "Shows that haven't happened yet", count: counts.upcoming, urgent: false },
      ]
    : [];

  return (
    <DashboardWidget
      icon={CurrencyDollarIcon}
      title="Artist payout queue"
      link={{ href: PAYOUTS_HREF, label: "Payouts" }}
      testId="home-payout-queue"
      summary={counts ? `In workflow order · ${counts.paid} already paid` : null}
    >
      <WidgetRows loading={counts === undefined} empty={null}>
        {stages.map((stage) => (
          <ListRow key={stage.label} href={PAYOUTS_HREF}>
            <RowText title={stage.label} detail={stage.detail} />
            <RowCell
              className={
                stage.urgent && stage.count > 0 ? "w-12 font-semibold text-status-amber-700 dark:text-status-amber-200" : "w-12"
              }
            >
              {stage.count}
            </RowCell>
          </ListRow>
        ))}
      </WidgetRows>
    </DashboardWidget>
  );
}
