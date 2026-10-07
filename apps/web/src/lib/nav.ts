import {
  CalendarDotsIcon,
  CurrencyDollarIcon,
  GuitarIcon,
  HouseIcon,
  ImagesIcon,
  MegaphoneIcon,
  MusicNotesIcon,
  PackageIcon,
  UsersIcon,
  VideoCameraIcon,
  type Icon,
} from "@phosphor-icons/react";

export type NavSubItem = {
  title: string;
  url: string;
  /** Portal admins only. */
  adminOnly?: boolean;
  /** Arbor staff only: hidden from artists viewing their own act. */
  staffOnly?: boolean;
  /** The act workspace: artists and admins, not other Arbor staff. */
  actWorkspace?: boolean;
  /** Operations team and admins (not crew). */
  opsOnly?: boolean;
  /** Label for Arbor staff when it differs from the artist's own ("Edit artist profile" vs "Profile"). */
  staffTitle?: string;
};

export type NavItem = {
  title: string;
  url: string;
  icon: Icon;
  /** Portal admins only. */
  adminOnly?: boolean;
  /** Operations team and admins (not crew). */
  opsOnly?: boolean;
  bandOnly?: boolean;
  marketingOnly?: boolean;
};

export const navItems: NavItem[] = [
  { title: "Home", url: "/dashboard", icon: HouseIcon },
  { title: "Events", url: "/dashboard/events", icon: CalendarDotsIcon },
  { title: "Ops Center", url: "/dashboard/financial-hub", icon: CurrencyDollarIcon, opsOnly: true },
  { title: "Users", url: "/dashboard/users", icon: UsersIcon, adminOnly: true },
  {
    title: "Artists",
    url: "/dashboard/artists",
    icon: GuitarIcon,
  },
  { title: "Opportunities", url: "/dashboard/opportunities", icon: MusicNotesIcon, bandOnly: true },
  { title: "Media", url: "/dashboard/media", icon: ImagesIcon, bandOnly: true },
  { title: "Inventory", url: "/dashboard/inventory", icon: PackageIcon },
  { title: "Marketing", url: "/dashboard/marketing", icon: MegaphoneIcon, marketingOnly: true },
  { title: "Camera", url: "/dashboard/camera", icon: VideoCameraIcon, adminOnly: true },
];

const inventorySubItems: NavSubItem[] = [
  { title: "Inventory items", url: "/dashboard/inventory/items" },
  { title: "Borrow requests", url: "/dashboard/inventory/borrow-requests" },
  { title: "Damage & repair", url: "/dashboard/inventory/damage" },
  { title: "Types", url: "/dashboard/inventory/types", adminOnly: true },
  { title: "Packages", url: "/dashboard/inventory/packages" },
  { title: "Storage locations", url: "/dashboard/inventory/storage-locations" },
  { title: "Lost & found", url: "/dashboard/inventory/lost-found" },
  { title: "Print queue", url: "/dashboard/inventory/print-queue", adminOnly: true },
  { title: "Import CSV", url: "/dashboard/inventory/import", adminOnly: true },
];

const financialHubSubItems: NavSubItem[] = [
  { title: "Overview", url: "/dashboard/financial-hub" },
  { title: "Insights", url: "/dashboard/financial-hub/insights" },
  { title: "Booking requests", url: "/dashboard/financial-hub/requests" },
  { title: "Invoices", url: "/dashboard/financial-hub/invoices" },
  { title: "Artist payouts", url: "/dashboard/financial-hub/artist-payouts" },
  { title: "GrantED ledger", url: "/dashboard/financial-hub/granted" },
  { title: "Crew timecards", url: "/dashboard/timecards", adminOnly: true },
  { title: "My timecards", url: "/dashboard/timecards/mine" },
  { title: "Billing hosts", url: "/dashboard/financial-hub/organizations" },
  { title: "Create invoice", url: "/dashboard/financial-hub/invoices/new" },
  { title: "Settings", url: "/dashboard/financial-hub/settings", adminOnly: true },
];

