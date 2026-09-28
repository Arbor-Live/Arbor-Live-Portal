"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  CalendarDotsIcon,
  CaretDownIcon,
  CaretRightIcon,
  CurrencyDollarIcon,
  DotsThreeIcon,
  EnvelopeSimpleIcon,
  MagnifyingGlassIcon,
  MicrophoneStageIcon,
  SignatureIcon,
} from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import {
  MarkPaidDialog,
  SendSignatureRequestDialog,
  type MarkPaidEntry,
} from "@/components/financial/band-payout-dialogs";
import { PayoutSheet, type PayoutSheetHandlers } from "@/components/financial/band-payout-sheet";
import { MetaItem, PageHeader, StatusPill } from "@/components/page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  BATCH_STAGES,
  MAX_BATCH_PAYOUTS,
  PAYOUT_GROUPS,
  PIPELINE_STATUS_CAP,
  PAYOUT_STAGES,
  PAYOUT_STAGE_LABELS,
  PAYOUT_STAGE_WHO,
  payoutAgeLabel,
  payoutLineupHref,
  payoutPrimaryAction,
  payoutStageCounts,
  payoutStageTone,
  payoutStatusLabel,
  type PayoutGroup,
  type PayoutRow,
  type PayoutStage,
} from "@/lib/band-payout-stages";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { downloadBytes } from "@/lib/download-bytes";
import { formatDate, formatUsd } from "@/lib/format";
import { notify } from "@/lib/notify";

type SortKey = "waiting" | "event" | "amount" | "artist";

const SORT_LABELS: Record<SortKey, string> = {
  waiting: "Longest waiting",
  event: "Event date",
  amount: "Amount",
  artist: "Artist",
};

type PaidRange = "30" | "90" | "365" | "all";

