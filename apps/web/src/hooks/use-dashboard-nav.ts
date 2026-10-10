"use client"

import { isArtistOrganizationType } from "@/lib/artist-types"
import { navItems, sectionSubItems, type NavItem, type NavSubItem } from "@/lib/nav"
import { useSessionShell } from "@/components/session-shell-provider"
import { useViewMode } from "@/components/view-mode-provider"

type NavAccess = {
  isAdmin: boolean
  hasOperationsAccess: boolean
  hasMarketingAccess: boolean
  isBandContext: boolean
  isCrewContext: boolean
  isAdminHomeContext: boolean
}

export type DashboardNavSection = {
  item: NavItem
  /** Sub-pages this viewer may open, with staff labels applied. */
  subItems: NavSubItem[]
}

function canAccessNavItem(item: NavItem, access: NavAccess) {
  if (access.isBandContext) {
    // Band orgs keep Home and their own act (profile / riders / payments) even
    // though the Artists section is admin-facing for Arbor Live, plus the band
    // tools. Everything else is staff-facing — including adminOnly items like
    // Camera, which the old fallback here accidentally let through.
    return item.bandOnly || item.url === "/dashboard" || item.url === "/dashboard/artists"
  }
  if (item.bandOnly) return false
  if (item.url === "/dashboard" && !access.isCrewContext && !access.isAdminHomeContext) return false
  // Every Arbor staff member gets the directory here; the act workspace inside
  // it stays admin-only (see the sub-item filter).
  if (item.url === "/dashboard/artists") return true
  if (access.isAdmin) return true
  if (item.adminOnly) return false
  if (item.opsOnly && !access.hasOperationsAccess) return false
  if (item.marketingOnly && !access.hasMarketingAccess) return false
  return true
}

function visibleSubItems(item: NavItem, access: NavAccess): NavSubItem[] {
  return (sectionSubItems[item.url] ?? [])
    .filter(
      (subItem) =>
        access.isAdmin ||
        (!subItem.adminOnly && (!subItem.opsOnly || access.hasOperationsAccess)),
    )
    .filter(
      (subItem) =>
        !(
          (access.isAdmin || access.hasOperationsAccess) &&
          item.url === "/dashboard/events" &&
          subItem.url === "/dashboard/timecards/mine"
        ) &&
        !(
          !access.isBandContext &&
          item.url === "/dashboard/artists" &&
          (subItem.url === "/dashboard/artists/payments" ||
            subItem.url === "/dashboard/artists/team")
        ) &&
        !(access.isBandContext && subItem.staffOnly) &&
        // The act workspace is for portal admins, not every staff member
        // who sees the section for the directory.
        !(
          !access.isBandContext &&
          !access.isAdmin &&
          item.url === "/dashboard/artists" &&
          subItem.actWorkspace
        ),
    )
    .map((subItem) =>
      !access.isBandContext && subItem.staffTitle ? { ...subItem, title: subItem.staffTitle } : subItem,
    )
}

/**
 * The dashboard pages this viewer can reach, as the sidebar shows them. Crew
 * mode narrows an admin to what crew sees. Shared by the sidebar and the ⌘K
 * palette so the two never disagree.
 */
export function useDashboardNav() {
  const shell = useSessionShell()
  const { viewMode } = useViewMode()
  const viewer = shell?.viewer
  const activeOrganization = shell?.activeOrganization
  const isAdmin = viewer?.isAdmin ?? false
  const viewerVerticals = viewer?.verticals ?? []
  const hasOperationsAccess = isAdmin || viewerVerticals.includes("Operations")
  const hasMarketingAccess = isAdmin || viewerVerticals.includes("Marketing")
  const hasCrewAccess =
    isAdmin ||
    viewerVerticals.includes("Crew") ||
    viewerVerticals.includes("Trivia") ||
    viewerVerticals.length === 0
  const isArborContext = activeOrganization?.organizationType === "arbor_internal"
  // Crew mode hides ops/admin surfaces so an admin sees the portal the way crew does.
  const inCrewMode = viewMode === "crew" && isAdmin && isArborContext
  const effectiveIsAdmin = isAdmin && !inCrewMode
  const effectiveHasOperationsAccess = inCrewMode ? false : hasOperationsAccess
  const effectiveHasMarketingAccess = inCrewMode ? false : hasMarketingAccess
  const isBandContext = isArtistOrganizationType(activeOrganization?.organizationType)
  const access: NavAccess = {
    isAdmin: effectiveIsAdmin,
    hasOperationsAccess: effectiveHasOperationsAccess,
    hasMarketingAccess: effectiveHasMarketingAccess,
    isBandContext,
    isCrewContext:
      isArborContext && hasCrewAccess && !effectiveHasOperationsAccess && !effectiveIsAdmin,
    isAdminHomeContext: isArborContext && (effectiveIsAdmin || effectiveHasOperationsAccess),
  }
  const sections: DashboardNavSection[] = navItems
    .filter((item) => canAccessNavItem(item, access))
    .map((item) => ({
      // An artist sees its own act there, not the admin's list of artists.
      item: isBandContext && item.url === "/dashboard/artists" ? { ...item, title: "Your act" } : item,
      subItems: visibleSubItems(item, access),
    }))

  return {
    sections,
    isAdmin,
    inCrewMode,
    isArborContext,
    isBandContext,
    effectiveIsAdmin,
    effectiveHasOperationsAccess,
  }
}
