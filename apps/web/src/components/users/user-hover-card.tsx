"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { EnvelopeSimpleIcon, PhoneIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { UserAvatar } from "@/components/account/user-avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCrewHoursWindows } from "@/hooks/use-crew-hours-windows";
import { formatHours } from "@/lib/crew-hours-windows";

/**
 * Hover a person to see who they are and how to reach them. With `showHours`
 * the card adds the hours they're on shifts this week and this quarter.
 * Details load only once the card opens.
 */
export function UserHoverCard({
  userId,
  showHours = false,
  extra,
  side = "top",
  align = "start",
  children,
}: {
  userId: string;
  showHours?: boolean;
  /** Context for where the card is shown (e.g. availability for a section). */
  extra?: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  /** The trigger; must accept a ref (rendered with `asChild`). */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side={side} align={align} data-testid="user-hover-card">
        {open ? <UserCardBody userId={userId} showHours={showHours} extra={extra} /> : null}
      </HoverCardContent>
    </HoverCard>
  );
}

function UserCardBody({
  userId,
  showHours,
  extra,
}: {
  userId: string;
  showHours: boolean;
  extra?: ReactNode;
}) {
  const windows = useCrewHoursWindows();
  const card = useQuery(api.userCards.getCard, {
    userId,
    ...(showHours
      ? {
          week: windows.week,
          quarter: windows.quarter
            ? { startMs: windows.quarter.startMs, endMs: windows.quarter.endMs }
            : undefined,
        }
      : {}),
  });

  if (card === undefined) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="size-10" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    );
  }
  if (card === null) {
    return <p className="text-muted-foreground">This person isn&apos;t in the portal anymore.</p>;
  }

  const subtitle = [card.title, card.pronouns, card.gradYear ? `’${String(card.gradYear).slice(-2)}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2.5">
        <UserAvatar
          name={card.name}
          email={card.email ?? ""}
          userId={card.userId}
          imageUrl={card.avatarUrl}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{card.name}</p>
          {card.username ? <p className="truncate text-muted-foreground">@{card.username}</p> : null}
          {subtitle ? <p className="truncate text-muted-foreground">{subtitle}</p> : null}
        </div>
        {card.status !== "active" ? (
          <span className="ml-auto shrink-0 rounded bg-status-amber-500/15 px-1.5 py-0.5 text-3xs font-medium uppercase tracking-wide text-status-amber-800 dark:text-status-amber-300">
            {card.status}
          </span>
        ) : null}
      </div>

      {extra ? <div className="border-t pt-2">{extra}</div> : null}

      <div className="space-y-1 border-t pt-2">
        {card.phone ? (
          <a
            href={`tel:${card.phone.replace(/[^\d+]/g, "")}`}
            className="flex items-center gap-2 hover:underline"
          >
            <PhoneIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {card.phone}
          </a>
        ) : (
          <p className="flex items-center gap-2 text-muted-foreground">
            <PhoneIcon className="size-3.5 shrink-0" aria-hidden />
            No phone on file
          </p>
        )}
        {card.email ? (
          <a href={`mailto:${card.email}`} className="flex min-w-0 items-center gap-2 hover:underline">
            <EnvelopeSimpleIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{card.email}</span>
          </a>
        ) : null}
      </div>

      {showHours ? (
        <dl className="grid grid-cols-2 gap-2 border-t pt-2" data-testid="user-hover-card-hours">
          <div>
            <dt className="text-muted-foreground">This week</dt>
            <dd className="text-sm font-medium tabular-nums">{formatHours(card.weekHours ?? 0)}</dd>
          </div>
          <div>
            <dt className="truncate text-muted-foreground">{windows.quarter?.label ?? "This quarter"}</dt>
            <dd className="text-sm font-medium tabular-nums">
              {card.quarterHours === undefined ? "—" : formatHours(card.quarterHours)}
            </dd>
          </div>
          <p className="col-span-2 text-2xs text-muted-foreground">Hours on shifts, worked and scheduled.</p>
        </dl>
      ) : null}
    </div>
  );
}
