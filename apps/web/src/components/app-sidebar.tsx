"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useState, type ComponentProps } from "react"
import { authClient } from "@/lib/auth-client"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/lib/convex-api"
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
  UsersIcon,
  GuitarIcon,
  PackageIcon,
  LifebuoyIcon,
  PaperPlaneTiltIcon,
} from "@phosphor-icons/react"

const navItems = [
  { title: "Events", url: "/dashboard/events", icon: CalendarDotsIcon },
  { title: "Financial Hub", url: "/dashboard/financial-hub", icon: CurrencyDollarIcon },
  { title: "Users", url: "/dashboard/users", icon: UsersIcon },
  {
    title: "Bands and Performers",
    url: "/dashboard/bands-and-performers",
    icon: GuitarIcon,
  },
  { title: "Inventory", url: "/dashboard/inventory", icon: PackageIcon },
]

const inventorySubItems = [
  { title: "Overview", url: "/dashboard/inventory" },
  { title: "Inventory Items", url: "/dashboard/inventory/items" },
  { title: "Types", url: "/dashboard/inventory/types" },
  { title: "Packages", url: "/dashboard/inventory/packages" },
  { title: "Storage Locations", url: "/dashboard/inventory/storage-locations" },
  { title: "Lost & Found", url: "/dashboard/inventory/lost-found" },
  { title: "Import CSV", url: "/dashboard/inventory/import" },
]

const financialHubSubItems = [
  { title: "Overview", url: "/dashboard/financial-hub" },
  { title: "Invoices", url: "/dashboard/financial-hub/invoices" },
  { title: "Create Invoice", url: "/dashboard/financial-hub/invoices/new" },
]

const eventsSubItems = [
  { title: "Overview", url: "/dashboard/events" },
  { title: "Create Event", url: "/dashboard/events/new" },
]

const usersSubItems = [
  { title: "Overview", url: "/dashboard/users" },
  { title: "Access & Invites", url: "/dashboard/users/access" },
  { title: "Organizations", url: "/dashboard/users/organizations" },
  { title: "Crew Rates", url: "/dashboard/users/crew-rates" },
]

const sectionSubItems: Record<string, { title: string; url: string }[]> = {
  "/dashboard/events": eventsSubItems,
  "/dashboard/financial-hub": financialHubSubItems,
  "/dashboard/inventory": inventorySubItems,
  "/dashboard/users": usersSubItems,
}

const secondaryItems = [
  { title: "Support", url: "#", icon: <LifebuoyIcon /> },
  { title: "Feedback", url: "#", icon: <PaperPlaneTiltIcon /> },
]

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const { data } = authClient.useSession()
  const activeOrganization = useQuery(api.users.getActiveOrganization, {})
  const myOrganizations = useQuery(api.users.listMyOrganizations, {})
  const setActiveOrganization = useMutation(api.users.setActiveOrganization)

  const userName = data?.user?.name ?? "Unknown user"
  const userEmail = data?.user?.email ?? "No email"
  const orgName = activeOrganization?.name ?? "No active org"
  const isBandContext = activeOrganization?.organizationType === "band"
  const scopedNavItems = navItems.filter((item) =>
    isBandContext
      ? item.url !== "/dashboard/events" &&
        item.url !== "/dashboard/financial-hub" &&
        item.url !== "/dashboard/inventory" &&
        item.url !== "/dashboard/users"
      : true,
  )
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader className="relative z-20 shrink-0">
        <div className="px-2 py-2">
          <Link href="/dashboard/events" className="flex items-center">
            <Image
              src="/logo.svg"
              alt="Arbor Live logo"
              width={100}
              height={20}
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
            const subItems = sectionSubItems[item.url]
            const hasCollapsibleSubItems = Boolean(subItems && subItems.length > 1)
            const isParentActive =
              pathname === item.url || pathname.startsWith(`${item.url}/`)
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
