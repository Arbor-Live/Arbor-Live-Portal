"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowSquareOutIcon,
  CalendarBlankIcon,
  ClockIcon,
  MicrophoneStageIcon,
  MusicNotesIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { DetailSheet, EmptyState, ListSummary, RowFlag, RowGroup, RowMenu, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { MetaItem, PageHeader, StatusPill } from "@/components/page-header";
import { SignupSheetBody } from "@/components/events/open-mic-signup-sheet";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatTime, plural } from "@/lib/format";
import { notify } from "@/lib/notify";
import {
  optimisticAdvanceCurrent,
  optimisticMarkNotHere,
  optimisticRemoveSignup,
  optimisticSetOpenMicStatus,
} from "@/lib/open-mic-optimistic";
import { deriveRunnerView, type RunnerSignup } from "@/lib/open-mic-runner-view";
import {
  formatNightStart,
  OPEN_MIC_MOVES,
  OPEN_MIC_STATUS,
  openMicSignupPath,
  type OpenMicStatus,
} from "@/lib/open-mic-status";
import { cn } from "@/lib/utils";

const AMBER_TEXT = "text-status-amber-700 dark:text-status-amber-300";

type RunnerActions = {
  canRun: boolean;
  advance: () => void;
  notHere: (signup: RunnerSignup) => void;
  remove: (signup: RunnerSignup) => Promise<boolean>;
  open: (signup: RunnerSignup) => void;
  copySignupLink: () => void;
};

async function attempt(action: () => Promise<unknown>) {
  try {
    await action();
    return true;
  } catch (error) {
    notify.error(getConvexErrorMessage(error));
    return false;
  }
}

function EquipmentFlags({ equipment }: { equipment: string[] }) {
  return equipment.map((item) => (
    <RowFlag key={item} tone="neutral">
      {item}
    </RowFlag>
  ));
}

