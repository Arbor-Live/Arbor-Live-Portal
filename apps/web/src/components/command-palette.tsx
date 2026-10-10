"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import {
  CalendarDotsIcon,
  GuitarIcon,
  MagnifyingGlassIcon,
  ReceiptIcon,
  type Icon,
} from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { formatDate } from "@/lib/format";
import { formatEventStatusLabel } from "@/lib/event-status";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useDashboardNav, type DashboardNavSection } from "@/hooks/use-dashboard-nav";
import { UserAvatar } from "@/components/account/user-avatar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/** Mirrors `MIN_GLOBAL_SEARCH_CHARS` in convex/globalSearch.ts. */
const MIN_SEARCH_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 200;

type PageEntry = { title: string; section?: string; url: string; icon: Icon };

/** One entry per page the sidebar links to (a one-page section links straight to it). */
function pageEntries(sections: DashboardNavSection[]): PageEntry[] {
  return sections.flatMap(({ item, subItems }) => {
    if (subItems.length <= 1) {
      return [{ title: item.title, url: subItems[0]?.url ?? item.url, icon: item.icon }];
    }
    return subItems.map((subItem) => ({
      title: subItem.title,
      section: item.title,
      url: subItem.url,
      icon: item.icon,
    }));
  });
}

/** Pages under their sidebar section; top-level pages (Home, Camera…) under "General". */
function groupPages(pages: PageEntry[]) {
  const groups: { heading: string; pages: PageEntry[] }[] = [];
  for (const page of pages) {
    const heading = page.section ?? "General";
    const group = groups.find((candidate) => candidate.heading === heading);
    if (group) group.pages.push(page);
    else groups.push({ heading, pages: [page] });
  }
  return groups;
}

