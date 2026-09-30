"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { CurrencyDollarIcon, PlusIcon, ReceiptIcon, WarningIcon } from "@phosphor-icons/react";
import { PageHeader, PageTabs } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/convex-api";

const BASE = "/dashboard/financial-hub/invoices";

export type InvoicesTab = "all" | "payments";

/** Header and tabs shared by the All invoices and Payments views. */
export function InvoicesShell({ tab, children }: { tab: InvoicesTab; children: React.ReactNode }) {
  const board = useQuery(api.paymentProof.listBoard, {});
  const toVerify = board?.filter((item) => item.group === "proof").length ?? 0;

  return (
    <div className="space-y-4 pb-24" data-testid="invoices-page">
      <PageHeader
        title="Invoices"
        description="Quotes and invoices from draft to paid. All invoices groups them by who acts next; Payments tracks proof, overdue balances and receipts once a client approves."
        actions={
          <Button asChild size="sm">
            <Link href={`${BASE}/new`}>
              <PlusIcon />
              Create invoice
            </Link>
          </Button>
        }
      />
      <PageTabs
        label="Invoice views"
        tabs={[
          { href: BASE, label: "All invoices", icon: ReceiptIcon, active: tab === "all" },
          {
            href: `${BASE}/payments`,
            label: "Payments",
            icon: CurrencyDollarIcon,
            active: tab === "payments",
            badge:
              toVerify > 0 ? (
                <span
                  className="inline-flex items-center gap-0.5 text-status-amber-700"
                  title={`${toVerify} payment proof${toVerify === 1 ? "" : "s"} to verify`}
                >
                  <WarningIcon className="size-3.5" weight="fill" aria-hidden />
                  <span className="text-xs tabular-nums">{toVerify}</span>
                </span>
              ) : undefined,
          },
        ]}
      />
      {children}
    </div>
  );
}
