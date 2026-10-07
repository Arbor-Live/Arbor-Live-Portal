"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  BatteryMediumIcon,
  ClockIcon,
  VideoCameraIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { ClipSheet, useRingThumbnail, type ClipRow } from "@/components/camera/clip-sheet";
import { RingAuthCommand, RingConnectForm } from "@/components/camera/ring-connect-form";
import { EmptyState, ListSummary, RowFlag, RowGroup, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { MetaItem, PageHeader, StatusPill } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { addDaysToDateKey, formatRelativeTime, formatTime, pacificDateAndTimeToMs, pacificDateKey, plural } from "@/lib/format";
import { notify } from "@/lib/notify";
import {
  clipDayLabel,
  formatClipDuration,
  groupClipsByDay,
  RING_CLIP_KIND_ICONS,
  RING_CLIP_KIND_LABELS,
  RING_CLIP_KINDS,
  type RingClipKind,
} from "@/lib/ring-clips";

const PAGE_SIZE = 40;
/** `?clip=<id>` opens that clip's player. */
const CLIP_PARAM = "clip";

function setClipParam(value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(CLIP_PARAM, value);
  else url.searchParams.delete(CLIP_PARAM);
  window.history.replaceState(null, "", url);
}

function ClipThumbnail({ clip, className }: { clip: ClipRow; className?: string }) {
  const Icon = RING_CLIP_KIND_ICONS[clip.kind];
  const src = useRingThumbnail(clip.thumbnailUrl);
  return (
    <span className={`flex aspect-video shrink-0 items-center justify-center overflow-hidden bg-muted ${className ?? ""}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" data-testid="ring-clip-thumbnail" />
      ) : (
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}

function ConnectCard() {
  return (
    <Card className="max-w-2xl" data-testid="ring-connect-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <VideoCameraIcon className="size-4 text-muted-foreground" />
          Connect the Ring camera
        </CardTitle>
        <CardDescription>
          Ring has no official sign-in for other apps, so connecting takes a one-time token from Ring&apos;s
          sign-in tool.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RingConnectForm idPrefix="ring-connect" />
      </CardContent>
    </Card>
  );
}

export function CameraWorkspace() {
  const overview = useQuery(api.ringCamera.getOverview, {});

  if (overview === undefined) {
    return (
      <div className="space-y-4" data-testid="camera-page">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (overview === null) {
    return (
      <div className="space-y-4 pb-24" data-testid="camera-page">
        <PageHeader
          title="Camera"
          description="Recorded clips from the Ring camera, for admins. Connect the Ring account to start."
        />
        <ConnectCard />
      </div>
    );
  }

  return <ConnectedCamera overview={overview} />;
}

type Overview = NonNullable<FunctionReturnType<typeof api.ringCamera.getOverview>>;

function ConnectedCamera({ overview }: { overview: Overview }) {
  const { confirm } = useAppDialog();
  const searchParams = useSearchParams();
  const syncNow = useAction(api.ringCameraActions.syncNow);
  const disconnect = useMutation(api.ringCamera.disconnect);

  const [kind, setKind] = useState<RingClipKind | "all">("all");
  const [jumpDate, setJumpDate] = useState("");
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get(CLIP_PARAM));
  const [reconnectOpen, setReconnectOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // "Jump to date" shows that day and everything before it.
  const before = (jumpDate && pacificDateAndTimeToMs(addDaysToDateKey(jumpDate, 1), "00:00")) || undefined;
  const { results, status, loadMore } = usePaginatedQuery(
    api.ringCamera.listClips,
    { kind: kind === "all" ? undefined : kind, before },
    { initialNumItems: PAGE_SIZE },
  );

  const clips: ClipRow[] = results;
  const groups = useMemo(() => groupClipsByDay(clips), [clips]);
  const people = clips.filter((clip) => clip.personDetected).length;

  // The latest clip can be opened from the aside even when a filter hides it.
  const latest: ClipRow | null = overview.latestClip;
  const openIndex = openId ? clips.findIndex((clip) => clip._id === openId) : -1;
  const openClip = openIndex >= 0 ? clips[openIndex] : latest && latest._id === openId ? latest : null;

  const open = useCallback((id: string | null) => {
    setOpenId(id);
    setClipParam(id);
  }, []);

  const older = openIndex >= 0 && openIndex < clips.length - 1 ? () => open(clips[openIndex + 1]._id) : null;
  const newer = openIndex > 0 ? () => open(clips[openIndex - 1]._id) : null;

  // Stepping toward the end of what's loaded pulls the next page in.
  useEffect(() => {
    if (openIndex >= 0 && openIndex >= clips.length - 3 && status === "CanLoadMore") loadMore(PAGE_SIZE);
  }, [openIndex, clips.length, status, loadMore]);

  // Scrolling to the bottom of the list loads more.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || status !== "CanLoadMore") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore(PAGE_SIZE);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [status, loadMore]);

  async function checkNow() {
    setSyncing(true);
    try {
      const { added } = await syncNow({});
      notify.success(added ? `${plural(added, "new clip")}.` : "No new clips.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setSyncing(false);
    }
  }

  async function disconnectRing() {
    const ok = await confirm({
      title: "Disconnect Ring?",
      description:
        "The portal forgets the Ring sign-in and stops checking for clips. Clips already here stay until they're 60 days old.",
      destructive: true,
      confirmLabel: "Disconnect",
    });
    if (!ok) return;
    try {
      await disconnect({});
      notify.success("Ring disconnected.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  const camera = overview.camera;
  const battery = camera?.batteryPercent;
  const needsReconnect = overview.status === "error";

  return (
    <div className="space-y-4 pb-24" data-testid="camera-page">
      <PageHeader
        title={camera?.name ?? "Camera"}
        description="Recorded clips from the Ring camera. New clips show up within about five minutes."
        pills={
          camera?.online === undefined ? null : (
            <StatusPill tone={camera.online ? "emerald" : "rose"}>{camera.online ? "Online" : "Offline"}</StatusPill>
          )
        }
        meta={
          <>
            {battery !== undefined ? <MetaItem icon={BatteryMediumIcon}>{battery}% battery</MetaItem> : null}
            <MetaItem icon={ClockIcon}>
              {overview.lastSyncedAt ? `Checked ${formatRelativeTime(overview.lastSyncedAt).toLowerCase()}` : "Loading clips…"}
            </MetaItem>
          </>
        }
        actions={
          <Button size="sm" variant="outline" disabled={syncing || needsReconnect} onClick={() => void checkNow()}>
            {syncing ? "Checking…" : "Check now"}
          </Button>
        }
        menu={
          <>
            <DropdownMenuItem onSelect={() => setReconnectOpen(true)}>Reconnect Ring</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => void disconnectRing()}>
              Disconnect Ring
            </DropdownMenuItem>
          </>
        }
      />

      {needsReconnect ? (
        <Alert variant="destructive" data-testid="ring-reconnect-alert">
          <WarningCircleIcon />
          <AlertTitle>Ring signed the portal out</AlertTitle>
          <AlertDescription>
            <p>Ring stopped accepting the saved sign-in. To renew it:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                In a terminal on your computer, run <RingAuthCommand /> and sign in with the Ring account (it asks
                for the two-factor code).
              </li>
              <li>Choose Reconnect Ring and paste the new token it prints.</li>
            </ol>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => setReconnectOpen(true)}>
              Reconnect Ring
            </Button>
          </AlertDescription>
        </Alert>
      ) : overview.lastError ? (
        <Alert>
          <WarningCircleIcon />
          <AlertTitle>The last check didn&apos;t finish</AlertTitle>
          <AlertDescription>{overview.lastError} It tries again every five minutes.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={kind}
              onValueChange={(value) => value && setKind(value as RingClipKind | "all")}
              aria-label="Clip type"
            >
              <ToggleGroupItem value="all">All</ToggleGroupItem>
              {RING_CLIP_KINDS.map((value) => (
                <ToggleGroupItem key={value} value={value}>
                  {RING_CLIP_KIND_LABELS[value]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <div className="flex items-center gap-1">
              <DatePickerField
                value={jumpDate}
                onChange={setJumpDate}
                placeholder="Jump to date"
                aria-label="Jump to date"
                className="w-44"
              />
              {jumpDate ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Back to the newest clips"
                  title="Back to the newest clips"
                  onClick={() => setJumpDate("")}
                >
                  <XIcon />
                </Button>
              ) : null}
            </div>
          </div>

          {status === "LoadingFirstPage" ? (
            <Skeleton className="h-64 w-full" />
          ) : clips.length === 0 ? (
            <EmptyState>
              {kind !== "all" || jumpDate
                ? "No clips match. Try another type or date."
                : overview.lastSyncedAt
                  ? "No clips in the last 60 days. New ones show up here within about five minutes."
                  : "Loading the last 30 days of clips from Ring…"}
            </EmptyState>
          ) : (
            <>
              <ListSummary
                testId="ring-clip-summary"
                order="Newest first, grouped by day. Clips drop off after 60 days."
              >
                {plural(clips.length, "clip")}
                {status === "CanLoadMore" ? " loaded" : ""}
                {people ? ` · ${people} with a person` : ""}
              </ListSummary>
              <div className="space-y-3" data-testid="ring-clip-list">
                {groups.map((group) => (
                  <RowGroup
                    key={group.dayKey}
                    title={clipDayLabel(group.dayKey, now)}
                    count={group.clips.length}
                    className="border"
                  >
                    {group.clips.map((clip) => {
                      const duration = formatClipDuration(clip.durationSec);
                      return (
                        <ListRow
                          key={clip._id}
                          onOpen={() => open(clip._id)}
                          leading={<ClipThumbnail clip={clip} className="w-24" />}
                          data-testid="ring-clip-row"
                          aria-current={clip._id === openId ? "true" : undefined}
                          className={clip._id === openId ? "bg-muted/40" : undefined}
                        >
                          <RowText
                            eyebrow={RING_CLIP_KIND_LABELS[clip.kind]}
                            title={formatTime(clip.createdAt)}
                            detail={duration ?? "Still processing"}
                          />
                          {clip.personDetected ? <RowFlag>Person</RowFlag> : null}
                        </ListRow>
                      );
                    })}
                  </RowGroup>
                ))}
              </div>
              <div ref={sentinel} className="h-px" />
              {status === "LoadingMore" ? <p className="text-sm text-muted-foreground">Loading more clips…</p> : null}
              {status === "CanLoadMore" ? (
                <Button type="button" variant="outline" size="sm" onClick={() => loadMore(PAGE_SIZE)}>
                  Load older clips
                </Button>
              ) : null}
            </>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <VideoCameraIcon className="size-4 text-muted-foreground" />
                Latest clip
              </CardTitle>
              <CardDescription>
                A battery camera only takes a picture when it records, so this is the newest clip, not a live view.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {latest ? (
                <button
                  type="button"
                  className="block w-full space-y-2 text-left"
                  onClick={() => open(latest._id)}
                  data-testid="ring-latest-clip"
                >
                  <ClipThumbnail clip={latest} className="w-full" />
                  <span className="block text-sm">
                    {RING_CLIP_KIND_LABELS[latest.kind]} · {clipDayLabel(pacificDateKey(latest.createdAt), now)},{" "}
                    {formatTime(latest.createdAt)}
                  </span>
                </button>
              ) : (
                <p className="text-sm text-muted-foreground">No clips yet.</p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <ClipSheet clip={openClip} onOpenChange={(next) => !next && open(null)} onOlder={older} onNewer={newer} />

      <Dialog open={reconnectOpen} onOpenChange={setReconnectOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reconnect Ring</DialogTitle>
            <DialogDescription>
              Ring signs the portal out now and then. Paste a new token here to renew it, or to switch Ring accounts.
            </DialogDescription>
          </DialogHeader>
          <RingConnectForm idPrefix="ring-reconnect" onConnected={() => setReconnectOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
