"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useState, type ComponentProps } from "react"
import { authClient } from "@/lib/auth-client"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/lib/convex-api"
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
import {
  CalendarDotsIcon,
  CaretRightIcon,
  CurrencyDollarIcon,
  HouseIcon,
  UsersIcon,
  GuitarIcon,
  PackageIcon,
  LifebuoyIcon,
  PaperPlaneTiltIcon,
  MegaphoneIcon,
  ImagesIcon,
} from "@phosphor-icons/react"

type NavSubItem = {
  title: string
  url: string
  adminOnly?: boolean
}

type NavItem = {
  title: string
  url: string
  icon: typeof CalendarDotsIcon
  adminOnly?: boolean
  bandOnly?: boolean
  marketingOnly?: boolean
}

const navItems: NavItem[] = [
  { title: "Home", url: "/dashboard", icon: HouseIcon },
  { title: "Events", url: "/dashboard/events", icon: CalendarDotsIcon },
  { title: "Finances", url: "/dashboard/financial-hub", icon: CurrencyDollarIcon, adminOnly: true },
  { title: "Users", url: "/dashboard/users", icon: UsersIcon, adminOnly: true },
  {
    title: "Bands and Performers",
    url: "/dashboard/bands-and-performers",
    icon: GuitarIcon,
  },
  { title: "Media", url: "/dashboard/media", icon: ImagesIcon, bandOnly: true },
  { title: "Inventory", url: "/dashboard/inventory", icon: PackageIcon },
  { title: "Marketing", url: "/dashboard/marketing", icon: MegaphoneIcon, marketingOnly: true },
]

const inventorySubItems: NavSubItem[] = [
  { title: "Overview", url: "/dashboard/inventory" },
  { title: "Inventory Items", url: "/dashboard/inventory/items" },
  { title: "Types", url: "/dashboard/inventory/types", adminOnly: true },
  { title: "Packages", url: "/dashboard/inventory/packages" },
  { title: "Storage Locations", url: "/dashboard/inventory/storage-locations" },
  { title: "Lost & Found", url: "/dashboard/inventory/lost-found" },
  { title: "Import CSV", url: "/dashboard/inventory/import", adminOnly: true },
]

const financialHubSubItems: NavSubItem[] = [
  { title: "Overview", url: "/dashboard/financial-hub" },
  { title: "Invoices", url: "/dashboard/financial-hub/invoices" },
  { title: "Payments", url: "/dashboard/financial-hub/payments" },
  { title: "Band Payouts", url: "/dashboard/financial-hub/band-payouts" },
  { title: "Crew Timecards", url: "/dashboard/timecards" },
  { title: "My Timecards", url: "/dashboard/timecards/mine" },
  { title: "Host Organizations", url: "/dashboard/financial-hub/organizations" },
  { title: "Managers", url: "/dashboard/financial-hub/managers" },
  { title: "Create Invoice", url: "/dashboard/financial-hub/invoices/new" },
]

const eventsSubItems: NavSubItem[] = [
  { title: "Overview", url: "/dashboard/events" },
  { title: "Booking Requests", url: "/dashboard/events/requests" },
  { title: "Venues", url: "/dashboard/events/venues", adminOnly: true },
  { title: "Open Mic", url: "/dashboard/events/open-mic", adminOnly: true },
  { title: "Crew Scheduling", url: "/dashboard/events/crew-scheduling", adminOnly: true },
  { title: "My Availability", url: "/dashboard/events/my-availability" },
  { title: "My Timecards", url: "/dashboard/timecards/mine" },
  { title: "Create Event", url: "/dashboard/events/new", adminOnly: true },
]

const usersSubItems: NavSubItem[] = [
  { title: "Overview", url: "/dashboard/users" },
  { title: "Access & Invites", url: "/dashboard/users/access" },
  { title: "Organizations", url: "/dashboard/users/organizations" },
  { title: "Crew Rates", url: "/dashboard/users/crew-rates" },
]

const marketingSubItems: NavSubItem[] = [
  { title: "Design board", url: "/dashboard/marketing/designs" },
  { title: "Work & stories", url: "/dashboard/marketing/work" },
  { title: "Settings", url: "/dashboard/marketing/settings" },
]

const sectionSubItems: Record<string, NavSubItem[]> = {
  "/dashboard/events": eventsSubItems,
  "/dashboard/financial-hub": financialHubSubItems,
  "/dashboard/inventory": inventorySubItems,
  "/dashboard/users": usersSubItems,
  "/dashboard/marketing": marketingSubItems,
}

function visibleSubItems(
  subItems: NavSubItem[] | undefined,
  access: { isAdmin: boolean; hasOperationsAccess: boolean },
) {
  if (!subItems) return undefined
  return subItems.filter(
    (subItem) => access.isAdmin || access.hasOperationsAccess || !subItem.adminOnly,
  )
}

function canAccessNavItem(
  item: NavItem,
  access: {
    isAdmin: boolean
    hasOperationsAccess: boolean
    hasMarketingAccess: boolean
    isBandContext: boolean
    isCrewContext: boolean
    isAdminHomeContext: boolean
  },
) {
  if (access.isBandContext) {
    if (item.bandOnly) return true
    return (
      item.url !== "/dashboard/events" &&
      item.url !== "/dashboard/financial-hub" &&
      item.url !== "/dashboard/inventory" &&
      item.url !== "/dashboard/users" &&
      item.url !== "/dashboard/marketing" &&
      item.url !== "/dashboard"
    )
  }
  if (item.bandOnly) return false
  if (item.url === "/dashboard" && !access.isCrewContext && !access.isAdminHomeContext) return false
  if (access.isAdmin) return true
  if (item.adminOnly && !access.hasOperationsAccess) return false
  if (item.marketingOnly && !access.hasMarketingAccess) return false
  return true
}