function matchesPage(page: PageEntry, words: string[]) {
  const haystack = `${page.section ?? ""} ${page.title}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

const noSubscribe = () => () => {};

/** The shortcut hint: ⌘K on Apple devices, Ctrl K elsewhere (⌘ while server-rendering). */
function useIsMac() {
  return useSyncExternalStore(
    noSubscribe,
    () => /mac|iphone|ipad/i.test(navigator.userAgent),
    () => true,
  );
}

/**
 * ⌘K / Ctrl+K: jump to any dashboard page the viewer can open, or find an
 * event, invoice, person or artist by name.
 */
export function CommandPalette() {
  const router = useRouter();
  const isMac = useIsMac();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const { sections, isArborContext, effectiveIsAdmin, effectiveHasOperationsAccess } =
    useDashboardNav();
  const pages = pageEntries(sections);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setSearch("");
      setOpen((current) => !current);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const searching = open && isArborContext && debouncedSearch.length >= MIN_SEARCH_CHARS;
  const results = useQuery(
    api.globalSearch.search,
    searching
      ? {
          query: debouncedSearch,
          includeAdmin: effectiveIsAdmin,
          includeOperations: effectiveHasOperationsAccess,
        }
      : "skip",
  );
  const pending =
    isArborContext &&
    search.trim().length >= MIN_SEARCH_CHARS &&
    (search.trim() !== debouncedSearch || results === undefined);

  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matchingPages = words.length ? pages.filter((page) => matchesPage(page, words)) : pages;
  // Skeleton rows stand in while a query settles, so Enter never opens a
  // result from the previous query.
  const shown = searching && !pending ? results : undefined;
  // Browsing: pages under their section. Searching: one "Pages" group, so its
  // headings never repeat the result sections (Events, Artists).
  // The list fits its content and glides between sizes. While a search
  // settles it holds its height (the skeleton fills it), then glides once to
  // the results, instead of collapsing and regrowing on every keystroke.
  const pendingRef = useRef(pending);
  const listElement = useRef<HTMLDivElement | null>(null);
  const listRef = useCallback((list: HTMLDivElement | null) => {
    listElement.current = list;
    const sizer = list?.querySelector<HTMLElement>("[cmdk-list-sizer]");
    if (!list || !sizer) return;
    const fit = () => {
      if (!pendingRef.current) list.style.height = `${sizer.offsetHeight}px`;
    };
    // No synchronous fit: cmdk re-attaches this ref on renders, before the
    // layout effect below has recorded `pending`. The observer's first callback
    // runs after it.
    const observer = new ResizeObserver(fit);
    observer.observe(sizer);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    pendingRef.current = pending;
    const list = listElement.current;
    const sizer = list?.querySelector<HTMLElement>("[cmdk-list-sizer]");
    if (!pending && list && sizer) list.style.height = `${sizer.offsetHeight}px`;
  }, [pending]);

  const pageGroups = (
    words.length ? [{ heading: "Pages", pages: matchingPages }] : groupPages(matchingPages)
  )
    // While a search settles the skeleton stands alone; pages join the results after.
    .filter((group) => group.pages.length > 0 && !pending);

  function go(url: string) {
    setOpen(false);
    setSearch("");
    router.push(url);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setOpen(true)}
        aria-label="Search"
        aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
      >
        <MagnifyingGlassIcon />
        <span className="hidden sm:inline">Search</span>
        <Kbd className="hidden sm:inline-flex">{isMac ? "⌘K" : "Ctrl K"}</Kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
        title="Search"
        description="Jump to a page, or find an event, invoice, person or artist."
        className="sm:max-w-2xl"
      >
        {/* Results already match on the server; cmdk only orders keyboard focus. */}
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={
              isArborContext ? "Search events, invoices, people, pages…" : "Search pages…"
            }
          >
            <Kbd className="hidden sm:inline-flex">esc</Kbd>
          </CommandInput>
          {/* Height is set by listRef. The padding sits on cmdk's sizer so the
              measured height includes it (otherwise the list always scrolls). */}
          <CommandList
            ref={listRef}
            className="max-h-[min(30rem,60vh)] p-0 transition-[height] duration-200 ease-out motion-reduce:transition-none [&>[cmdk-list-sizer]]:p-2"
          >
            {pending ? <ResultsSkeleton /> : (
              <CommandEmpty className="flex flex-col items-center justify-center gap-2 py-12">
                <MagnifyingGlassIcon className="size-6 text-muted-foreground" />
                <span className="text-sm">No results for “{search.trim()}”</span>
                <span className="text-xs text-muted-foreground">
                  Try an event name, an invoice number, or a person.
                </span>
              </CommandEmpty>
            )}
            {shown?.events.length ? (
              <CommandGroup heading="Events">
                {shown.events.map((event) => (
                  <PaletteItem
                    key={event._id}
                    value={`event-${event._id}`}
                    onSelect={() => go(`/dashboard/events/${event._id}`)}
                    leading={<IconTile icon={CalendarDotsIcon} />}
                    title={event.title}
                    detail={[
                      formatDate(event.startAt),
                      event.venueName,
                      event.status === "cancelled" ? formatEventStatusLabel(event.status) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                ))}
              </CommandGroup>
            ) : null}
            {shown?.invoices.length ? (
              <CommandGroup heading="Invoices">
                {shown.invoices.map((invoice) => (
                  <PaletteItem
                    key={invoice._id}
                    value={`invoice-${invoice._id}`}
                    onSelect={() => go(`/dashboard/ops-center/invoices/${invoice._id}`)}
                    leading={<IconTile icon={ReceiptIcon} />}
                    title={invoice.clientGroupName || "No host"}
                    detail={`${invoice.invoiceNumber}${invoice.status === "void" ? " · Void" : ""}`}
                  />
                ))}
              </CommandGroup>
            ) : null}
            {shown?.people.length ? (
              <CommandGroup heading="People">
                {shown.people.map((person) => (
                  <PaletteItem
                    key={person.id}
                    value={`person-${person.id}`}
                    onSelect={() => go(`/dashboard/users?user=${encodeURIComponent(person.id)}`)}
                    leading={
                      <UserAvatar
                        name={person.name}
                        email={person.email}
                        userId={person.id}
                        imageUrl={person.image}
                        size="sm"
                        pixelSize={32}
                        className="size-8"
                      />
                    }
                    title={person.name}
                    detail={person.email}
                  />
                ))}
              </CommandGroup>
            ) : null}
            {shown?.artists.length ? (
              <CommandGroup heading="Artists">
                {shown.artists.map((artist) => (
                  <PaletteItem
                    key={artist.organizationId}
                    value={`artist-${artist.organizationId}`}
                    onSelect={() =>
                      go(`/dashboard/artists/directory?artist=${encodeURIComponent(artist.organizationId)}`)
                    }
                    leading={<IconTile icon={GuitarIcon} />}
                    title={artist.name}
                    detail="Artist directory"
                  />
                ))}
              </CommandGroup>
            ) : null}
            {pageGroups.map((group) => (
              <CommandGroup key={group.heading} value={`pages-${group.heading}`} heading={group.heading}>
                {group.pages.map((page) => (
                  <PaletteItem
                    key={page.url}
                    value={`page-${page.url}`}
                    onSelect={() => go(page.url)}
                    leading={<IconTile icon={page.icon} compact={!words.length} />}
                    title={page.title}
                    detail={words.length ? page.section : undefined}
                  />
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="hidden items-center gap-4 border-t px-4 py-2.5 text-xs text-muted-foreground sm:flex">
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd>
              Open
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <Kbd>{isMac ? "⌘K" : "Ctrl K"}</Kbd>
              Toggle
            </span>
          </div>
        </Command>
      </CommandDialog>
    </>
  );
}

/** Placeholder rows, shaped like results, while a search settles. */
function ResultsSkeleton() {
  return (
    <div aria-hidden className="px-2 pt-2">
      <Skeleton className="mb-3 h-2.5 w-16" />
      {[0.55, 0.4, 0.48].map((width) => (
        <div key={width} className="flex items-center gap-3 py-2">
          <Skeleton className="size-8 shrink-0" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5" style={{ width: `${width * 100}%` }} />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function IconTile({ icon: TileIcon, compact }: { icon: Icon; compact?: boolean }) {
  return (
    <span
      data-compact={compact || undefined}
      className="flex size-8 shrink-0 data-compact:size-7 items-center justify-center border bg-muted/40 text-muted-foreground group-data-selected/command-item:border-foreground/15 group-data-selected/command-item:bg-background group-data-selected/command-item:text-foreground"
    >
      <TileIcon className="size-4" />
    </span>
  );
}

function PaletteItem({
  leading,
  title,
  detail,
  ...props
}: Omit<ComponentProps<typeof CommandItem>, "title"> & {
  leading: ReactNode;
  title: string;
  detail?: string;
}) {
  return (
    <CommandItem {...props}>
      {leading}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{title}</span>
        {detail ? <span className="truncate text-xs text-muted-foreground">{detail}</span> : null}
      </span>
      <Kbd className="opacity-0 group-data-selected/command-item:opacity-100">↵</Kbd>
    </CommandItem>
  );
}
