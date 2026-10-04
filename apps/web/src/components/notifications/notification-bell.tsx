"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { BellIcon, ChecksIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Id } from "@/lib/convex-api";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useInstallPrompt } from "./install-prompt-store";
import { NotificationKindIcon, splitNotificationTitle } from "./notification-kinds";
import { PushPrompt } from "./push-settings";
import { useUnreadNotifications } from "./use-unread-notifications";

/** Header bell: unread badge and a popover of recent notifications. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const summary = useUnreadNotifications();
  const count = summary?.count ?? 0;
  const badge = summary?.hasMore ? `${count}+` : String(count);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={count > 0 ? `Notifications, ${badge} unread` : "Notifications"}
        >
          <BellIcon className="size-5" />
          {count > 0 ? (
            <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-3xs font-semibold text-primary-foreground tabular-nums">
              {badge}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(26rem,calc(100vw-1rem))] gap-0 overflow-hidden p-0">
        {open ? <NotificationList unreadCount={count} onNavigate={() => setOpen(false)} /> : null}
      </PopoverContent>
    </Popover>
  );
}

function NotificationList({
  unreadCount,
  onNavigate,
}: {
  unreadCount: number;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const notifications = useQuery(api.notifications.listRecent, {});
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  const { openDialog: openInstallDialog } = useInstallPrompt();

  const open = (notification: NotificationRow) => {
    // The install nudge stays unread until the app is opened from the Home Screen.
    if (notification.template === "app_install") {
      onNavigate();
      openInstallDialog();
      return;
    }
    if (notification.readAt === undefined) {
      void markRead({ notificationIds: [notification._id] }).catch(() => undefined);
    }
    if (notification.path) {
      onNavigate();
      router.push(notification.path);
    }
  };

  const fresh = notifications?.filter((row) => row.readAt === undefined) ?? [];
  const earlier = notifications?.filter((row) => row.readAt !== undefined) ?? [];

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">{unreadCount} new</span>
          ) : null}
        </div>
        {unreadCount > 0 ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void markAllRead({}).catch(() => undefined)}
          >
            <ChecksIcon data-icon="inline-start" />
            Mark all read
          </Button>
        ) : null}
      </div>
      <div className="max-h-[min(30rem,70vh)] overflow-y-auto overscroll-contain">
        {notifications === undefined ? (
          <div className="divide-y" aria-label="Loading notifications">
            {[0, 1, 2].map((key) => (
              <div key={key} className="flex gap-3 px-4 py-3">
                <Skeleton className="size-8 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-2.5 w-20" />
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <span className="flex size-10 items-center justify-center border bg-muted/40">
              <BellIcon className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <p className="text-sm font-medium">You&rsquo;re all caught up</p>
            <p className="text-xs text-muted-foreground">
              Schedules, mentions, and requests for you show up here.
            </p>
          </div>
        ) : (
          <>
            <NotificationGroup title="New" rows={fresh} onOpen={open} />
            <NotificationGroup title="Earlier" rows={earlier} onOpen={open} />
          </>
        )}
      </div>
      <PushPrompt />
    </>
  );
}

type NotificationRow = {
  _id: Id<"notifications">;
  template: string;
  title: string;
  body?: string;
  path?: string;
  createdAt: number;
  readAt?: number;
};

function NotificationGroup({
  title,
  rows,
  onOpen,
}: {
  title: string;
  rows: NotificationRow[];
  onOpen: (row: NotificationRow) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h3 className="sticky top-0 z-10 border-b bg-popover/95 px-4 py-1.5 text-2xs font-medium tracking-wide text-muted-foreground uppercase backdrop-blur">
        {title}
      </h3>
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row._id}>
            <NotificationItem row={row} onOpen={() => onOpen(row)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function NotificationItem({ row, onOpen }: { row: NotificationRow; onOpen: () => void }) {
  const unread = row.readAt === undefined;
  const { label, title } = splitNotificationTitle(row.title);
  const actionable = Boolean(row.path) || unread || row.template === "app_install";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "relative flex w-full gap-3 px-4 py-3 text-left transition-colors focus-visible:bg-muted focus-visible:outline-none",
        actionable ? "hover:bg-muted/60" : "cursor-default",
        unread && "bg-primary/[0.03]",
      )}
    >
      {unread ? <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-primary" /> : null}
      <span
        aria-hidden
        className={cn(
          "flex size-8 shrink-0 items-center justify-center border",
          unread
            ? "border-primary/25 bg-primary/10 text-primary"
            : "border-border bg-muted/40 text-muted-foreground",
        )}
      >
        <NotificationKindIcon
          template={row.template}
          className="size-4"
          weight={unread ? "fill" : "regular"}
        />
      </span>
      <span className="min-w-0 flex-1">
        {label ? (
          <span className="block truncate text-2xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </span>
        ) : null}
        <span
          className={cn(
            "line-clamp-2 text-sm leading-snug",
            unread ? "font-medium text-foreground" : "text-foreground/80",
          )}
        >
          {title}
        </span>
        {row.body ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{row.body}</span>
        ) : null}
      </span>
      <span className="shrink-0 pt-0.5 text-2xs text-muted-foreground tabular-nums">
        {formatRelativeTime(row.createdAt)}
        {unread ? <span className="sr-only">, unread</span> : null}
      </span>
    </button>
  );
}
