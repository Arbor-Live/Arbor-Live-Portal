import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppDialog } from "@/components/ui/app-dialog";
import { shouldGuardNavigationClick } from "@/lib/navigation-guard";

/**
 * Warn before in-app navigation drops a page's unsaved drafts. While `dirty`,
 * same-tab clicks on internal links confirm first (`Discard changes`), and a
 * confirmed click continues with `router.push`. `message` is the dialog title,
 * naming what gets discarded ("Discard unsaved changes to this quote?"). Refresh
 * and tab close stay `useBeforeUnload`'s job.
 *
 * Browser back/forward is deliberately not intercepted: `popstate` is not
 * cancelable, the App Router has already started the route change by the time it
 * fires, and the draft lives in the unmounting page — there is nothing left to
 * confirm against.
 */
export function useNavigationGuard(
  dirty: boolean,
  message: string,
  { surfacePrefix }: { surfacePrefix?: string } = {},
) {
  const router = useRouter();
  const { confirm } = useAppDialog();
  const askingRef = useRef(false);

  useEffect(() => {
    if (!dirty) return;

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      if (
        !shouldGuardNavigationClick(
          {
            href,
            target: anchor.getAttribute("target"),
            download: anchor.hasAttribute("download"),
            modified: event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
            button: event.button,
            currentUrl: window.location.href,
          },
          surfacePrefix,
        )
      ) {
        return;
      }
      event.preventDefault();
      if (askingRef.current) return;
      askingRef.current = true;
      void (async () => {
        try {
          const ok = await confirm({
            title: message,
            description: "What you've typed that hasn't been saved will be lost.",
            confirmLabel: "Discard changes",
            destructive: true,
          });
          if (!ok) return;
          const url = new URL(href, window.location.href);
          router.push(`${url.pathname}${url.search}${url.hash}`);
        } finally {
          askingRef.current = false;
        }
      })();
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [confirm, dirty, message, router, surfacePrefix]);
}