const PAID_RANGE_LABELS: Record<PaidRange, string> = {
  "30": "30 days",
  "90": "90 days",
  "365": "1 year",
  all: "All",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function sortRows(rows: PayoutRow[], stage: PayoutStage, sort: SortKey) {
  const byArtist = (a: PayoutRow, b: PayoutRow) => a.bandName.localeCompare(b.bandName);
  return [...rows].sort((a, b) => {
    switch (sort) {
      case "waiting":
        // Upcoming: soonest event first. Paid: most recent first. Otherwise
        // whoever has waited longest is on top.
        if (stage === "upcoming") return a.eventStartAt - b.eventStartAt || byArtist(a, b);
        if (stage === "paid") return b.stageEnteredAt - a.stageEnteredAt || byArtist(a, b);
        return a.stageEnteredAt - b.stageEnteredAt || byArtist(a, b);
      case "event":
        return a.eventStartAt - b.eventStartAt || byArtist(a, b);
      case "amount":
        return b.totalUsd - a.totalUsd || byArtist(a, b);
      case "artist":
        return byArtist(a, b) || a.eventStartAt - b.eventStartAt;
    }
  });
}

function matchesSearch(row: PayoutRow, needle: string) {
  if (!needle) return true;
  return [
    row.bandName,
    row.eventTitle,
    row.venueName,
    row.designatedPayeeName,
    row.designatedPayeeEmail,
    row.confirmationToken,
    row.servicePaymentNumber,
  ].some((value) => value?.toLowerCase().includes(needle));
}

function countLabel(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function FinancialHubBandPayoutsClient() {
  const active = useQuery(api.bandPayments.listPipeline, {});
  const [paidRange, setPaidRange] = useState<PaidRange>("30");
  // Fixed at mount so ages and the paid query's args stay stable across renders.
  const [nowMs] = useState(() => Date.now());
  const paidSince = paidRange === "all" ? undefined : nowMs - Number(paidRange) * DAY_MS;
  const paid = useQuery(api.bandPayments.listPaidPayouts, { paidSince });
  const counts = useQuery(api.bandPayments.getQueueCounts, {});

  const sendConfirmation = useMutation(api.bandPayments.sendConfirmationEmail);
  const sendConfirmationBatch = useMutation(api.bandPayments.sendConfirmationEmailBatch);
  const sendPayeeRequired = useMutation(api.bandPayments.sendPayeeRequiredEmail);
  const sendOnboardingReminder = useMutation(api.bandPayments.sendOnboardingReminder);
  const syncStalePayeePayments = useMutation(api.bandPayments.syncStalePayeePayments);
  const markPaidBatch = useMutation(api.bandPayments.markPaidBatch);
  const cancelPayment = useMutation(api.bandPayments.cancelPayment);
  const downloadAgreement = useAction(api.bandPaymentPdfDownload.downloadByPaymentId);
  const { confirm } = useAppDialog();

  // `?payout=<paymentId>` opens that payout's side panel.
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("payout"));
  const [checked, setChecked] = useState<Set<Id<"eventBandPayments">>>(() => new Set());
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("waiting");
  const [paidOpen, setPaidOpen] = useState(false);
  const [sendRows, setSendRows] = useState<PayoutRow[] | null>(null);
  const [payRows, setPayRows] = useState<PayoutRow[] | null>(null);
  const [busyId, setBusyId] = useState<Id<"eventBandPayments"> | null>(null);

  useEffect(() => {
    void syncStalePayeePayments({});
  }, [syncStalePayeePayments]);

  const allRows = useMemo(() => [...(active ?? []), ...(paid?.rows ?? [])], [active, paid]);
  const needle = search.trim().toLowerCase();

  const stages = useMemo(() => {
    const grouped = new Map<PayoutStage, PayoutRow[]>(PAYOUT_STAGES.map((stage) => [stage, []]));
    for (const row of allRows) {
      if (!row.stage || !matchesSearch(row, needle)) continue;
      grouped.get(row.stage)!.push(row);
    }
    return PAYOUT_STAGES.map((stage) => {
      const rows = sortRows(grouped.get(stage)!, stage, sort);
      return { stage, rows, total: rows.reduce((sum, row) => sum + row.totalUsd, 0) };
    });
  }, [allRows, needle, sort]);

  const stagesById = new Map(stages.map((group) => [group.stage, group]));
  const groups = PAYOUT_GROUPS;

  const selectedRow = allRows.find((row) => row._id === selectedId) ?? null;

  async function attempt(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      notify.success(success);
      return true;
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
      return false;
    }
  }

  function uncheck(ids: Id<"eventBandPayments">[]) {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }

  async function runPrimary(row: PayoutRow) {
    const primary = payoutPrimaryAction(row.status);
    if (!primary) return;
    switch (primary.action) {
      case "remind_onboarding":
      case "remind_payee":
        setBusyId(row._id);
        try {
          await attempt(
            () =>
              primary.action === "remind_onboarding"
                ? sendOnboardingReminder({ paymentId: row._id })
                : sendPayeeRequired({ paymentId: row._id }),
            `Reminder sent to ${row.bandName}.`,
          );
        } finally {
          setBusyId(null);
        }
        return;
      case "send_request":
      case "resend_request":
        setSendRows([row]);
        return;
      case "mark_paid":
        setPayRows([row]);
        return;
    }
  }

  async function onSend(paymentIds: Id<"eventBandPayments">[]) {
    const ok = await attempt(
      () =>
        paymentIds.length === 1
          ? sendConfirmation({ paymentId: paymentIds[0]! })
          : sendConfirmationBatch({ paymentIds }),
      paymentIds.length === 1
        ? "Signature request sent."
        : `${paymentIds.length} signature requests sent.`,
    );
    if (ok) {
      uncheck(paymentIds);
      setSendRows(null);
    }
    return ok;
  }

  async function onMarkPaid(entries: MarkPaidEntry[]) {
    const ok = await attempt(
      () => markPaidBatch({ payments: entries }),
      entries.length === 1 ? "Payout marked paid." : `${entries.length} payouts marked paid.`,
    );
    if (ok) {
      uncheck(entries.map((entry) => entry.paymentId));
      setPayRows(null);
    }
    return ok;
  }

  async function removePayout(row: PayoutRow) {
    // Same wording as the Lineup's "Remove payout".
    const ok = await confirm({
      title: `Remove ${row.bandName}'s payout?`,
      description:
        "Use this when Arbor isn't paying this act (for example, someone else pays them directly). The act stays on the bill, and you can add a payout again later.",
      destructive: true,
      confirmLabel: "Remove payout",
    });
    if (!ok) return false;
    const removed = await attempt(() => cancelPayment({ paymentId: row._id }), "Payout removed.");
    if (removed) uncheck([row._id]);
    return removed;
  }

  async function onDownloadAgreement(row: PayoutRow) {
    try {
      const result = await downloadAgreement({ paymentId: row._id });
      downloadBytes(result.bytes, result.fileName);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  const sheetHandlers: PayoutSheetHandlers = { runPrimary, remove: removePayout };

  function scrollToStage(stage: PayoutStage) {
    document.getElementById(`payout-stage-${stage}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const activeRows = active ?? [];
  const outstanding = activeRows
    .filter((row) => row.stage !== "upcoming")
    .reduce((sum, row) => sum + row.totalUsd, 0);
  const actionCount = counts ? counts.needs_email + counts.ready_to_pay : 0;
  const inGroup = (id: PayoutGroup["id"]) => {
    const stagesInGroup = new Set(PAYOUT_GROUPS.find((group) => group.id === id)!.stages);
    return activeRows.filter((row) => row.stage && stagesInGroup.has(row.stage));
  };
  const actionRows = inGroup("action_needed");
  const waitingRows = inGroup("no_action_needed").filter((row) => row.stage !== "upcoming");
  const upcomingCount = activeRows.filter((row) => row.stage === "upcoming").length;
  const sumUsd = (rows: PayoutRow[]) => rows.reduce((sum, row) => sum + row.totalUsd, 0);

  function renderStage({ stage, rows, total }: (typeof stages)[number], index: number) {
    const batch = BATCH_STAGES.has(stage);
    const checkedRows = batch ? rows.filter((row) => checked.has(row._id)) : [];
    const collapsed = stage === "paid" && !paidOpen;
    const overBatchLimit = checkedRows.length > MAX_BATCH_PAYOUTS;
    // The list reads at most 200 payouts per status; say so when a stage has
    // more than it shows (exact counts come from getQueueCounts).
    const exactCount = counts && stage !== "paid" ? payoutStageCounts(counts)[stage].count : null;
    // Compare against every loaded row in the stage (not the search-filtered
    // ones), and only once the cap is hit, so the two subscriptions briefly
    // disagreeing after an action doesn't flash a false notice.
    const loadedCount = (active ?? []).filter((row) => row.stage === stage).length;
    const hiddenCount =
      exactCount !== null && loadedCount >= PIPELINE_STATUS_CAP
        ? Math.max(0, exactCount - loadedCount)
        : 0;
    const paidTruncated = stage === "paid" && paidOpen && Boolean(paid?.truncated);
    return (
      <section
        key={stage}
        id={`payout-stage-${stage}`}
        data-testid={`payout-stage-${stage}`}
        className={index > 0 ? "scroll-mt-4 border-t" : "scroll-mt-4"}
      >
        <div className="flex flex-wrap items-center gap-2 bg-muted/20 px-3 py-2">
          {batch ? (
            <Checkbox
              aria-label={`Select all in ${PAYOUT_STAGE_LABELS[stage]}`}
              disabled={rows.length === 0}
              checked={
                rows.length > 0 && checkedRows.length === rows.length
                  ? true
                  : checkedRows.length > 0
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(value) =>
                setChecked((prev) => {
                  const next = new Set(prev);
                  for (const row of rows) {
                    if (value === true) next.add(row._id);
                    else next.delete(row._id);
                  }
                  return next;
                })
              }
            />
          ) : stage === "paid" ? (
            <button
              type="button"
              aria-expanded={paidOpen}
              aria-label={paidOpen ? "Hide paid payouts" : "Show paid payouts"}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setPaidOpen((open) => !open)}
            >
              {paidOpen ? (
                <CaretDownIcon className="size-4" aria-hidden />
              ) : (
                <CaretRightIcon className="size-4" aria-hidden />
              )}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">
              {PAYOUT_STAGE_LABELS[stage]}
              <span className="font-normal text-muted-foreground tabular-nums"> · {rows.length}</span>
            </h3>
            <p className="text-xs text-muted-foreground">{PAYOUT_STAGE_WHO[stage]}</p>
          </div>
          {stage === "paid" && paidOpen ? (
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={paidRange}
              onValueChange={(value) => {
                if (value) setPaidRange(value as PaidRange);
              }}
              aria-label="Paid in the last"
            >
              {(Object.keys(PAID_RANGE_LABELS) as PaidRange[]).map((key) => (
                <ToggleGroupItem key={key} value={key}>
                  {PAID_RANGE_LABELS[key]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
          {overBatchLimit ? (
            <span className="text-xs text-status-amber-700 dark:text-status-amber-300">
              Select {MAX_BATCH_PAYOUTS} or fewer ({checkedRows.length} selected)
            </span>
          ) : null}
          {checkedRows.length > 0 ? (
            <Button
              type="button"
              size="sm"
              disabled={overBatchLimit}
              onClick={() =>
                stage === "ready_to_send" ? setSendRows(checkedRows) : setPayRows(checkedRows)
              }
            >
              {stage === "ready_to_send"
                ? `Send ${countLabel(checkedRows.length, "request")}`
                : `Mark ${checkedRows.length} paid`}
            </Button>
          ) : null}
          <span className="w-24 shrink-0 text-right text-sm font-medium tabular-nums">
            {formatUsd(total)}
          </span>
        </div>

        {hiddenCount > 0 ? (
          <p className="border-t px-3 py-2 text-xs text-status-amber-700 dark:text-status-amber-300">
            Only the first {loadedCount} of {exactCount} are loaded, and search covers only those. The
            other {hiddenCount} appear here as you work through these.
          </p>
        ) : null}
        {paidTruncated ? (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            Showing the {rows.length} most recent payouts in this range. Pick a shorter range to see older
            ones counted in full.
          </p>
        ) : null}
        {collapsed || rows.length === 0 ? null : (
          <ul className="divide-y border-t">
            {rows.map((row) => (
              <PayoutListRow
                key={row._id}
                row={row}
                nowMs={nowMs}
                selectable={batch}
                checked={checked.has(row._id)}
                busy={busyId === row._id}
                onCheckedChange={(value) =>
                  setChecked((prev) => {
                    const next = new Set(prev);
                    if (value) next.add(row._id);
                    else next.delete(row._id);
                    return next;
                  })
                }
                onOpen={() => setSelectedId(row._id)}
                onPrimary={() => void runPrimary(row)}
                onDownloadAgreement={() => void onDownloadAgreement(row)}
                onRemove={() => void removePayout(row)}
              />
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-4" data-testid="payouts-page">
      <PageHeader
        back={{ href: "/dashboard/financial-hub", label: "Ops Center" }}
        title="Artist payouts"
        description="Every artist payout from the end of the show to the GrantEd transfer. What Arbor needs to do comes first; everything else is waiting on the show or the artist. Payouts are added from an event's Lineup."
        pills={
          counts ? (
            actionCount > 0 ? (
              <StatusPill tone="amber">{actionCount} need action</StatusPill>
            ) : (
              <StatusPill tone="emerald">Nothing needs action</StatusPill>
            )
          ) : null
        }
        meta={
          counts ? (
            <>
              <MetaItem icon={CurrencyDollarIcon} onClick={() => scrollToStage("ready_to_pay")}>
                {formatUsd(counts.totalsUsd.ready_to_pay)} ready to pay
              </MetaItem>
              <MetaItem icon={EnvelopeSimpleIcon} onClick={() => scrollToStage("ready_to_send")}>
                {counts.needs_email} ready to send
              </MetaItem>
              <MetaItem icon={SignatureIcon} onClick={() => scrollToStage("waiting_on_signature")}>
                {counts.awaiting_reply} awaiting signature
              </MetaItem>
              <MetaItem icon={MicrophoneStageIcon} onClick={() => scrollToStage("waiting_on_artist")}>
                {counts.needs_onboarding + counts.needs_payee} waiting on artists
              </MetaItem>
              <MetaItem icon={CalendarDotsIcon} onClick={() => scrollToStage("upcoming")}>
                {counts.upcoming} upcoming
              </MetaItem>
            </>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search artist, event, payee, ID…"
            aria-label="Search payouts"
            className="pl-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              Sort: {SORT_LABELS[sort]}
              <CaretDownIcon className="size-3" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuLabel>Sort each stage by</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={sort} onValueChange={(value) => setSort(value as SortKey)}>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <DropdownMenuRadioItem key={key} value={key}>
                  {SORT_LABELS[key]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {active === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <p className="text-sm" data-testid="payouts-summary">
            {actionRows.length} need action ({formatUsd(sumUsd(actionRows))}) · {waitingRows.length} waiting on
            the artist ({formatUsd(sumUsd(waitingRows))}) · {formatUsd(outstanding)} outstanding ·{" "}
            {countLabel(upcomingCount, "upcoming show")}
          </p>
          <p className="text-sm text-muted-foreground">
            Stages in workflow order. Within a stage, {SORT_LABELS[sort].toLowerCase()} first
            {sort === "waiting" ? " (upcoming by event date, paid newest first)" : ""}.
          </p>

          {/* All-time paid count, so older paid history outside the default range stays reachable. */}
          {activeRows.length === 0 && !needle && (paid?.rows.length ?? 0) === 0 && counts?.paid === 0 ? (
            <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No artist payouts yet. Add one from an event&apos;s Lineup (open the act, then Add payout).
            </p>
          ) : needle && stages.every((group) => group.rows.length === 0) ? (
            <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No payouts match &ldquo;{search.trim()}&rdquo;.
            </p>
          ) : (
            <div className="space-y-6" data-testid="payout-pipeline">
              {groups.map((group) => {
                const groupRows = group.stages.flatMap((stage) => stagesById.get(stage)!.rows);
                const groupTotal = groupRows.reduce((sum, row) => sum + row.totalUsd, 0);
                const actionNeeded = group.id === "action_needed";
                return (
                  <section key={group.id} data-testid={`payout-group-${group.id}`} className="space-y-2">
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div className="space-y-0.5">
                        <h2 className="flex items-center gap-2 text-base font-semibold">
                          {group.label}
                          <StatusPill
                            tone={actionNeeded ? (groupRows.length > 0 ? "amber" : "emerald") : "neutral"}
                            className="h-6"
                          >
                            {groupRows.length}
                          </StatusPill>
                        </h2>
                        <p className="text-sm text-muted-foreground">{group.description}</p>
                      </div>
                      <span className="text-sm font-medium tabular-nums">{formatUsd(groupTotal)}</span>
                    </div>
                    {actionNeeded && groupRows.length === 0 && !needle ? (
                      <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                        Nothing needs Arbor right now. Payouts land here once the artist has their payee info in,
                        and again once they&apos;ve signed.
                      </p>
                    ) : (
                      <div className={actionNeeded ? "border border-status-amber-500/40" : "border"}>
                        {group.stages.map((stage, index) => renderStage(stagesById.get(stage)!, index))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      <PayoutSheet
        row={selectedRow}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        handlers={sheetHandlers}
      />
      <SendSignatureRequestDialog
        rows={sendRows}
        onOpenChange={(open) => {
          if (!open) setSendRows(null);
        }}
        onSend={onSend}
      />
      <MarkPaidDialog
        rows={payRows}
        onOpenChange={(open) => {
          if (!open) setPayRows(null);
        }}
        onConfirm={onMarkPaid}
      />
    </div>
  );
}

function PayoutListRow({
  row,
  nowMs,
  selectable,
  checked,
  busy,
  onCheckedChange,
  onOpen,
  onPrimary,
  onDownloadAgreement,
  onRemove,
}: {
  row: PayoutRow;
  nowMs: number;
  selectable: boolean;
  checked: boolean;
  busy: boolean;
  onCheckedChange: (checked: boolean) => void;
  onOpen: () => void;
  onPrimary: () => void;
  onDownloadAgreement: () => void;
  onRemove: () => void;
}) {
  const stage = row.stage ?? "upcoming";
  const primary = payoutPrimaryAction(row.status);
  return (
    <li data-testid="payout-row" data-status={row.status} className="flex items-center gap-2 pr-1 pl-3 text-sm">
      {selectable ? (
        <Checkbox
          aria-label={`Select ${row.bandName} (${row.eventTitle})`}
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left hover:bg-muted/30"
        onClick={onOpen}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-2xs font-medium tracking-wide text-muted-foreground uppercase">
            {formatDate(row.eventStartAt)} · {row.eventTitle}
          </p>
          <p className="truncate font-medium">{row.bandName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.designatedPayeeName ? `Payee: ${row.designatedPayeeName}` : "No payee yet"}
          </p>
        </div>
        {!row.payeeComplete && stage !== "upcoming" && stage !== "paid" ? (
          <span className="hidden shrink-0 rounded-md bg-status-amber-500/15 px-2 py-0.5 text-xs text-status-amber-800 sm:inline dark:text-status-amber-200">
            Payee incomplete
          </span>
        ) : null}
        <span className="hidden w-32 shrink-0 text-right text-xs text-muted-foreground md:block">
          {payoutAgeLabel(row, nowMs)}
        </span>
        <span className="w-24 shrink-0 text-right tabular-nums">{formatUsd(row.totalUsd)}</span>
        <StatusPill tone={payoutStageTone(stage)} className="hidden h-6 w-36 justify-center sm:inline-flex">
          {payoutStatusLabel(row.status)}
        </StatusPill>
      </button>
      <div className="hidden w-48 shrink-0 justify-end md:flex">
        {primary ? (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onPrimary}>
            {primary.label}
          </Button>
        ) : null}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`More for ${row.bandName}'s payout`}>
            <DotsThreeIcon weight="bold" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={onOpen}>Open details</DropdownMenuItem>
          {primary ? (
            // The row's action button drops on narrow screens; keep it reachable here.
            <DropdownMenuItem className="md:hidden" disabled={busy} onSelect={onPrimary}>
              {primary.label}
            </DropdownMenuItem>
          ) : null}
          {row.canDownloadAgreementPdf ? (
            <DropdownMenuItem onSelect={onDownloadAgreement}>Agreement PDF</DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link href={payoutLineupHref(row)}>Open in Lineup</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/events/${row.eventId}`}>Open event</Link>
          </DropdownMenuItem>
          {row.status !== "paid" ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                Remove payout
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
