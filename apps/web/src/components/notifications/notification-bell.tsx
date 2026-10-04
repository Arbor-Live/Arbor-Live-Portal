"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { BellIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, type Id } from "@/lib/convex-api";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useInstallPrompt } from "./install-prompt-store";
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
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0">
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

  const open = (notification: {
    _id: Id<"notifications">;
    template: string;
    path?: string;
    readAt?: number;
  }) => {
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

  return (
    <>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <p className="text-sm font-medium">Notifications</p>
        {unreadCount > 0 ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void markAllRead({}).catch(() => undefined)}
          >
            Mark all read
          </Button>
        ) : null}
      </div>
      <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
        {notifications === undefined ? (
          <p className="px-3 py-6 text-center text-muted-foreground">Loading…</p>
        ) : notifications.length === 0 ? (
          <p className="px-3 py-8 text-center text-muted-foreground">You&rsquo;re all caught up.</p>
        ) : (
          <ul className="divide-y">
            {notifications.map((notification) => {
              const unread = notification.readAt === undefined;
              return (
                <li key={notification._id}>
                  <button
                    type="button"
                    onClick={() => open(notification)}
                    className={cn(
                      "flex w-full gap-2.5 px-3 py-2.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                      !notification.path &&
                        !unread &&
                        notification.template !== "app_install" &&
                        "cursor-default hover:bg-transparent",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        unread ? "bg-primary" : "bg-transparent",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-xs leading-snug",
                          unread ? "font-medium text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {notification.title}
                      </span>
                      {notification.body ? (
                        <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                          {notification.body}
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-3xs text-muted-foreground">
                        {formatRelativeTime(notification.createdAt)}
                        {unread ? <span className="sr-only">, unread</span> : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <PushPrompt />
    </>
  );
}
