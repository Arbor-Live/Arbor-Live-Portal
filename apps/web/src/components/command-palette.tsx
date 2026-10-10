"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
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
  const shown = searching ? results : undefined;

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
        className="sm:max-w-xl"
      >
        {/* Results already match on the server; cmdk only orders keyboard focus. */}
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            // 16px on phones so iOS does not zoom into the field.
            className="text-base sm:text-xs"
            placeholder={
              isArborContext ? "Search pages, events, invoices, people…" : "Search pages…"
            }
          />
          <CommandList className="max-h-[min(28rem,60vh)]">
            {pending ? null : (
              <CommandEmpty>No results for “{search.trim()}”.</CommandEmpty>
            )}
            {shown?.events.length ? (
              <CommandGroup heading="Events">
                {shown.events.map((event) => (
                  <CommandItem
                    key={event._id}
                    value={`event-${event._id}`}
                    onSelect={() => go(`/dashboard/events/${event._id}`)}
                  >
                    <CalendarDotsIcon />
                    <span className="truncate">{event.title}</span>
                    <CommandShortcut className="max-w-[50%] truncate tracking-normal">
                      {[
                        formatDate(event.startAt),
                        event.venueName,
                        event.status === "cancelled" ? formatEventStatusLabel(event.status) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {shown?.invoices.length ? (
              <CommandGroup heading="Invoices">
                {shown.invoices.map((invoice) => (
                  <CommandItem
                    key={invoice._id}
                    value={`invoice-${invoice._id}`}
                    onSelect={() => go(`/dashboard/ops-center/invoices/${invoice._id}`)}
                  >
                    <ReceiptIcon />
                    <span className="truncate">{invoice.clientGroupName || "No host"}</span>
                    <CommandShortcut className="shrink-0 tracking-normal">
                      {invoice.status === "void" ? "Void · " : ""}
                      {invoice.invoiceNumber}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {shown?.people.length ? (
              <CommandGroup heading="People">
                {shown.people.map((person) => (
                  <CommandItem
                    key={person.id}
                    value={`person-${person.id}`}
                    onSelect={() => go(`/dashboard/users?user=${encodeURIComponent(person.id)}`)}
                  >
                    <UserAvatar
                      name={person.name}
                      email={person.email}
                      userId={person.id}
                      imageUrl={person.image}
                      size="sm"
                      pixelSize={20}
                      className="size-5"
                    />
                    <span className="truncate">{person.name}</span>
                    <CommandShortcut className="truncate tracking-normal">{person.email}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {shown?.artists.length ? (
              <CommandGroup heading="Artists">
                {shown.artists.map((artist) => (
                  <CommandItem
                    key={artist.organizationId}
                    value={`artist-${artist.organizationId}`}
                    onSelect={() =>
                      go(`/dashboard/artists/directory?artist=${encodeURIComponent(artist.organizationId)}`)
                    }
                  >
                    <GuitarIcon />
                    <span className="truncate">{artist.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {matchingPages.length ? (
              <CommandGroup heading="Pages">
                {matchingPages.map((page) => (
                  <CommandItem key={page.url} value={`page-${page.url}`} onSelect={() => go(page.url)}>
                    <page.icon />
                    <span className="truncate">
                      {page.section ? (
                        <span className="text-muted-foreground">{page.section} / </span>
                      ) : null}
                      {page.title}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {pending ? (
              <div className="px-2 py-3 text-xs text-muted-foreground" role="status">
                Searching…
              </div>
            ) : null}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
