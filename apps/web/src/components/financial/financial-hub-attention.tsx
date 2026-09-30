"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ClipboardTextIcon,
  CurrencyDollarIcon,
  ReceiptIcon,
  SignatureIcon,
  ClockIcon,
  type Icon,
} from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { ListRow } from "@/components/list-row";
import { StatusPill, type Tone } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { payoutAgeLabel } from "@/lib/band-payout-stages";
import { formatUsd } from "@/lib/format";

const DAY_MS = 24 * 60 * 60 * 1000;

type InvoiceRow = FunctionReturnType<typeof api.invoices.listEnriched>[number];
type ProofRow = FunctionReturnType<typeof api.paymentProof.listByQueue>[number];

type AttentionItem = {
  id: string;
  href: string;
  title: string;
  subtitle?: string;
  amountUsd?: number;
  trailing: string;
};

type AttentionSectionData = {
  key: string;
  label: string;
  tone: Tone;
  count: number;
  totalUsd?: number;
  href: string;
  emptyLabel: string;
  items: AttentionItem[];
};

/** "Today", "1 day", "6 days" — the section label says what the count means. */
function daysLabel(at: number, nowMs: number) {
  const days = Math.floor(Math.max(0, nowMs - at) / DAY_MS);
  if (days < 1) return "Today";
  return `${days} day${days === 1 ? "" : "s"}`;
}

function AttentionRow({ item }: { item: AttentionItem }) {
  return (
    <ListRow href={item.href} className="border-0 pr-0 pl-0" bodyClassName="px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{item.title}</p>
        {item.subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
        ) : null}
      </div>
      {item.amountUsd != null ? (
        <span className="shrink-0 text-sm tabular-nums">{formatUsd(item.amountUsd)}</span>
      ) : null}
      <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {item.trailing}
      </span>
    </ListRow>
  );
}

