"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useState, type ComponentProps } from "react"
import { authClient } from "@/lib/auth-client"
import { releasePushSubscription } from "@/lib/pwa"
import { useMutation, useQuery } from "convex/react"
import { useNow } from "@/lib/use-now"
import { api } from "@/lib/convex-api"
import { getConvexErrorMessage } from "@/lib/convex-error"
import { notify } from "@/lib/notify"
import { useSessionShell } from "@/components/session-shell-provider"
import { useViewMode } from "@/components/view-mode-provider"
import { useDashboardNav } from "@/hooks/use-dashboard-nav"
import { getDefaultAdminSchedulingRange } from "@/lib/crew-availability"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { NavSecondary } from "@/components/nav-secondary"
import { InstallAppSidebarButton } from "@/components/notifications/install-app-sidebar-button"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { CaretRightIcon, LifebuoyIcon } from "@phosphor-icons/react"

const secondaryItems = [
  { title: "Support", url: "mailto:arborlive@stanford.edu", icon: <LifebuoyIcon /> },
]

function PendingCountChip({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="ml-auto rounded-full bg-status-amber-500/15 px-1.5 py-0.5 text-3xs font-medium text-status-amber-700 dark:text-status-amber-200">
      {count}
    </span>
  )
}

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const router = useRouter()
  // Refreshed so time-based badges (a trainee's training just ended) catch up.
  const now = useNow(5 * 60_000)
  const [adminSchedulingRange] = useState(() => getDefaultAdminSchedulingRange())
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const shell = useSessionShell()
  const setActiveOrganization = useMutation(api.users.setActiveOrganization)
  const unsubscribePush = useMutation(api.pushSubscriptions.unsubscribe)
  const { setViewMode } = useViewMode()
  const {
    sections,
    isAdmin,
    inCrewMode,
    isBandContext,
    effectiveIsAdmin,
    effectiveHasOperationsAccess,
  } = useDashboardNav()
  const account = shell?.account
  const activeOrganization = shell?.activeOrganization
  const myOrganizations = shell?.organizations
  // Unconfirmed-crew badge fans out events × shifts — only subscribe on routes
  // where that count is actionable (scheduling board / home), not every page.
  const includeUnconfirmedCrew =
    effectiveHasOperationsAccess &&
    (pathname === "/dashboard" || pathname.startsWith("/dashboard/events/crew-scheduling"))
  // Post-event work counts fan out over the user's ended events — subscribe
  // only where the chip is actionable (home + event routes), not every page.
  const includeMyEventActions =
    activeOrganization?.organizationType === "arbor_internal" &&
    (pathname === "/dashboard" || pathname.startsWith("/dashboard/events"))
  const navBadges = useQuery(
    api.navBadges.getNavBadges,
    shell
      ? {
          now,
          rangeStart: adminSchedulingRange.rangeStart,
          rangeEnd: adminSchedulingRange.rangeEnd,
          includeArborInternal: activeOrganization?.organizationType === "arbor_internal",
          includeAdmin: effectiveIsAdmin,
          includeOperations: effectiveHasOperationsAccess,
          includeBand: isBandContext,
          includeUnconfirmedCrew,
          includeMyEventActions,
        }
      : "skip",
  )
  const pendingAvailabilityCount = navBadges?.pendingAvailability
  const pendingBookingRequestsCount = navBadges?.pendingBookingRequests
  const pendingBandApplicationsCount = navBadges?.pendingBandApplications
  const pendingCrewApplicationsCount = navBadges?.pendingCrewApplications
  const pendingDamageReportsCount = navBadges?.pendingDamageReports
  const unconfirmedCrewCount = navBadges?.unconfirmedCrew
  const pendingBandPaymentActionsCount = navBadges?.pendingBandPaymentActions
  const quoteChangesRequestedCount = navBadges?.quoteChangesRequested
  const pendingEquipmentBorrowRequestsCount = navBadges?.pendingEquipmentBorrowRequests
  const pendingPostEventWorkCount = navBadges?.pendingPostEventWork
  const artistPayoutActionsCount = navBadges?.artistPayoutActions

  const userName = account?.name ?? "Unknown user"
  const userEmail = account?.email ?? "No email"
  const orgName = activeOrganization?.name ?? "No active org"
  const unconfirmedEventCount = unconfirmedCrewCount ?? 0

  function pendingChipCountForUrl(url: string): number {
    switch (url) {
      case "/dashboard/events/my-availability":
        return pendingAvailabilityCount ?? 0
      case "/dashboard/events/post-event":
        return pendingPostEventWorkCount ?? 0
      case "/dashboard/ops-center/requests":
        return pendingBookingRequestsCount ?? 0
      case "/dashboard/events/crew-scheduling":
        return unconfirmedEventCount
      case "/dashboard/users/artist-applications":
        return pendingBandApplicationsCount ?? 0
      case "/dashboard/users/crew-applications":
        return pendingCrewApplicationsCount ?? 0
      case "/dashboard/inventory/damage":
        return pendingDamageReportsCount ?? 0
      case "/dashboard/inventory/borrow-requests":
        return pendingEquipmentBorrowRequestsCount ?? 0
      case "/dashboard/artists/payments":
        return pendingBandPaymentActionsCount ?? 0
      case "/dashboard/ops-center/invoices":
        return quoteChangesRequestedCount ?? 0
      case "/dashboard/ops-center/artist-payouts":
        return artistPayoutActionsCount ?? 0
      default:
        return 0
    }
  }

  async function handleChangeOrganization(organizationId: string) {
    try {
      await setActiveOrganization({ organizationId })
    } catch (error) {
      notify.error(getConvexErrorMessage(error))
    }
  }

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader className="relative z-20 shrink-0">
        <div className="px-2 py-2">
          <Link href="/dashboard" className="flex items-center">
            <Image
              src="/logo.svg"
              alt="Arbor Live logo"
              width={1014}
              height={463}
              className="h-10 w-auto brightness-0 dark:invert"
              priority
            />
          </Link>
        </div>
        <div className="relative z-20 px-2 pb-2">
          <p className="mb-1 text-xs text-muted-foreground">Active organization</p>
          <Select
            value={activeOrganization?.organizationId}
            onValueChange={(value) => {
              void handleChangeOrganization(value)
            }}
            disabled={!myOrganizations?.length || !activeOrganization?.organizationId}
          >
            <SelectTrigger className="w-full min-w-0 bg-background [&>span]:min-w-0 [&>span]:truncate">
              <SelectValue placeholder="Select active organization" />
            </SelectTrigger>
            <SelectContent>
              {(myOrganizations ?? []).map((org) => (
                <SelectItem key={org.organizationId} value={org.organizationId} className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{org.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {org.organizationType === "arbor_internal"
                        ? "Arbor Internal"
                        : org.isAdminPreview
                          ? "Artist · preview"
                          : "Artist"}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {sections.map(({ item, subItems }) => {
            const Icon = item.icon
            const activeSubItemUrl = subItems
              .filter(
                (subItem) =>
                  pathname === subItem.url || pathname.startsWith(`${subItem.url}/`),
              )
              .sort((a, b) => b.url.length - a.url.length)[0]?.url
            const hasCollapsibleSubItems = subItems.length > 1
            const isParentActive =
              pathname === item.url ||
              pathname.startsWith(`${item.url}/`) ||
              (item.url === "/dashboard/ops-center" &&
                pathname.startsWith("/dashboard/timecards"))
            const sectionOpen = hasCollapsibleSubItems
              ? isParentActive || (openSections[item.url] ?? false)
              : true
            const parentPendingCount = subItems.reduce(
              (sum, subItem) => sum + pendingChipCountForUrl(subItem.url),
              0,
            )
  return (
              <Collapsible
                key={item.url}
                asChild
                open={sectionOpen}
                onOpenChange={(isOpen) => {
                  if (!hasCollapsibleSubItems) return
                  // Avoid no-op state updates, which can cause update loops in controlled collapsibles.
                  setOpenSections((prev) => {
                    if (prev[item.url] === isOpen) return prev
                    return { ...prev, [item.url]: isOpen }
                  })
                }}
              >
                <SidebarMenuItem>
                  {hasCollapsibleSubItems ? (
                    <>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton isActive={isParentActive} className="text-sm">
                          <Icon />
                          <span>{item.title}</span>
                          {!sectionOpen ? <PendingCountChip count={parentPendingCount} /> : null}
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuAction
                          className="data-[state=open]:rotate-90"
                          aria-label={`Toggle ${item.title}`}
                        >
                          <CaretRightIcon />
                        </SidebarMenuAction>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {subItems.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.url}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={subItem.url === activeSubItemUrl}
                              >
                                <Link href={subItem.url}>
                                  <span>{subItem.title}</span>
                                  <PendingCountChip count={pendingChipCountForUrl(subItem.url)} />
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </>
                  ) : (
                    <SidebarMenuButton asChild isActive={isParentActive} className="text-sm">
                      {/* A section with one page (Artists for crew: the directory) links straight to it. */}
                      <Link href={subItems.length === 1 ? subItems[0].url : item.url}>
                        <Icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              </Collapsible>
            )
          })}
        </SidebarMenu>
        <div className="mt-auto">
          <InstallAppSidebarButton />
          <NavSecondary items={secondaryItems} />
        </div>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <NavUser
          user={{
            name: userName,
            email: userEmail,
            organization: orgName,
            avatarUrl: account?.avatarUrl ?? account?.image ?? null,
          }}
          onSignOut={async () => {
            // Stop this device getting the account's pushes before the session ends.
            await releasePushSubscription((endpoint) => unsubscribePush({ endpoint }))
            await authClient.signOut()
            window.location.href = "/sign-in"
          }}
          crewMode={
            isAdmin && activeOrganization?.organizationType === "arbor_internal"
              ? {
                  isCrewMode: inCrewMode,
                  onToggle: () => {
                    const next = inCrewMode ? "default" : "crew"
                    setViewMode(next)
                    if (next === "crew" && pathname !== "/dashboard") {
                      router.push("/dashboard")
                    }
                  },
                }
              : undefined
          }
        />
      </SidebarFooter>
    </Sidebar>
  )
}
