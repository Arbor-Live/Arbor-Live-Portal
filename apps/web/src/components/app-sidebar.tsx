"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import type { ComponentProps } from "react"
import { authClient } from "@/lib/auth-client"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import {
  CalendarDotsIcon,
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

const secondaryItems = [
  { title: "Support", url: "#", icon: <LifebuoyIcon /> },
  { title: "Feedback", url: "#", icon: <PaperPlaneTiltIcon /> },
]

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const { data } = authClient.useSession()

  const userName = data?.user?.name ?? "Unknown user"
  const userEmail = data?.user?.email ?? "No email"
  const orgName = "Arbor Live"

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
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
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.url || (item.url === "/dashboard/inventory" && pathname.startsWith("/dashboard/inventory/"))}
                  className="text-sm"
                >
                  <Link href={item.url}>
                    <Icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
                {item.url === "/dashboard/inventory" ? (
                  <SidebarMenuSub>
                    {inventorySubItems.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.url}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={
                            pathname === subItem.url ||
                            (subItem.url !== "/dashboard/inventory" &&
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
                ) : null}
              </SidebarMenuItem>
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
