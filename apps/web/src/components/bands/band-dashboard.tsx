"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { MusicNotesIcon, WarningIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { formatDate, formatUsd, PORTAL_TIMEZONE } from "@/lib/format";
import { BandPaymentSignSheet, type SignablePayment } from "@/components/bands/band-payment-sign-sheet";
import {
  BandShowSheet,
  formatTimeWindow,
  SHOW_ROLE_LABELS,
  ShowStatusPill,
} from "@/components/bands/band-show-sheet";
import { ListRow } from "@/components/list-row";
import { EmptyState, ListSummary, RowCell, RowGroup, RowMenu, RowText } from "@/components/list-page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

type ShowRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.eventBands.listShowsForActiveBand>>
>[number];

const PAST_PREVIEW = 8;

function needsArtist(show: ShowRow) {
  return !show.cancelled && Boolean(show.payment?.canSign || show.payment?.needsPayeeSetup);
}

function dateParts(ms: number, timezone: string | undefined) {
  const tz = timezone ?? PORTAL_TIMEZONE;
  return {
    month: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: tz }).format(ms),
    day: new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: tz }).format(ms),
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(ms),
  };
}

function ShowListRow({
  show,
  onOpen,
  onSign,
}: {
  show: ShowRow;
  onOpen: () => void;
  onSign: (payment: SignablePayment) => void;
}) {
  const { month, day, weekday } = dateParts(show.startAt, show.timezone);
  const setWindow = formatTimeWindow(show.setStartsAt, show.setEndsAt, show.timezone);
  const soundcheckWindow = formatTimeWindow(
    show.soundcheckStartsAt,
    show.soundcheckEndsAt,
    show.timezone,
  );
  const detail = [
    show.venueName,
    setWindow ? `Set ${setWindow}` : "Set time TBD",
    soundcheckWindow ? `Soundcheck ${soundcheckWindow}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const payment = show.payment;

  return (
    <ListRow
      data-testid="band-show-row"
      onOpen={onOpen}
      actions={
        // Fixed width so the amount column lines up whether or not E-sign shows.
        <div className="flex w-28 shrink-0 items-center justify-end gap-1">
          {payment?.canSign && !show.cancelled ? (
            <Button
              type="button"
              size="sm"
              onClick={() =>
                onSign({
                  _id: payment._id,
                  eventTitle: show.title,
                  totalUsd: payment.totalUsd,
                  confirmationToken: payment.confirmationToken,
                })
              }
            >
              E-sign
            </Button>
          ) : null}
          <RowMenu label={`More for ${show.title}`}>
            <DropdownMenuItem onSelect={onOpen}>Open details</DropdownMenuItem>
            {payment?.needsPayeeSetup ? (
              <DropdownMenuItem asChild>
                <Link href="/dashboard/artists/payments#payee">Set up payee</Link>
              </DropdownMenuItem>
            ) : null}
          </RowMenu>
        </div>
      }
    >
      <span className="w-10 shrink-0 text-center leading-tight" aria-hidden>
        <span className="block text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          {month}
        </span>
        <span className="block text-lg font-semibold tabular-nums">{day}</span>
      </span>
      <RowText
        eyebrow={`${weekday} · ${SHOW_ROLE_LABELS[show.role]}`}
        title={show.title}
        detail={detail}
      />
      <RowCell className="w-24" hideBelow="md">
        {payment ? formatUsd(payment.totalUsd) : <span className="text-muted-foreground">—</span>}
      </RowCell>
      {/* On narrow screens the title needs the room; the panel still shows the status. */}
      <span className="hidden w-40 shrink-0 justify-end sm:flex">
        <ShowStatusPill show={show} />
      </span>
    </ListRow>
  );
}

/** Amber notes for anything blocking a payout or crew prep. */
function AttentionStrip({ items }: { items: Array<{ key: string; content: React.ReactNode }> }) {
  if (items.length === 0) return null;
  return (
    <ul
      className="space-y-1 border border-status-amber-500/40 bg-status-amber-500/10 px-3 py-2 text-sm text-status-amber-700 dark:text-status-amber-200"
      data-testid="band-shows-attention"
    >
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2">
          <WarningIcon className="size-3.5 shrink-0" weight="fill" aria-hidden />
          {item.content}
        </li>
      ))}
    </ul>
  );
}

/** The artist's home: every show Arbor has booked them for, soonest first. */
export function BandDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shows = useQuery(api.eventBands.listShowsForActiveBand, {});
  const profile = useQuery(api.users.getActiveBandProfile, {});
  const riders = useQuery(api.bandRiders.listForActiveBand, {});
  const [nowMs] = useState(() => Date.now());
  const [openShowId, setOpenShowId] = useState<Id<"events"> | null>(
    () => (searchParams.get("show") as Id<"events"> | null) ?? null,
  );
  const [signing, setSigning] = useState<SignablePayment | null>(null);
  const [showAllPast, setShowAllPast] = useState(false);

  const groups = useMemo(() => {
    const rows = shows ?? [];
    const needsYou = rows.filter(needsArtist);
    const rest = rows.filter((row) => !needsArtist(row));
    return {
      needsYou,
      upcoming: rest.filter((row) => row.endAt >= nowMs),
      past: rest.filter((row) => row.endAt < nowMs).sort((a, b) => b.startAt - a.startAt),
    };
  }, [shows, nowMs]);

  function openShow(eventId: Id<"events"> | null) {
    setOpenShowId(eventId);
    // Keep `?show=` in step so the open panel is shareable and survives reloads.
    const params = new URLSearchParams(searchParams.toString());
    if (eventId) params.set("show", eventId);
    else params.delete("show");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function startSigning(payment: SignablePayment) {
    openShow(null);
    setSigning(payment);
  }

  if (shows === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-6 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const upcomingAll = shows.filter((row) => row.endAt >= nowMs && !row.cancelled);
  const next = upcomingAll[0];
  const toSign = shows.filter((row) => row.payment?.canSign && !row.cancelled).length;
  const owed = shows.reduce((sum, row) => {
    const status = row.payment?.status;
    if (!row.payment || row.cancelled || status === "paid" || status === "cancelled") return sum;
    return sum + row.payment.totalUsd;
  }, 0);

  const attention: Array<{ key: string; content: React.ReactNode }> = [];
  if (toSign > 0) {
    attention.push({
      key: "sign",
      content: `${toSign} payout${toSign === 1 ? " needs" : "s need"} your signature.`,
    });
  }
  if (profile && !profile.payeeComplete) {
    attention.push({
      key: "payee",
      content: (
        <span>
          Arbor can&apos;t pay you until a payee is set up.{" "}
          <Link href="/dashboard/artists/payments#payee" className="font-medium underline underline-offset-4">
            Set up payee
          </Link>
        </span>
      ),
    });
  }
  if (riders && !riders.some((rider) => rider.isDefault)) {
    attention.push({
      key: "rider",
      content: (
        <span>
          Crew prep your stage from your default rider.{" "}
          <Link href="/dashboard/artists/riders" className="font-medium underline underline-offset-4">
            {riders.length === 0 ? "Create a rider" : "Choose a default"}
          </Link>
        </span>
      ),
    });
  }

  const pastShown = showAllPast ? groups.past : groups.past.slice(0, PAST_PREVIEW);
  const rowProps = (show: ShowRow) => ({
    show,
    onOpen: () => openShow(show.eventId),
    onSign: startSigning,
  });

  return (
    <div className="space-y-4" data-testid="band-shows">
      <PageHeader
        title="Your shows"
        description="Upcoming bookings and payout status in one place. Open a show for your times, the venue and who to contact."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/opportunities">
              <MusicNotesIcon />
              Find opportunities
            </Link>
          </Button>
        }
      />

      <AttentionStrip items={attention} />

      {shows.length === 0 ? (
        <EmptyState
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/opportunities">Browse opportunities</Link>
            </Button>
          }
        >
          No shows yet. When Arbor books you, the date, your set time and payout show up here.
        </EmptyState>
      ) : (
        <>
          <ListSummary testId="band-shows-summary" order="Soonest first; past shows newest first.">
            {[
              `${upcomingAll.length} upcoming`,
              next ? `next ${formatDate(next.startAt, next.timezone)}` : null,
              owed > 0
                ? `${formatUsd(owed)} in payouts to come${toSign > 0 ? ` (${toSign} to sign)` : ""}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </ListSummary>

          <div className="border">
            {groups.needsYou.length > 0 ? (
              <RowGroup
                title="Needs you"
                count={groups.needsYou.length}
                tone="amber"
                description="A payout is waiting on your signature or your payee details."
                testId="band-shows-needs-you"
              >
                {groups.needsYou.map((show) => (
                  <ShowListRow {...rowProps(show)} key={show.eventId} />
                ))}
              </RowGroup>
            ) : null}
            <RowGroup
              title="Upcoming"
              count={groups.upcoming.length}
              testId="band-shows-upcoming"
              className={groups.needsYou.length > 0 ? "border-t" : undefined}
            >
              {groups.upcoming.length > 0 ? (
                groups.upcoming.map((show) => <ShowListRow {...rowProps(show)} key={show.eventId} />)
              ) : (
                <li className="px-3 py-4 text-sm text-muted-foreground">No upcoming shows yet.</li>
              )}
            </RowGroup>
            {groups.past.length > 0 ? (
              <RowGroup
                title="Past"
                count={groups.past.length}
                testId="band-shows-past"
                className="border-t"
                aside={
                  groups.past.length > PAST_PREVIEW ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAllPast((value) => !value)}
                    >
                      {showAllPast ? "Show fewer" : `Show all ${groups.past.length}`}
                    </Button>
                  ) : undefined
                }
              >
                {pastShown.map((show) => (
                  <ShowListRow {...rowProps(show)} key={show.eventId} />
                ))}
              </RowGroup>
            ) : null}
          </div>
        </>
      )}

      <BandShowSheet
        eventId={openShowId}
        onOpenChange={(open) => {
          if (!open) openShow(null);
        }}
        onSign={startSigning}
      />
      <BandPaymentSignSheet
        payment={signing}
        open={signing !== null}
        onOpenChange={(open) => {
          if (!open) setSigning(null);
        }}
      />
    </div>
  );
}
