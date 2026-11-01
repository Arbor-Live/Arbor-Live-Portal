"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { CalendarBlankIcon, MapPinIcon, UsersThreeIcon, WarningIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { FillFromAvailabilityButton } from "@/components/hashing/fill-from-availability";
import { MetaItem, PageHeader, PageTabs, StatusPill } from "@/components/page-header";
import { plural } from "@/lib/format";
import { hashSlotLabel } from "@/lib/hashing";
import {
  activeHashingTab,
  HASHING_TABS,
  HASHING_TAB_ICONS,
  HASHING_TAB_LABELS,
  hashingTabPath,
} from "@/lib/hashing-tabs";

export function HashingShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = activeHashingTab(pathname);
  const [now] = useState(() => Date.now());
  const overview = useQuery(api.hashing.getOverview, { now });
  const canManage = overview?.canManage ?? false;
  const settings = overview?.settings;

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
                <span
                  className="inline-flex items-center gap-0.5 text-status-amber-700"
                  title={plural(overview.openFlags, "open flag")}
                >
                  <WarningIcon className="size-3.5" weight="fill" aria-hidden />
                  <span className="text-xs tabular-nums">{overview.openFlags}</span>
                </span>
              ) : undefined,
          }))}
        />
      ) : null}
      {children}
    </div>
  );
}
