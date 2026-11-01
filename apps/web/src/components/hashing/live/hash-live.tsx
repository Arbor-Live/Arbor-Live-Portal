"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useNow } from "@/lib/use-now";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeftIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  CheckIcon,
  FlagIcon,
  MapPinIcon,
} from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { UserAvatar } from "@/components/account/user-avatar";
import { FinishDialog } from "@/components/hashing/live/finish-dialog";
import { FlagSheet, type FlagTarget } from "@/components/hashing/live/flag-sheet";
import { EmptyState, RowCell, RowFlag, RowList } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { MetaItem, PageHeader, StatusPill } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { pacificDateKey, plural } from "@/lib/format";
import { FLAG_REASON_LABELS, HASH_STATUS_PILLS, hashDayLabel, hashTimeRange } from "@/lib/hashing";
import { applyTick } from "@/lib/hashing-live";
import { HASHING_BASE_PATH, hashPath } from "@/lib/hashing-tabs";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import type { useQuery as UseQuery } from "convex/react";

type Live = NonNullable<ReturnType<typeof UseQuery<typeof api.hashingLive.get>>>;
type Area = Live["areas"][number];
type Row = Area["finalChecks"][number];

const isComplete = (rows: Row[]) => rows.every((row) => row.check);

function Progress({ totals }: { totals: Live["totals"] }) {
  const percent = totals.total ? Math.round((totals.checked / totals.total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div
        role="progressbar"
        aria-label="Hash progress"
        aria-valuenow={totals.checked}
        aria-valuemin={0}
        aria-valuemax={totals.total}
        className="h-2 w-full bg-muted"
      >
        <div className="h-full bg-status-emerald-500 transition-[width] duration-200" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-sm tabular-nums" data-testid="hash-progress">
        {totals.checked} of {totals.total} checked
        {totals.flagged > 0 ? ` · ${plural(totals.flagged, "flagged", "flagged")}` : ""}
      </p>
    </div>
  );
}

function ItemRow({
  row,
  canTick,
  onTick,
  onFlag,
}: {
  row: Row;
  canTick: boolean;
  onTick: (row: Row) => void;
  onFlag: (row: Row) => void;
}) {
  const done = row.check?.status === "done";
  const flagged = row.check?.status === "flagged";
  return (
    <li className="flex items-stretch" data-testid="hash-item" data-item={row.itemKey} data-state={row.check?.status ?? "open"}>
      <button
        type="button"
        disabled={!canTick}
        aria-pressed={done}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left transition-colors select-none hover:bg-muted/30 active:bg-muted/60 disabled:hover:bg-transparent"
        onClick={() => (flagged ? onFlag(row) : onTick(row))}
      >
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center border",
            done && "border-status-emerald-600 bg-status-emerald-500 text-white",
            flagged && "border-status-amber-500 bg-status-amber-500/15 text-status-amber-700 dark:text-status-amber-200",
          )}
          aria-hidden
        >
          {done ? <CheckIcon className="size-4" weight="bold" /> : null}
          {flagged ? <FlagIcon className="size-3.5" weight="fill" /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm break-words", done && "text-muted-foreground")}>{row.text}</span>
          {row.check ? (
            <span className="block text-xs break-words text-muted-foreground">
              {[
                row.check.flagReason ? FLAG_REASON_LABELS[row.check.flagReason] : null,
                row.check.note,
                row.check.byName,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          ) : null}
        </span>
      </button>
      {canTick ? (
        <button
          type="button"
          aria-label={`Flag ${row.text}`}
          className="flex w-14 shrink-0 items-center justify-center border-l text-muted-foreground transition-colors hover:bg-muted/30 active:bg-muted/60"
          data-testid="hash-item-flag"
          onClick={() => onFlag(row)}
        >
          <FlagIcon className="size-5" aria-hidden />
        </button>
      ) : null}
    </li>
  );
}

function KitSection({
  kit,
  canTick,
  onTick,
  onFlag,
}: {
  kit: Area["kits"][number];
  canTick: boolean;
  onTick: (row: Row) => void;
  onFlag: (row: Row) => void;
}) {
  const complete = isComplete(kit.rows);
  const [opened, setOpened] = useState<boolean | null>(null);
  const open = opened ?? !complete;
  const checked = kit.rows.filter((row) => row.check).length;
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpened}
      className="border"
      data-testid="hash-kit-section"
      data-kit={kit.id}
      data-complete={complete}
    >
      <CollapsibleTrigger asChild>
        <button type="button" className="flex min-h-12 w-full items-center gap-2 bg-muted/20 px-3 py-2 text-left">
          <CaretDownIcon
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")}
            weight="bold"
            aria-hidden
          />
          <span className="min-w-0 flex-1 font-medium break-words">{kit.name}</span>
          {complete ? <CheckIcon className="size-4 text-status-emerald-700" weight="bold" aria-hidden /> : null}
          <span className="text-xs text-muted-foreground tabular-nums">
            {checked} of {kit.rows.length}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="divide-y border-t">
          {kit.rows.map((row) => (
            <ItemRow key={row.itemKey} row={row} canTick={canTick} onTick={onTick} onFlag={onFlag} />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ClaimButton({
  area,
  viewerId,
  hashDateId,
}: {
  area: Area;
  viewerId: string;
  hashDateId: Id<"hashDates">;
}) {
  const setClaim = useMutation(api.hashingLive.setAreaClaim);
  const [saving, setSaving] = useState(false);
  const mine = area.claims.some((claim) => claim.userId === viewerId);

  async function toggle() {
    setSaving(true);
    try {
      await setClaim({ hashDateId, areaId: area.id, claimed: !mine });
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Couldn't update this area."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button
      size="sm"
      variant={mine ? "ghost" : "outline"}
      className="h-10 sm:h-8"
      disabled={saving}
      data-testid="hash-claim"
      onClick={() => void toggle()}
    >
      {mine ? "Leave" : "Take this"}
    </Button>
  );
}

function AreaView({ live, area }: { live: Live; area: Area }) {
  const hashDateId = live.hash._id;
  const canTick = live.hash.status === "in_progress" && live.canWork;
  const [flagging, setFlagging] = useState<FlagTarget | null>(null);
  const tick = useTick(hashDateId);

  const onTick = useCallback(
    (row: Row) => void tick(row.itemKey, !row.check),
    [tick],
  );

  return (
    <div className="space-y-3" data-testid="hash-area" data-area={area.id}>
      <div className="sticky top-0 z-20 -mx-6 space-y-1 border-b bg-background/95 px-6 py-2 backdrop-blur">
        <Link href={hashPath(hashDateId)} className="inline-flex min-h-8 items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeftIcon className="size-4" aria-hidden />
          All areas
        </Link>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="min-w-0 text-lg font-semibold break-words">{area.name}</h2>
          <p className="shrink-0 text-sm tabular-nums" data-testid="hash-area-progress">
            {area.checked} of {area.total}
          </p>
        </div>
      </div>

      {area.kits.map((kit) => (
        <KitSection key={kit.id} kit={kit} canTick={canTick} onTick={onTick} onFlag={setFlagging} />
      ))}

      {area.finalChecks.length > 0 ? (
        <section className="border" data-testid="hash-final">
          <h3 className="bg-muted/20 px-3 py-2 font-medium">Final checks</h3>
          <ul className="divide-y border-t">
            {area.finalChecks.map((row) => (
              <ItemRow key={row.itemKey} row={row} canTick={canTick} onTick={onTick} onFlag={setFlagging} />
            ))}
          </ul>
        </section>
      ) : null}

      <Button variant="outline" className="h-11 w-full sm:w-auto" asChild>
        <Link href={hashPath(hashDateId)}>All areas</Link>
      </Button>

      <FlagSheet hashDateId={hashDateId} target={flagging} onClose={() => setFlagging(null)} />
    </div>
  );
}

const PENDING_TICK = {
  _id: "pending" as Id<"hashChecks">,
  status: "done" as const,
  byName: "You",
  resolved: false,
  sentToDamage: false,
};

function useTick(hashDateId: Id<"hashDates">) {
  const setCheck = useMutation(api.hashingLive.setCheck).withOptimisticUpdate((store, args) => {
    for (const { args: queryArgs, value } of store.getAllQueries(api.hashingLive.get)) {
      if (!value || queryArgs.hashDateId !== args.hashDateId) continue;
      store.setQuery(api.hashingLive.get, queryArgs, applyTick(value, args.itemKey, args.done, PENDING_TICK));
    }
  });
  return useCallback(
    async (itemKey: string, done: boolean) => {
      try {
        await setCheck({ hashDateId, itemKey, done });
      } catch (error) {
        notify.error(getConvexErrorMessage(error, "Couldn't save that tick."));
      }
    },
    [hashDateId, setCheck],
  );
}

function AreaList({ live }: { live: Live }) {
  const canClaim = live.hash.status === "in_progress" && live.canWork;
  return (
    <RowList testId="hash-areas">
      {live.areas.map((area) => {
        const complete = area.checked === area.total;
        return (
          <ListRow
            key={area.id}
            data-testid="hash-area-row"
            data-area={area.id}
            href={`${hashPath(live.hash._id)}?area=${encodeURIComponent(area.id)}`}
            bodyClassName="min-h-14"
            actions={
              canClaim ? <ClaimButton area={area} viewerId={live.viewerId} hashDateId={live.hash._id} /> : undefined
            }
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words">{area.name}</p>
              {area.claims.length > 0 ? (
                <p className="text-xs break-words text-muted-foreground">
                  {area.claims.map((claim) => claim.name).join(", ")}
                </p>
              ) : null}
            </div>
            {area.flagged > 0 ? <RowFlag>{area.flagged} flagged</RowFlag> : null}
            {complete ? <CheckIcon className="size-4 shrink-0 text-status-emerald-700" weight="bold" aria-hidden /> : null}
            <RowCell className="w-16">
              {area.checked} of {area.total}
            </RowCell>
          </ListRow>
        );
      })}
    </RowList>
  );
}

function People({ people }: { people: Live["people"] }) {
  if (people.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-1.5" data-testid="hash-people">
      {people.map((person) => (
        <li key={person.userId} title={person.name}>
          <UserAvatar
            name={person.name}
            email={person.email}
            userId={person.userId}
            imageUrl={person.imageUrl}
            size="sm"
          />
        </li>
      ))}
    </ul>
  );
}

export function HashLive({ hashDateId }: { hashDateId: Id<"hashDates"> }) {
  const today = pacificDateKey(useNow(60_000));
  const live = useQuery(api.hashingLive.get, { hashDateId, today });
  const start = useMutation(api.hashingLive.start);
  const finish = useMutation(api.hashingLive.finish);
  const [finishing, setFinishing] = useState(false);
  const areaId = useSearchParams().get("area");
  const [busy, setBusy] = useState(false);

  if (live === undefined) return <Skeleton className="h-96 w-full" />;
  if (live === null) return <EmptyState>This hash no longer exists.</EmptyState>;

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      notify.success(success);
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Couldn't update this hash."));
    } finally {
      setBusy(false);
    }
  }

  async function finishWith(attendeeUserIds: string[]) {
    await run(() => finish({ hashDateId, attendeeUserIds }), "Hash finished.");
    setFinishing(false);
  }

  const area = areaId ? live.areas.find((candidate) => candidate.id === areaId) : undefined;
  const pill = HASH_STATUS_PILLS[live.hash.status];
  const running = live.hash.status === "in_progress";

  return (
    <div className="space-y-4 pb-24" data-testid="hash-live" data-status={live.hash.status}>
      {area ? null : (
        <PageHeader
          back={{ href: HASHING_BASE_PATH, label: "Hashing" }}
          title={hashDayLabel(live.hash.dateKey)}
          pills={<StatusPill tone={pill.tone}>{pill.label}</StatusPill>}
          actions={
            live.canStart ? (
              <Button
                size="sm"
                disabled={busy}
                data-testid="hash-start"
                onClick={() => void run(() => start({ hashDateId }), "Hash started.")}
              >
                Start hash
              </Button>
            ) : running && live.canWork ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                data-testid="hash-finish"
                onClick={() => setFinishing(true)}
              >
                Finish hash
              </Button>
            ) : undefined
          }
          meta={
            <>
              <MetaItem icon={CalendarBlankIcon}>{hashTimeRange(live.hash.startsAt, live.hash.endsAt)}</MetaItem>
              {live.location ? <MetaItem icon={MapPinIcon}>{live.location}</MetaItem> : null}
            </>
          }
        >
          <People people={live.people} />
        </PageHeader>
      )}
      {area ? null : <Progress totals={live.totals} />}
      {area ? <AreaView key={area.id} live={live} area={area} /> : <AreaList live={live} />}
      <FinishDialog
        open={finishing}
        onOpenChange={setFinishing}
        people={live.people}
        viewerId={live.viewerId}
        canManage={live.canManage}
        itemsLeft={live.totals.total - live.totals.checked}
        busy={busy}
        onFinish={(attendeeUserIds) => void finishWith(attendeeUserIds)}
      />
    </div>
  );
}
