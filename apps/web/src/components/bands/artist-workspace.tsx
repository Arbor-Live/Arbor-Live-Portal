"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import {
  ArrowSquareOutIcon,
  CopyIcon,
  CurrencyDollarIcon,
  GridFourIcon,
  SignatureIcon,
  UserCircleIcon,
  UsersThreeIcon,
  WarningIcon,
  type Icon,
} from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import {
  ADMIN_ARTIST_WORKSPACE_TABS,
  ARTIST_WORKSPACE_TABS,
  ARTIST_WORKSPACE_TAB_LABELS,
  artistWorkspaceTabFromPathname,
  getArtistWorkspaceTabPath,
  type ArtistWorkspaceTabId,
} from "@/lib/artist-workspace-tabs";
import { formatBandPublicArtistUrl } from "@/lib/band-public-link";
import { notify } from "@/lib/notify";
import { ArtistSelect, artistSelectOptions } from "@/components/bands/artist-select";
import { useAdminBandSelection } from "@/components/bands/admin-band-selection";
import { BandOrAdminGuard } from "@/components/org-context-guard";
import { MetaItem, PageHeader, PageTabs, StatusPill } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

const TAB_ICONS: Record<ArtistWorkspaceTabId, Icon> = {
  profile: UserCircleIcon,
  riders: GridFourIcon,
  payments: SignatureIcon,
};

/** The act's identity, from the artist's own profile or the admin's pick. */
type ActSummary = {
  name: string;
  publicListing: boolean;
  publicSlug: string;
};

function ListingPill({ listed }: { listed: boolean }) {
  return listed ? (
    <StatusPill tone="emerald">Public listing</StatusPill>
  ) : (
    <StatusPill tone="neutral">Internal only</StatusPill>
  );
}

async function copyPublicLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    notify.success("Artist link copied.");
  } catch {
    notify.error("Could not copy link.");
  }
}

