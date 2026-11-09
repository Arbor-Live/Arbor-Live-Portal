"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { CalendarBlankIcon, MapPinIcon, UsersThreeIcon, WarningIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { FillFromAvailabilityButton } from "@/components/hashing/fill-from-availability";
import { RowGroup, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { MetaItem, PageHeader, PageTabs, StatusPill } from "@/components/page-header";
import { plural } from "@/lib/format";
import { hashDayLabel, hashSlotLabel } from "@/lib/hashing";
import {
  activeHashingTab,
  HASHING_TABS,
  HASHING_TAB_ICONS,
  HASHING_TAB_LABELS,
  hashingTabPath,
  hashPath,
} from "@/lib/hashing-tabs";

function WarningBadge({ count, title }: { count: number; title: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-status-amber-700" title={title}>
      <WarningIcon className="size-3.5" weight="fill" aria-hidden />
      <span className="text-xs tabular-nums">{count}</span>
    </span>
  );
}

function StaleHashes({ hashes }: { hashes: { _id: string; dateKey: string }[] }) {
  return (
    <RowGroup title="Still running" count={hashes.length} tone="amber" testId="hash-stale">
      {hashes.map((hash) => (
        <ListRow key={hash._id} data-testid="hash-stale-row" href={hashPath(hash._id)}>
          <RowText title={hashDayLabel(hash.dateKey)} detail="Never finished" />
        </ListRow>
      ))}
    </RowGroup>
  );
}

export function HashingShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = activeHashingTab(pathname);
  const [now] = useState(() => Date.now());
  const overview = useQuery(api.hashing.getOverview, { now });
  const canManage = overview?.canManage ?? false;
  const settings = overview?.settings;
  const staleHashes = overview?.staleHashes ?? [];

  return (
    <div className="space-y-4 pb-24" data-testid="hashing-page">
      <PageHeader
        back={{ href: "/dashboard/events", label: "Events" }}
        title="Hashing"
        pills={overview?.quarter ? <StatusPill tone="neutral">{overview.quarter.label}</StatusPill> : undefined}
        actions={active === "schedule" && canManage ? <FillFromAvailabilityButton /> : undefined}
        meta={
          settings ? (
            <>
              <MetaItem icon={CalendarBlankIcon}>{hashSlotLabel(settings)}</MetaItem>
              <MetaItem icon={UsersThreeIcon}>{plural(settings.spotsPerHash, "person", "people")}</MetaItem>
              <MetaItem icon={MapPinIcon}>{settings.location}</MetaItem>
            </>
          ) : undefined
        }
      />
      {canManage ? (
        <PageTabs
          label="Hashing sections"
          tabs={HASHING_TABS.map((tab) => ({
            href: hashingTabPath(tab),
            label: HASHING_TAB_LABELS[tab],
            icon: HASHING_TAB_ICONS[tab],
            active: tab === active,
            badge:
              tab === "history" && overview && overview.openFlags > 0 ? (
                <WarningBadge count={overview.openFlags} title={plural(overview.openFlags, "open flag")} />
              ) : tab === "checklist" && overview && overview.pendingPhotos > 0 ? (
                <WarningBadge count={overview.pendingPhotos} title={plural(overview.pendingPhotos, "photo") + " to review"} />
              ) : tab === "schedule" && staleHashes.length > 0 ? (
                <WarningBadge count={staleHashes.length} title={plural(staleHashes.length, "hash", "hashes") + " still running"} />
              ) : undefined,
          }))}
        />
      ) : null}
      {active === "schedule" && staleHashes.length > 0 ? <StaleHashes hashes={staleHashes} /> : null}
      {children}
    </div>
  );
}
