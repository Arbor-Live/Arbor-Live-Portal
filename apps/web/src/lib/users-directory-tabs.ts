export const USERS_DIRECTORY_TABS = ["people", "invitations", "organizations"] as const;

export type UsersDirectoryTabId = (typeof USERS_DIRECTORY_TABS)[number];

export const USERS_DIRECTORY_TAB_LABELS: Record<UsersDirectoryTabId, string> = {
  people: "People",
  invitations: "Invitations",
  organizations: "Organizations",
};

export const USERS_DIRECTORY_BASE_PATH = "/dashboard/users";

export function getUsersDirectoryTabPath(tab: UsersDirectoryTabId) {
  if (tab === "people") return USERS_DIRECTORY_BASE_PATH;
  return `${USERS_DIRECTORY_BASE_PATH}/${tab}`;
}

/** Derive the active Users tab from the current pathname. */
export function activeUsersTabFromPathname(pathname: string): UsersDirectoryTabId {
  const segment = pathname.slice(USERS_DIRECTORY_BASE_PATH.length + 1).split("/")[0] ?? "";
  return (USERS_DIRECTORY_TABS as readonly string[]).includes(segment)
    ? (segment as UsersDirectoryTabId)
    : "people";
}