const eventsSubItems: NavSubItem[] = [
  { title: "Overview", url: "/dashboard/events" },
  { title: "Venues", url: "/dashboard/events/venues", opsOnly: true },
  { title: "Open mic", url: "/dashboard/events/open-mic" },
  { title: "Crew scheduling", url: "/dashboard/events/crew-scheduling", opsOnly: true },
  { title: "My availability", url: "/dashboard/events/my-availability" },
  { title: "My post-event work", url: "/dashboard/events/post-event" },
  { title: "My timecards", url: "/dashboard/timecards/mine" },
  { title: "Create event", url: "/dashboard/events/new", opsOnly: true },
];

const usersSubItems: NavSubItem[] = [
  { title: "People", url: "/dashboard/users" },
  { title: "Invitations", url: "/dashboard/users/invitations" },
  { title: "Organizations", url: "/dashboard/users/organizations" },
  { title: "Crew applications", url: "/dashboard/users/crew-applications", adminOnly: true },
  { title: "Crew rates", url: "/dashboard/users/crew-rates" },
];

const marketingSubItems: NavSubItem[] = [
  { title: "Design board", url: "/dashboard/marketing/designs" },
  { title: "Work & stories", url: "/dashboard/marketing/work" },
  { title: "Short links", url: "/dashboard/marketing/links" },
  { title: "Settings", url: "/dashboard/marketing/settings" },
];

// Staff see the booking work first (open positions, who to contact, new acts),
// then editing one act. An artist sees only its own act: Profile, Team,
// Technical riders, Payments.
const bandsSubItems: NavSubItem[] = [
  { title: "Open positions", url: "/dashboard/artists/positions", staffOnly: true, opsOnly: true },
  { title: "Directory", url: "/dashboard/artists/directory", staffOnly: true },
  { title: "Artist applications", url: "/dashboard/users/artist-applications", opsOnly: true },
  { title: "Profile", staffTitle: "Edit artist profile", url: "/dashboard/artists", actWorkspace: true },
  { title: "Team", url: "/dashboard/artists/team", actWorkspace: true },
  { title: "Technical riders", staffTitle: "Edit artist riders", url: "/dashboard/artists/riders", actWorkspace: true },
  { title: "Payments", url: "/dashboard/artists/payments", actWorkspace: true },
];

export const sectionSubItems: Record<string, NavSubItem[]> = {
  "/dashboard/events": eventsSubItems,
  "/dashboard/financial-hub": financialHubSubItems,
  "/dashboard/inventory": inventorySubItems,
  "/dashboard/users": usersSubItems,
  "/dashboard/marketing": marketingSubItems,
  "/dashboard/artists": bandsSubItems,
};

function matchesPath(prefix: string, pathname: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * The top-bar label for a path: "Events / Venues", with the same labels the
 * sidebar renders (including the band / staff variants). Falls back to
 * "Dashboard" for paths that aren't in the nav.
 */
export function sectionLabelForPath(
  pathname: string,
  { isBandContext = false }: { isBandContext?: boolean } = {},
): string {
  const section = navItems
    .filter((item) =>
      // Home is the dashboard root itself — every page starts with /dashboard.
      item.url === "/dashboard"
        ? pathname === item.url
        : matchesPath(item.url, pathname) ||
          // Like the sidebar's active section: the timecards pages hang off Ops Center.
          (item.url === "/dashboard/financial-hub" && pathname.startsWith("/dashboard/timecards")),
    )
    .sort((a, b) => b.url.length - a.url.length)[0];
  if (!section) return "Dashboard";

  const sectionTitle = isBandContext && section.url === "/dashboard/artists" ? "Your act" : section.title;

  const subItem = (sectionSubItems[section.url] ?? [])
    .filter(
      (item) =>
        // An overview entry (same URL as the section) is the section page, not
        // the sub-page of everything underneath it.
        pathname === item.url || (item.url !== section.url && matchesPath(item.url, pathname)),
    )
    .sort((a, b) => b.url.length - a.url.length)[0];
  if (!subItem) return sectionTitle;

  const subItemTitle = !isBandContext && subItem.staffTitle ? subItem.staffTitle : subItem.title;
  return `${sectionTitle} / ${subItemTitle}`;
}
