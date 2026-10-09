export type NavigationGuardClick = {
  /** Raw `href` attribute of the clicked anchor. */
  href: string | null | undefined;
  /** The anchor's `target` attribute; `_blank` and friends open elsewhere. */
  target?: string | null | undefined;
  /** Whether the anchor carries a `download` attribute. */
  download?: boolean;
  /** Whether a modifier key was held (meta / ctrl / shift / alt). */
  modified?: boolean;
  /** Mouse button index; only the primary button navigates in this tab. */
  button?: number;
  /** `window.location.href` at click time. */
  currentUrl: string;
};

/**
 * Whether a click on a link will take this tab to another page (and so drop
 * the page's unsaved draft). Skips modified/middle clicks, downloads, targets
 * other than `_self`, other origins and non-http schemes, and same-page links
 * (hash or query changes re-render but never unmount the draft). `surfacePrefix`
 * marks routes that keep the draft mounted (an editor's own route tabs).
 */
export function shouldGuardNavigationClick(
  click: NavigationGuardClick,
  surfacePrefix?: string,
): boolean {
  if (click.modified) return false;
  if ((click.button ?? 0) !== 0) return false;
  if (click.download) return false;
  const target = (click.target ?? "").trim().toLowerCase();
  if (target && target !== "_self") return false;
  if (!click.href) return false;

  let current: URL;
  let destination: URL;
  try {
    current = new URL(click.currentUrl);
    destination = new URL(click.href, click.currentUrl);
  } catch {
    return false;
  }

  if (destination.origin !== current.origin) return false;
  if (destination.pathname === current.pathname) return false;

  if (surfacePrefix) {
    const prefix = surfacePrefix.endsWith("/") ? surfacePrefix.slice(0, -1) : surfacePrefix;
    if (destination.pathname === prefix || destination.pathname.startsWith(`${prefix}/`)) {
      return false;
    }
  }

  return true;
}
