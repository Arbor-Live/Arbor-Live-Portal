/**
 * Tabs of the act workspace (`/dashboard/artists/*`): the artist's own
 * profile, technical riders and payments. Admins managing an artist get the
 * tabs that work without membership (profile and riders).
 */
export const ARTIST_WORKSPACE_TABS = ["profile", "riders", "payments"] as const;

export type ArtistWorkspaceTabId = (typeof ARTIST_WORKSPACE_TABS)[number];

export const ARTIST_WORKSPACE_TAB_LABELS: Record<ArtistWorkspaceTabId, string> = {
  profile: "Profile",
  riders: "Technical riders",
  payments: "Payments",
};

/** Tabs an admin sees while managing an artist they aren't a member of. */
export const ADMIN_ARTIST_WORKSPACE_TABS: readonly ArtistWorkspaceTabId[] = ["profile", "riders"];

export const ARTIST_WORKSPACE_BASE_PATH = "/dashboard/artists";

export function getArtistWorkspaceTabPath(tab: ArtistWorkspaceTabId) {
  return tab === "profile" ? ARTIST_WORKSPACE_BASE_PATH : `${ARTIST_WORKSPACE_BASE_PATH}/${tab}`;
}

function isArtistWorkspaceTabId(value: string): value is ArtistWorkspaceTabId {
  return (ARTIST_WORKSPACE_TABS as readonly string[]).includes(value);
}

/** The active tab for a pathname, or `null` off the workspace (the rider editor). */
export function artistWorkspaceTabFromPathname(pathname: string): ArtistWorkspaceTabId | null {
  if (pathname === ARTIST_WORKSPACE_BASE_PATH) return "profile";
  if (!pathname.startsWith(`${ARTIST_WORKSPACE_BASE_PATH}/`)) return null;
  const segments = pathname.slice(ARTIST_WORKSPACE_BASE_PATH.length + 1).split("/");
  const [segment, child] = segments;
  // `/riders/<id>` is the full-page rider editor, which has its own header.
  if (child) return null;
  return segment && isArtistWorkspaceTabId(segment) ? segment : null;
}