const secondaryItems = [
  { title: "Support", url: "#", icon: <LifebuoyIcon /> },
  { title: "Feedback", url: "#", icon: <PaperPlaneTiltIcon /> },
]

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const { data } = authClient.useSession()
  const [now] = useState(() => Date.now())
  const [adminSchedulingRange] = useState(() => getDefaultAdminSchedulingRange())
  const viewer = useQuery(api.users.getViewer, {})
  const account = useQuery(api.account.getMyAccount, {})
  const activeOrganization = useQuery(api.users.getActiveOrganization, {})
  const myOrganizations = useQuery(api.users.listMyOrganizations, {})
  const setActiveOrganization = useMutation(api.users.setActiveOrganization)
  const isAdmin = viewer?.isAdmin ?? false
  const viewerVerticals = viewer?.verticals ?? []
  const hasOperationsAccess = isAdmin || viewerVerticals.includes("Operations")
  const hasMarketingAccess = isAdmin || viewerVerticals.includes("Marketing")
  const hasCrewAccess =
    isAdmin ||
    viewerVerticals.includes("Crew") ||
    viewerVerticals.includes("Trivia") ||
    viewerVerticals.length === 0
  const pendingAvailabilityCount = useQuery(
    api.eventCrewAvailability.getMyPendingAvailabilityCount,
    activeOrganization?.organizationType === "arbor_internal" ? { now } : "skip",
  )
  const unconfirmedCrewCount = useQuery(
    api.eventCrewAvailability.listForAdminOverview,
    activeOrganization?.organizationType === "arbor_internal" && isAdmin
      ? {
          rangeStart: adminSchedulingRange.rangeStart,
          rangeEnd: adminSchedulingRange.rangeEnd,
          unconfirmedOnly: true,
        }
      : "skip",
  )

  const userName = data?.user?.name ?? "Unknown user"
  const userEmail = data?.user?.email ?? "No email"
  const orgName = activeOrganization?.name ?? "No active org"
  const isBandContext = activeOrganization?.organizationType === "band"
  const isCrewContext =
    activeOrganization?.organizationType === "arbor_internal" &&
    hasCrewAccess &&
    !hasOperationsAccess &&
    !isAdmin
  const isAdminHomeContext =
    activeOrganization?.organizationType === "arbor_internal" &&
    (isAdmin || hasOperationsAccess)
  const navAccess = {
    isAdmin,
    hasOperationsAccess,
    hasMarketingAccess,
    isBandContext,
    isCrewContext,
    isAdminHomeContext,
  }
  const unconfirmedEventCount = unconfirmedCrewCount?.length ?? 0
  const scopedNavItems = navItems.filter((item) => canAccessNavItem(item, navAccess))
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})

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
              void setActiveOrganization({ organizationId: value })
            }}
            disabled={!myOrganizations?.length || !activeOrganization?.organizationId}
          >
            <SelectTrigger className="w-full bg-background">
              <SelectValue placeholder="Select active organization" />
            </SelectTrigger>
            <SelectContent>
              {(myOrganizations ?? []).map((org) => (
                <SelectItem key={org.organizationId} value={org.organizationId}>
                  {org.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {org.organizationType === "arbor_internal" ? "Arbor Internal" : "Band"}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {scopedNavItems.map((item) => {
            const Icon = item.icon
            const subItems = visibleSubItems(sectionSubItems[item.url], {
              isAdmin,
              hasOperationsAccess,
            })?.filter(
              (subItem) =>
                !(
                  isAdmin &&
                  item.url === "/dashboard/events" &&
                  subItem.url === "/dashboard/timecards/mine"
                ),
            )
            const hasCollapsibleSubItems = Boolean(subItems && subItems.length > 1)
            const isParentActive =
              pathname === item.url ||
              pathname.startsWith(`${item.url}/`) ||
              (item.url === "/dashboard/financial-hub" &&
                pathname.startsWith("/dashboard/timecards"))
            return (
              <Collapsible
                key={item.url}
                asChild
                open={
                  hasCollapsibleSubItems
                    ? isParentActive || (openSections[item.url] ?? false)
                    : true
                }
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
                          {subItems?.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.url}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname === subItem.url ||
                                  (subItem.url !== item.url &&
                                    pathname.startsWith(`${subItem.url}/`))
                                }
                              >
                                <Link href={subItem.url}>
                                  <span>{subItem.title}</span>
                                  {subItem.url === "/dashboard/events/my-availability" &&
                                  pendingAvailabilityCount &&
                                  pendingAvailabilityCount > 0 ? (
                                    <span className="ml-auto rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                      {pendingAvailabilityCount}
                                    </span>
                                  ) : null}
                                  {subItem.url === "/dashboard/events/crew-scheduling" &&
                                  unconfirmedEventCount > 0 ? (
                                    <span className="ml-auto rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                      {unconfirmedEventCount}
                                    </span>
                                  ) : null}
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </>
                  ) : (
                    <SidebarMenuButton asChild isActive={isParentActive} className="text-sm">
                      <Link href={item.url}>
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
        <NavSecondary items={secondaryItems} className="mt-auto" />
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
            await authClient.signOut()
            window.location.href = "/sign-in"
          }}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