function WorkspaceHeader({
  act,
  description,
  meta,
  children,
}: {
  act: ActSummary | null | undefined;
  description: string;
  meta?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const publicUrl = act?.publicListing ? formatBandPublicArtistUrl(act.publicSlug) : "";
  return (
    <PageHeader
      pills={act ? <ListingPill listed={act.publicListing} /> : undefined}
      title={act === undefined ? <Skeleton className="h-8 w-56" /> : (act?.name ?? "Artists")}
      description={description}
      actions={
        publicUrl ? (
          <Button asChild size="sm" variant="outline">
            <a href={publicUrl} target="_blank" rel="noreferrer">
              View public page
              <ArrowSquareOutIcon className="size-3" aria-hidden />
            </a>
          </Button>
        ) : undefined
      }
      menu={
        publicUrl ? (
          <DropdownMenuItem onSelect={() => void copyPublicLink(publicUrl)}>
            <CopyIcon />
            Copy public link
          </DropdownMenuItem>
        ) : undefined
      }
      meta={meta}
    >
      {children}
    </PageHeader>
  );
}

function WorkspaceTabs({
  tabs,
  activeTab,
  badges,
}: {
  tabs: readonly ArtistWorkspaceTabId[];
  activeTab: ArtistWorkspaceTabId;
  badges?: Partial<Record<ArtistWorkspaceTabId, React.ReactNode>>;
}) {
  return (
    <PageTabs
      label="Artist sections"
      tabs={tabs.map((tab) => ({
        href: getArtistWorkspaceTabPath(tab),
        label: ARTIST_WORKSPACE_TAB_LABELS[tab],
        icon: TAB_ICONS[tab],
        active: tab === activeTab,
        badge: badges?.[tab],
      }))}
    />
  );
}

/** An artist organization looking at its own act. */
function BandWorkspaceChrome({ activeTab }: { activeTab: ArtistWorkspaceTabId }) {
  const router = useRouter();
  const profile = useQuery(api.users.getActiveBandProfile, {});
  const members = useQuery(api.users.listMembersForActiveOrganization, {});
  const riders = useQuery(api.bandRiders.listForActiveBand, {});
  const payments = useQuery(api.bandPayments.listForActiveBand, {});

  const toSign = (payments ?? []).filter((payment) => payment.canSign).length;
  const defaultRider = riders?.find((rider) => rider.isDefault) ?? null;
  const act: ActSummary | undefined = profile
    ? {
        name: profile.displayName || profile.name,
        publicListing: profile.publicListing,
        publicSlug: profile.publicSlug,
      }
    : undefined;

  return (
    <>
      <WorkspaceHeader
        act={act}
        description="Your public profile, technical riders and payouts. Arbor staff see the same details when they book you."
        meta={
          profile ? (
            <>
              {members !== undefined ? (
                <MetaItem icon={UsersThreeIcon}>
                  {members.length} member{members.length === 1 ? "" : "s"}
                </MetaItem>
              ) : null}
              {riders !== undefined ? (
                <MetaItem
                  icon={GridFourIcon}
                  onClick={() => router.push(getArtistWorkspaceTabPath("riders"))}
                >
                  {defaultRider ? `Default rider: ${defaultRider.name}` : "No default rider"}
                </MetaItem>
              ) : null}
              <MetaItem
                icon={CurrencyDollarIcon}
                onClick={() => router.push(`${getArtistWorkspaceTabPath("payments")}#payee`)}
              >
                {profile.payeeComplete ? "Payee set up" : "Payee not set up"}
              </MetaItem>
            </>
          ) : null
        }
      />
      <WorkspaceTabs
        tabs={ARTIST_WORKSPACE_TABS}
        activeTab={activeTab}
        badges={{
          payments:
            toSign > 0 ? (
              <span
                className="inline-flex items-center gap-0.5 text-status-amber-700 dark:text-status-amber-300"
                title={`${toSign} payout${toSign === 1 ? "" : "s"} to sign`}
              >
                <WarningIcon className="size-3.5" weight="fill" aria-hidden />
                <span className="text-xs tabular-nums">{toSign}</span>
              </span>
            ) : null,
        }}
      />
    </>
  );
}

/** A portal admin editing any artist without joining it. */
function AdminWorkspaceChrome({ activeTab }: { activeTab: ArtistWorkspaceTabId }) {
  const { organizationId, setOrganizationId } = useAdminBandSelection();
  const bands = useQuery(api.users.listBandOrganizationsAdmin, { includeArchived: false });
  const options = useMemo(() => artistSelectOptions(bands), [bands]);
  const band = bands?.find((row) => row.organizationId === organizationId);
  const act: ActSummary | null | undefined =
    bands === undefined
      ? undefined
      : band
        ? {
            name: band.displayName || band.name,
            publicListing: band.publicListing,
            publicSlug: band.publicSlug,
          }
        : null;
  const tab = ADMIN_ARTIST_WORKSPACE_TABS.includes(activeTab) ? activeTab : "profile";

  return (
    <>
      <WorkspaceHeader
        act={act}
        description="Edit any artist's profile and technical riders. You don't need to join the organization."
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Managing</span>
          {bands === undefined ? (
            <Skeleton className="h-9 w-72" />
          ) : bands.length === 0 ? (
            <span className="text-muted-foreground">No artist organizations yet.</span>
          ) : (
            <div className="w-full max-w-sm" data-testid="admin-band-picker">
              <ArtistSelect
                value={organizationId ?? ""}
                onChange={setOrganizationId}
                options={options}
                placeholder="Search artists…"
                emptyLabel="No matching artists"
              />
            </div>
          )}
        </div>
      </WorkspaceHeader>
      <WorkspaceTabs tabs={ADMIN_ARTIST_WORKSPACE_TABS} activeTab={tab} />
    </>
  );
}

/**
 * The act workspace around every `/dashboard/artists` tab: one header (the
 * act, its listing, the admin's artist picker) and route tabs, like the event
 * page. Off-tab routes such as the rider editor render on their own.
 */
export function ArtistWorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAdminManaging } = useAdminBandSelection();
  const activeTab = artistWorkspaceTabFromPathname(pathname);

  if (!activeTab) return <>{children}</>;

  return (
    <div className="space-y-4" data-testid="artist-workspace">
      <BandOrAdminGuard>
        {isAdminManaging ? (
          <AdminWorkspaceChrome activeTab={activeTab} />
        ) : (
          <BandWorkspaceChrome activeTab={activeTab} />
        )}
        {children}
      </BandOrAdminGuard>
    </div>
  );
}
