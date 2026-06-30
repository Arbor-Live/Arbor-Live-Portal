"use client"

import Link from "next/link"
import { UserAvatar } from "@/components/account/user-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/components/theme-provider"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  CaretUpDownIcon,
  CheckCircleIcon,
  MoonIcon,
  SignOutIcon,
} from "@phosphor-icons/react"

export function NavUser({
  user,
  onSignOut,
}: {
  user: {
    name: string
    email: string
    organization: string
    avatarUrl?: string | null
  }
  onSignOut: () => Promise<void> | void
}) {
  const { isMobile } = useSidebar()
  const { theme, setTheme } = useTheme()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="h-14 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="size-10 shrink-0 overflow-hidden rounded-lg">
                <UserAvatar
                  name={user.name}
                  email={user.email}
                  imageUrl={user.avatarUrl}
                  size="default"
                  pixelSize={32}
                />
              </div>
              <div className="grid flex-1 text-left text-base leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-sm text-muted-foreground">{user.email}</span>
              </div>
              <CaretUpDownIcon className="ml-auto size-5" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <div className="size-12 overflow-hidden rounded-lg">
                  <UserAvatar
                    name={user.name}
                    email={user.email}
                    imageUrl={user.avatarUrl}
                    size="lg"
                    pixelSize={48}
                  />
                </div>
                <div className="grid flex-1 text-left text-base leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-sm text-muted-foreground">{user.email}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    {user.organization}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/account">
                  <CheckCircleIcon />
                  Account settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault()
                  setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")
                }}
              >
                <MoonIcon />
                Theme: {theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={async (event) => {
                event.preventDefault()
                await onSignOut()
              }}
            >
              <SignOutIcon
              />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