function NowPerforming({
  current,
  next,
  actions,
}: {
  current: RunnerSignup | null;
  next: RunnerSignup | undefined;
  actions: RunnerActions;
}) {
  return (
    <section data-testid="open-mic-now-performing" className="relative border">
      <span
        className={cn("absolute inset-y-0 left-0 w-1", current ? "bg-status-emerald-500" : "bg-border")}
        aria-hidden
      />
      <div className="space-y-3 py-4 pr-4 pl-5">
        <p className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">Now performing</p>
        {current ? (
          <>
            <div className="space-y-1">
              <p className="text-xl font-semibold">{current.name}</p>
              <p className="text-sm">{current.whatTheyreDoing}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <EquipmentFlags equipment={current.equipment} />
              {current.skipsCount > 0 ? (
                <RowFlag>{plural(current.skipsCount, "strike")}</RowFlag>
              ) : null}
              {current.bgMusicLink ? (
                <a
                  href={current.bgMusicLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm underline underline-offset-2"
                >
                  <MusicNotesIcon className="size-4" aria-hidden />
                  Background music
                  <ArrowSquareOutIcon className="size-3" aria-hidden />
                </a>
              ) : null}
            </div>
            {current.notes ? (
              <p className="bg-muted px-3 py-2 text-sm text-muted-foreground">{current.notes}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" disabled={!actions.canRun} onClick={actions.advance}>
                {next ? `Next: ${next.name}` : "Finish set"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!actions.canRun}
                onClick={() => actions.notHere(current)}
              >
                Not here
              </Button>
              <div className="ml-auto">
                <RowMenu label={`More for ${current.name}`}>
                  <DropdownMenuItem onSelect={() => actions.open(current)}>Open details</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => void actions.remove(current)}>
                    Remove from queue
                  </DropdownMenuItem>
                </RowMenu>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">No one on stage.</p>
            {next ? (
              <Button type="button" disabled={!actions.canRun} onClick={actions.advance}>
                Call up {next.name}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function UpNext({ queued, actions }: { queued: RunnerSignup[]; actions: RunnerActions }) {
  return (
    <RowGroup title="Up next" count={queued.length} className="border">
      {queued.length === 0 ? (
        <li className="p-3">
          <EmptyState
            action={
              <Button type="button" variant="outline" size="sm" onClick={actions.copySignupLink}>
                Copy sign-up link
              </Button>
            }
          >
            No sign-ups yet. Share the sign-up form so performers can join the queue.
          </EmptyState>
        </li>
      ) : (
        queued.map((signup, index) => (
          <ListRow
            key={signup._id}
            data-testid={`open-mic-signup-${signup._id}`}
            onOpen={() => actions.open(signup)}
            leading={
              <span className="w-5 shrink-0 text-right text-sm text-muted-foreground tabular-nums">{index + 1}</span>
            }
            actions={
              <RowMenu label={`More for ${signup.name}`}>
                <DropdownMenuItem onSelect={() => actions.open(signup)}>Open details</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => void actions.remove(signup)}>
                  Remove from queue
                </DropdownMenuItem>
              </RowMenu>
            }
          >
            <RowText title={signup.name} detail={signup.whatTheyreDoing} />
            {signup.skipsCount > 0 ? <RowFlag>{plural(signup.skipsCount, "strike")}</RowFlag> : null}
            <div className="hidden shrink-0 items-center gap-1.5 md:flex">
              <EquipmentFlags equipment={signup.equipment} />
            </div>
          </ListRow>
        ))
      )}
    </RowGroup>
  );
}

function PerformedTonight({ performed, actions }: { performed: RunnerSignup[]; actions: RunnerActions }) {
  return (
    <RowGroup title="Performed tonight" count={performed.length} className="border">
      {performed.length === 0 ? (
        <li className="p-3">
          <EmptyState>No one has performed yet.</EmptyState>
        </li>
      ) : (
        performed.map((signup) => (
          <ListRow
            key={signup._id}
            data-testid={`open-mic-signup-${signup._id}`}
            onOpen={() => actions.open(signup)}
            leading={
              <span className="w-16 shrink-0 text-sm text-muted-foreground tabular-nums">
                {signup.performedAt ? formatTime(signup.performedAt) : "—"}
              </span>
            }
          >
            <RowText title={signup.name} detail={signup.whatTheyreDoing} />
          </ListRow>
        ))
      )}
    </RowGroup>
  );
}

export function OpenMicRunner({ eventId }: { eventId: Id<"events"> }) {
  const { confirm } = useAppDialog();
  const searchParams = useSearchParams();
  const state = useQuery(api.openMic.getRunnerState, { eventId });
  const advance = useMutation(api.openMic.advanceCurrent).withOptimisticUpdate(optimisticAdvanceCurrent);
  const markNotHere = useMutation(api.openMic.markNotHere).withOptimisticUpdate(optimisticMarkNotHere);
  const removeSignup = useMutation(api.openMic.removeSignup).withOptimisticUpdate(optimisticRemoveSignup);
  const setOpenMicStatus = useMutation(api.openMic.setOpenMicStatus).withOptimisticUpdate(
    optimisticSetOpenMicStatus,
  );
  // `?signup=<id>` opens that sign-up's side panel.
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("signup"));
  const [now] = useState(() => Date.now());

  const signups = state?.signups;
  const view = useMemo(() => deriveRunnerView(signups ?? []), [signups]);

  if (state === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (state === null) {
    return (
      <div className="space-y-4">
        <PageHeader back={{ href: "/dashboard/events/open-mic", label: "Open Mic" }} title="Open Mic" />
        <EmptyState>Open Mic isn&rsquo;t turned on for this event.</EmptyState>
      </div>
    );
  }

  const { event } = state;
  const { current, queued, performed } = view;
  const status = OPEN_MIC_STATUS[event.status];
  const moves = OPEN_MIC_MOVES[event.status];
  const canRun = event.runnerWindowOpen && moves.canRun;
  const selected = signups?.find((signup) => signup._id === selectedId && signup.status !== "removed") ?? null;

  async function setStatus(next: OpenMicStatus) {
    if (next === "completed") {
      const ok = await confirm({
        title: `Mark ${event.title} completed?`,
        description: "Sign-ups close. Everyone who performed stays on record.",
        confirmLabel: "Mark completed",
      });
      if (!ok) return;
    }
    if (next === "cancelled") {
      const ok = await confirm({
        title: `Cancel ${event.title}?`,
        description: "Sign-ups close and the runner stops. The queue stays on record.",
        confirmLabel: "Cancel night",
        destructive: true,
      });
      if (!ok) return;
    }
    await attempt(() => setOpenMicStatus({ eventId, status: next }));
  }

  async function copySignupLink() {
    try {
      await navigator.clipboard.writeText(new URL(openMicSignupPath(eventId), window.location.origin).toString());
      notify.success("Sign-up link copied.");
    } catch {
      notify.error("Could not copy link.");
    }
  }

  async function remove(signup: RunnerSignup) {
    const ok = await confirm({
      title: `Remove ${signup.name} from the queue?`,
      description: "Their sign-up is deleted. They can sign up again from the form.",
      confirmLabel: "Remove from queue",
      destructive: true,
    });
    if (!ok) return false;
    const removed = await attempt(() => removeSignup({ signupId: signup._id }));
    if (removed && selectedId === signup._id) setSelectedId(null);
    return removed;
  }

  const actions: RunnerActions = {
    canRun,
    advance: () => void attempt(() => advance({ eventId })),
    notHere: (signup) => void attempt(() => markNotHere({ signupId: signup._id })),
    remove,
    open: (signup) => setSelectedId(signup._id),
    copySignupLink: () => void copySignupLink(),
  };

  const summaryParts = [
    current ? `${current.name} on stage` : null,
    queued.length > 0 ? `${queued.length} queued` : null,
    performed.length > 0 ? `${performed.length} performed tonight` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4" data-testid="open-mic-runner">
      <PageHeader
        back={{ href: "/dashboard/events/open-mic", label: "Open Mic" }}
        pills={<StatusPill tone={status.tone}>{status.label}</StatusPill>}
        title={event.title}
        meta={
          <>
            <MetaItem icon={CalendarBlankIcon}>{formatNightStart(event.startAt)}</MetaItem>
            <MetaItem icon={ClockIcon}>
              Runner {formatTime(event.runnerOpensAt)} – {formatTime(event.runnerClosesAt)}
            </MetaItem>
            <MetaItem icon={MicrophoneStageIcon} href={openMicSignupPath(eventId)}>
              Sign-up form
            </MetaItem>
          </>
        }
        actions={
          moves.next === "live" ? (
            <Button
              type="button"
              size="sm"
              disabled={!event.runnerWindowOpen}
              title={event.runnerWindowOpen ? undefined : `The runner opens at ${formatTime(event.runnerOpensAt)}.`}
              onClick={() => void setStatus("live")}
            >
              Go live
            </Button>
          ) : moves.next === "completed" ? (
            <Button type="button" size="sm" variant="outline" onClick={() => void setStatus("completed")}>
              Mark completed
            </Button>
          ) : null
        }
        menuLabel="More Open Mic actions"
        menu={
          <>
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/events/${eventId}`}>Open event</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void copySignupLink()}>Copy sign-up link</DropdownMenuItem>
            {moves.canCancel ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => void setStatus("cancelled")}>
                  Cancel night
                </DropdownMenuItem>
              </>
            ) : null}
          </>
        }
      />

      {!event.runnerWindowOpen ? (
        <Alert className={cn("border-status-amber-500/40 bg-status-amber-500/10", AMBER_TEXT)}>
          <WarningIcon aria-hidden />
          <AlertDescription className={AMBER_TEXT}>
            {now < event.runnerOpensAt
              ? `The runner opens at ${formatTime(event.runnerOpensAt)}, an hour before the start. Until then you can see the queue but not call anyone up.`
              : `The runner closed at ${formatTime(event.runnerClosesAt)}, an hour after the end. You can see the queue but not call anyone up.`}
          </AlertDescription>
        </Alert>
      ) : null}

      <ListSummary
        testId="open-mic-runner-summary"
        order="In sign-up order. Not here moves someone to the front, then the back, then off the list."
      >
        {summaryParts.length > 0 ? summaryParts.join(" · ") : "No sign-ups yet"}
      </ListSummary>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <NowPerforming current={current} next={queued[0]} actions={actions} />
          <UpNext queued={queued} actions={actions} />
        </div>
        <div className="min-w-0">
          <PerformedTonight performed={performed} actions={actions} />
        </div>
      </div>

      <DetailSheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        testId="open-mic-signup-sheet"
      >
        {selected ? (
          <SignupSheetBody
            key={selected._id}
            signup={selected}
            queueIndex={queued.findIndex((signup) => signup._id === selected._id)}
            onRemove={remove}
          />
        ) : null}
      </DetailSheet>
    </div>
  );
}
