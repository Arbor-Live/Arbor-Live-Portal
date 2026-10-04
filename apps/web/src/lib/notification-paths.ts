/**
 * Whether the page at `pathname` + `search` is the page a notification links
 * to, so opening it marks the notification read.
 *
 * - The notification's path must equal the current path, or be a parent of it
 *   when it is specific enough (3+ segments: `/dashboard/events/<id>` covers the
 *   event's tabs, while `/dashboard` never swallows every page).
 * - Every query param on the notification (`?report=<id>`) must be present
 *   with the same value; extra params on the page are fine.
 */
export function matchesNotificationPath(
  notificationPath: string,
  pathname: string,
  search: string,
): boolean {
  let target: URL;
  try {
    target = new URL(notificationPath, "http://portal.local");
  } catch {
    return false;
  }
  const targetPath = trimTrailingSlash(target.pathname);
  const currentPath = trimTrailingSlash(pathname);
  const segmentCount = targetPath.split("/").filter(Boolean).length;
  const pathMatches =
    currentPath === targetPath ||
    (segmentCount >= 3 && currentPath.startsWith(`${targetPath}/`));
  if (!pathMatches) return false;

  const current = new URLSearchParams(search);
  for (const [key, value] of target.searchParams) {
    if (current.get(key) !== value) return false;
  }
  return true;
}

function trimTrailingSlash(path: string) {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}