function AttentionSection({ section }: { section: AttentionSectionData }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={section.tone}>{section.label}</StatusPill>
        <span className="text-sm text-muted-foreground tabular-nums">
          {section.count} {section.count === 1 ? "item" : "items"}
          {section.totalUsd != null ? ` · ${formatUsd(section.totalUsd)}` : ""}
        </span>
        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <Link href={section.href}>View all</Link>
        </Button>
      </div>
      {section.items.length === 0 ? (
        <p className="border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          {section.emptyLabel}
        </p>
      ) : (
        <ul className="divide-y border text-sm">
          {section.items.map((item) => (
            <AttentionRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AttentionPanel({
  icon: PanelIcon,
  title,
  loading,
  sections,
  testId,
}: {
  icon: Icon;
  title: string;
  loading: boolean;
  sections: AttentionSectionData[];
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PanelIcon className="size-4 text-muted-foreground" aria-hidden />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          sections.map((section) => <AttentionSection key={section.key} section={section} />)
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The Ops Center's "needs attention" panels. Each panel shows a count and the
 * three oldest items, assembled from the existing list/count queries for the
 * sibling pages — no new tables. Every row links straight into the list it
 * came from.
 */
export function FinancialHubAttention() {
  const [nowMs] = useState(() => Date.now());
  const requests = useQuery(api.eventRequests.list, {});
  const invoices = useQuery(api.invoices.listEnriched, { excludeClosed: true });
  const proof = useQuery(api.paymentProof.listByQueue, { queue: "proof_no_receipt" });
  const payouts = useQuery(api.bandPayments.listPipeline, {});
  const payoutCounts = useQuery(api.bandPayments.getQueueCounts, {});
  const timecards = useQuery(api.timecards.listCrewTimecardOverview, { now: nowMs, periodIndex: 0 });

  const requestSections = useMemo<AttentionSectionData[]>(() => {
    const all = requests ?? [];
    const toItem = (request: (typeof all)[number]): AttentionItem => {
      const name = `${request.firstName} ${request.lastName}`.trim();
      return {
        id: request._id,
        href: `/dashboard/financial-hub/requests/${request._id}`,
        title: request.eventName?.trim() || name || request.requestNumber,
        subtitle: [request.requestNumber, name, request.venueName].filter(Boolean).join(" · "),
        trailing: daysLabel(request.submittedAt, nowMs),
      };
    };
    // `eventRequests.list` returns open requests oldest-first.
    const newest = all.filter((request) => request.status === "submitted");
    const action = all.filter(
      (request) => request.status === "action_required" || request.status === "in_review",
    );
    return [
      {
        key: "new",
        label: "New",
        tone: "amber",
        count: newest.length,
        href: "/dashboard/financial-hub/requests",
        emptyLabel: "No new booking requests.",
        items: newest.slice(0, 3).map(toItem),
      },
      {
        key: "action-required",
        label: "Action required",
        tone: "amber",
        count: action.length,
        href: "/dashboard/financial-hub/requests",
        emptyLabel: "No booking requests flagged for follow-up.",
        items: action.slice(0, 3).map(toItem),
      },
    ];
  }, [requests, nowMs]);

  const quoteSections = useMemo<AttentionSectionData[]>(() => {
    const rows = invoices ?? [];
    const awaiting = rows
      .filter(
        (invoice) =>
          invoice.status === "finalized" &&
          (invoice.clientApprovalStatus ?? "pending") === "pending" &&
          invoice.clientReviewReadyAt != null,
      )
      .sort((a, b) => (a.clientReviewReadyAt ?? 0) - (b.clientReviewReadyAt ?? 0));
    const changes = rows
      .filter((invoice) => invoice.clientApprovalStatus === "changes_requested")
      .sort((a, b) => (a.changesRequestedAt ?? 0) - (b.changesRequestedAt ?? 0));

    const toItem = (invoice: InvoiceRow, at: number): AttentionItem => ({
      id: invoice._id,
      href: `/dashboard/financial-hub/invoices/${invoice._id}`,
      title: invoice.invoiceNumber,
      subtitle: invoice.clientGroupName ?? invoice.linkedEventTitle ?? invoice.managerName,
      amountUsd: invoice.totalUsd,
      trailing: daysLabel(at, nowMs),
    });

    return [
      {
        key: "awaiting-approval",
        label: "Awaiting client approval",
        tone: "blue",
        count: awaiting.length,
        href: "/dashboard/financial-hub/invoices",
        emptyLabel: "No quotes are waiting on the client.",
        items: awaiting
          .slice(0, 3)
          .map((invoice) => toItem(invoice, invoice.clientReviewReadyAt ?? nowMs)),
      },
      {
        key: "changes-requested",
        label: "Changes requested",
        tone: "amber",
        count: changes.length,
        href: "/dashboard/financial-hub/invoices",
        emptyLabel: "No quotes have requested changes.",
        items: changes
          .slice(0, 3)
          .map((invoice) => toItem(invoice, invoice.changesRequestedAt ?? invoice.createdAt)),
      },
    ];
  }, [invoices, nowMs]);

  const invoiceSections = useMemo<AttentionSectionData[]>(() => {
    const rows = invoices ?? [];
    const overdue = rows
      .filter((invoice) => invoice.paymentStatus === "overdue")
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
    const proofRows = (proof ?? []).slice().sort((a, b) => {
      const at = (row: ProofRow) => row.submission?.submittedAt ?? row.dueAt;
      return at(a) - at(b);
    });

    return [
      {
        key: "overdue",
        label: "Past due",
        tone: "rose",
        count: overdue.length,
        href: "/dashboard/financial-hub/invoices",
        emptyLabel: "No invoices are past due.",
        items: overdue.slice(0, 3).map((invoice): AttentionItem => ({
          id: invoice._id,
          href: `/dashboard/financial-hub/invoices/${invoice._id}`,
          title: invoice.invoiceNumber,
          subtitle: invoice.clientGroupName ?? invoice.linkedEventTitle ?? invoice.managerName,
          amountUsd: invoice.totalUsd,
          trailing: `${invoice.daysOverdue} day${invoice.daysOverdue === 1 ? "" : "s"}`,
        })),
      },
      {
        key: "proof",
        label: "Payment proof to verify",
        tone: "blue",
        count: proofRows.length,
        href: "/dashboard/financial-hub/payments",
        emptyLabel: "No payment proof is waiting to be verified.",
        items: proofRows.slice(0, 3).map((row): AttentionItem => ({
          id: row.invoiceId,
          href: `/dashboard/financial-hub/invoices/${row.invoiceId}`,
          title: row.invoiceNumber,
          subtitle: row.clientContactName ?? row.clientEmail ?? row.eventTitle,
          amountUsd: row.totalUsd,
          trailing: daysLabel(row.submission?.submittedAt ?? row.dueAt, nowMs),
        })),
      },
    ];
  }, [invoices, proof, nowMs]);

  const payoutSections = useMemo<AttentionSectionData[]>(() => {
    const rows = payouts ?? [];
    const stageItems = (stage: "ready_to_pay" | "waiting_on_artist") =>
      rows
        .filter((row) => row.stage === stage)
        .sort((a, b) => a.stageEnteredAt - b.stageEnteredAt)
        .slice(0, 3)
        .map(
          (row): AttentionItem => ({
            id: row._id,
            href: `/dashboard/financial-hub/artist-payouts?payout=${row._id}`,
            title: row.bandName,
            subtitle: row.eventTitle,
            amountUsd: row.totalUsd,
            trailing: payoutAgeLabel(row, nowMs),
          }),
        );

    const readyCount = payoutCounts?.ready_to_pay ?? 0;
    const waitingCount =
      (payoutCounts?.needs_onboarding ?? 0) + (payoutCounts?.needs_payee ?? 0);

    return [
      {
        key: "ready-to-pay",
        label: "Ready to pay",
        tone: "amber",
        count: readyCount,
        totalUsd: payoutCounts?.totalsUsd.ready_to_pay,
        href: "/dashboard/financial-hub/artist-payouts#payout-stage-ready_to_pay",
        emptyLabel: "No signed payouts are ready to pay.",
        items: stageItems("ready_to_pay"),
      },
      {
        key: "waiting-on-artist",
        label: "Waiting on artist",
        tone: "blue",
        count: waitingCount,
        totalUsd:
          (payoutCounts?.totalsUsd.needs_onboarding ?? 0) +
          (payoutCounts?.totalsUsd.needs_payee ?? 0),
        href: "/dashboard/financial-hub/artist-payouts#payout-stage-waiting_on_artist",
        emptyLabel: "No payouts are waiting on the artist.",
        items: stageItems("waiting_on_artist"),
      },
    ];
  }, [payouts, payoutCounts, nowMs]);

  const timecardSection = useMemo<AttentionSectionData>(() => {
    const rows = (timecards?.rows ?? []).filter((row) => row.totalInputHours > 0);
    const items = rows
      .slice()
      .sort((a, b) => b.totalInputHours - a.totalInputHours)
      .slice(0, 3)
      .map((row): AttentionItem => ({
        id: row.userId,
        href: `/dashboard/users/timecards/${row.userId}`,
        title: row.name,
        subtitle: `${row.daysWorked} day${row.daysWorked === 1 ? "" : "s"} · ${row.totalInputHours.toFixed(2)} h to input`,
        trailing: timecards ? timecards.period.label : "",
      }));
    return {
      key: "timecards",
      label: "Hours to input",
      tone: "neutral",
      count: rows.length,
      href: "/dashboard/timecards",
      emptyLabel: "No crew owe hours for this period.",
      items,
    };
  }, [timecards]);

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="financial-hub-attention">
      <AttentionPanel
        icon={ClipboardTextIcon}
        title="Booking requests"
        loading={requests === undefined}
        sections={requestSections}
        testId="attention-booking-requests"
      />
      <AttentionPanel
        icon={ReceiptIcon}
        title="Quotes"
        loading={invoices === undefined}
        sections={quoteSections}
        testId="attention-quotes"
      />
      <AttentionPanel
        icon={CurrencyDollarIcon}
        title="Invoices"
        loading={invoices === undefined || proof === undefined}
        sections={invoiceSections}
        testId="attention-invoices"
      />
      <AttentionPanel
        icon={SignatureIcon}
        title="Artist payouts"
        loading={payouts === undefined || payoutCounts === undefined}
        sections={payoutSections}
        testId="attention-artist-payouts"
      />
      <AttentionPanel
        icon={ClockIcon}
        title="Crew timecards"
        loading={timecards === undefined}
        sections={[timecardSection]}
        testId="attention-timecards"
      />
    </div>
  );
}
