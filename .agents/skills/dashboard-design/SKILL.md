---
name: dashboard-design
description:
  How to build and redesign dashboard pages so they match the event page (the
  reference design). Use when creating a new /dashboard page, redesigning an
  existing one, or adding lists, side panels, tabs, headers, or save flows to
  the staff dashboard.
---

# Dashboard design (the event page pattern)

The event page (`/dashboard/events/[id]`) is the reference design for the staff
dashboard. New pages and redesigns should look and behave like it. This skill
describes its building blocks and the rules behind them. Read the reference
files before building; copy their structure, don't reinvent it.

## Reference files

| Piece | File |
|---|---|
| Page shell (header, tabs, panels, save bar) | `apps/web/src/components/events/workspace/event-workspace.tsx` |
| **Shared header, pills, meta, tabs** (use these) | `apps/web/src/components/page-header.tsx` |
| Header built on it (the working example) | `components/events/workspace/event-workspace-header.tsx` |
| Tabs built on it | `components/events/workspace/event-workspace-nav.tsx` |
| Page state: draft, dirty sections, save all | `components/events/workspace/event-workspace-provider.tsx` |
| Main + aside grid | `components/events/workspace/tabs/overview-tab.tsx` |
| **Shared list row** (use this) | `apps/web/src/components/list-row.tsx` |
| List rows + side panel (the model for any list) | `components/events/event-artist-bill-section.tsx`, `components/events/lineup/position-sheet.tsx` |
| **Shared list shell** (groups, cells, row menu, summary, empty state, side panel) | `apps/web/src/components/list-page.tsx`; working example `components/inventory/types-manager.tsx` + `types-table.tsx` + `type-sheet.tsx` |
| Grouped rows with a type chip and a coloured rail | `components/events/workspace/run-of-show/run-of-show-editor.tsx`, `run-of-show-styles.tsx` |
| Create dialog with modes | `components/events/lineup/add-to-bill-dialog.tsx` |
| Tabs as routes | `lib/event-editor-tabs.ts`, `app/dashboard/events/[id]/layout.tsx` |

## Layout

**Page shell** (top to bottom, `space-y-4 pb-24`, and the `pb-24` leaves room
for the save bar):

1. **Header:** `<PageHeader>`, never a `Card`. See below.
2. Read-only `Alert`, if the viewer can't edit.
3. **`<PageTabs>`**, when the page has more than one area.
4. The active tab's panel.
5. `FormSaveBar tier="C"` for pages with unsaved drafts.

**Header: use `PageHeader`** (`components/page-header.tsx`). Don't build
headers by hand, and never use a `Card` as a page title. The event header is
built on it (`event-workspace-header.tsx`), so it's the working example.

```tsx
import { MetaItem, PageHeader, StatusPill } from "@/components/page-header";

<PageHeader
  back={{ href: "/dashboard/financial-hub/requests", label: "Requests" }}
  actions={<Button size="sm">Create quote</Button>}
  menu={
    <>
      <DropdownMenuItem onSelect={markActionRequired}>Mark action required</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={decline}>Decline</DropdownMenuItem>
    </>
  }
  pills={<StatusPill tone="amber">Action required</StatusPill>}
  title={`${request.firstName} ${request.lastName}`}
  meta={
    <>
      <MetaItem icon={CalendarBlankIcon}>{formatDate(request.eventDate)}</MetaItem>
      <MetaItem icon={MapPinIcon}>{request.venueName}</MetaItem>
    </>
  }
/>
```

- `back`: the parent list. `actions`: one or two buttons. `menu`: the `⋯`
  items, secondary first, then a separator, then destructive.
- `pills`: `StatusPill` for a read-only status, `StatusPillSelect` (with
  `options: { value, label, tone }[]`) when the status is editable from the
  header, plus links like "Recurring · View series".
- `title`: a string renders the `h1`. For renamable things pass
  `<EditablePageTitle value onChange label />`.
- `description`: one or two plain sentences under the title saying what the
  page is for (this replaces the old `CardDescription` in card headers).
- `meta`: `MetaItem`s (icon + text; pass `onClick` to open a Sheet).
- `children`: anything under the meta line (a day switcher, a notice).
- Tones: `neutral | blue | emerald | amber | rose`. Map your domain's statuses
  to tones in one function next to the status labels (see
  `eventStatusBadgeTone` in `lib/event-status.ts`).

**Tabs: use `PageTabs`** for a page with more than one area:
`<PageTabs label="Event sections" tabs={[{ href, label, icon, active, badge?, dirty? }]} />`.
Each tab is a real route (`/dashboard/<thing>/<id>/<tab>`), so deep links and
back/forward work. Keep the ids, labels and icons in a `lib/*-tabs.ts` module
(see `lib/event-editor-tabs.ts`). Use `badge` for an amber warning count
(things needing attention) or a muted count (size), and `dirty` for the
unsaved dot.

**Panel grid:** a main column plus an aside, via
`grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]`. Always `min-w-0` on both
columns. Main holds the page's substance; the aside holds people, context and
comments.

**Cards:** `Card` → `CardHeader` → `CardTitle className="flex items-center gap-2"`
with a muted `size-4` icon, then an optional one-line `text-sm
text-muted-foreground` description, and actions right-aligned in the header
row (`flex flex-row flex-wrap items-start justify-between gap-2`). A card is a
*section of the page*, never the page title.

## Lists: rows plus a side panel

Every list of things (positions, payouts, users, types, requests) follows the
Lineup. **Build it from `ListRow` (`components/list-row.tsx`) and the shell
pieces in `components/list-page.tsx`** rather than by hand: `ListSummary`
(summary + order rule), `RowGroup` (a titled, counted group whose rows drop
their own border), `RowList` (stacked, or `joined` under a column header),
`RowText` (eyebrow, title, detail) and `RowCell` (fixed-width, right-aligned
numbers) inside the row, `RowMenu` in its `actions`, `EmptyState`, and
`DetailSheet` → `DetailSheetHeader`, `SheetSection`, `SheetFields`/`SheetField`,
`DetailSheetFooter`.

The shell, top to bottom: `PageHeader` → `FilterBar` → `ListSummary` → groups
of rows → `DetailSheet`. A page that is really a view of another (Payments is
the back half of Invoices) is a `PageTabs` tab there, not its own nav item.
Dense numbers stay in fixed-width `RowCell`s rather than a spreadsheet table.

The rules the pieces encode:

- **Search and filters: use `FilterBar`** (`components/filter-bar.tsx`), never
  a row of selects. It's a search box, a **Filter** menu that adds a filter as
  a chip ("Category is Lighting, Sound ×"), and **Clear all**. Only filters in
  use take up room. Each chip matches rows where any of its values applies, or
  none does once flipped to "is not"; pass `single` for yes/no filters ("Units:
  Has units"). The page owns the `FilterState`: send `activeFilters(state)` to
  the query (the server should filter the whole table, not the loaded page;
  see `inventoryTypes.list`), or use `matchesFilter` on rows it already has in
  full. Clear the row selection when filters change. Types
  (`inventory/types-manager.tsx`) is the working example.
- **A summary line** above the list, `text-sm`, in plain words, joined with
  ` · `: "3 positions · 2 booked · 1 open · $1,200 in payouts (1 unpaid)".
  Give it a `data-testid`.
- **Rows**, not cards: use `ListRow` (`components/list-row.tsx`). It renders the
  `li` frame and puts the hover highlight on the **whole row**, so the highlight
  covers the card edge to edge instead of stopping at the main button. It splits
  the row into `leading` (an order number, checkbox, avatar), the clickable main
  area, and `actions` (the `⋯` menu or a primary button). The main area opens
  the side panel: pass `onOpen` (renders a `button`) or `href` (renders a
  `Link`, for rows that navigate).
  - Left: an order number or time (`tabular-nums`, muted).
  - Middle: a tiny uppercase context label (`text-2xs font-medium tracking-wide
    uppercase text-muted-foreground`), the name (`font-medium truncate`), and
    one muted detail line.
  - Right: flags (amber `rounded-md bg-status-amber-500/15 px-2 py-0.5
    text-xs`), a fixed-width time or amount column (`tabular-nums`,
    `hidden md:block` so it drops on small screens), and a fixed-width status
    chip (so rows align).
- **One primary action per row**, or none. Everything else goes in a `⋯` menu
  at the end of the row ("Open details", then a separator, then destructive).
- **Order with meaning:** show order, workflow stage, or soonest first. Say
  the rule in the card description ("In show order, from set times…").
- **Empty state:** a dashed box, `border border-dashed px-3 py-6 text-center
  text-sm text-muted-foreground`, saying what to do next. Loading uses
  `Skeleton`s (the page shell) or one muted "Loading …" line (inside a card).

**Side panel** (`Sheet`, `SheetContent className="w-full overflow-y-auto
sm:max-w-lg"`, with a `data-testid`):
- `SheetHeader`: title plus a status chip, and a `SheetDescription` for context.
- Sections: `section.space-y-3.border-t.px-4.py-4`, each with an `h3` in
  `text-xs font-semibold tracking-wide uppercase text-muted-foreground`.
- `SheetFooter` (`border-t`, right-aligned) for destructive and final actions.
- **Key the body on the row**, so drafts reset when another row opens.
- **Deep link:** `?<thing>=<id>` opens the panel on load (see
  `event-artist-bill-section.tsx`, `?position=`). Other pages link straight to
  a row this way.
- Close the panel only after an action succeeds. A cancelled confirm or a
  failed mutation leaves it open (handlers return `true`/`false`).

**Grouped rows** (a timeline, pipeline stages, days): a group header row
(`bg-muted/20 px-3 py-2`, `font-semibold`), then nested rows (`pl-6`,
`divide-y border-t`). The Run of Show adds a `w-1` coloured rail and an
uppercase type chip per row (`TypeChip` and `RAIL_STYLES` in
`run-of-show-styles.tsx`); reuse them for anything typed.

## Editing and saving

- **Page-level drafts** (a form spanning tabs): keep one draft in a provider,
  track dirty sections as a `Set`, and save all through `FormSaveBar tier="C"`.
  Show "Unsaved: Details · Schedule" in the bar's summary, and dots on the
  dirty tabs. Saves send only the changed fields.
- **Row-level edits** (inside a side panel): save immediately through the
  mutation, and report the result with `notify.success` / `notify.error` via a
  shared `attempt(action, message)` helper that returns whether it succeeded.
- **Destructive actions:** `useAppDialog().confirm({ title, description,
  destructive: true, confirmLabel })`. The title names the thing ("Remove The
  Larks from the bill?"), the description says what happens and what stays,
  and `confirmLabel` is the verb ("Remove payout"), never "OK".
- **Several related writes** go in one Convex mutation, so they succeed or fail
  together (see `eventArtistNeeds.removeFromBill`).

## Controls

- Only design-system components: `Input`, `Textarea`, `SearchableSelect` (or
  `ArtistSelect` / `UserSelect`), `Button`, `ToggleGroup`, `DropdownMenu`,
  `Dialog`, `Sheet`, `Switch`, `Label`. No raw `<select>`, `<textarea>`, or
  hand-rolled `<div role="dialog">` overlays.
- Every `Label` has `htmlFor` pointing at its input `id`. Use distinct id
  prefixes when two forms can render at once.
- Dropdowns inside a `Dialog` or `Sheet` must not shift the layout. The shared
  `dialog.tsx` / `sheet.tsx` portal pickers into a layer for this, so use those
  components rather than raw Radix.
- **Times:** when the date is known from context (the event), ask for times
  only (`Input type="time"`; that's fine, since app-context only bans
  `datetime-local` popovers) and derive the date. Roll past midnight, and show
  a Day picker only on multi-day events (`lib/performance-times.ts`, added in #352). Use the
  full `DateTimeRangePicker` only when the date is genuinely free.
- Mode switches inside a form use `ToggleGroup variant="outline"`
  ("Book artist · Invite · Outside act"); range filters use
  `ToggleGroup size="sm"` ("2 weeks · 30 days · 90 days · All upcoming").

## Visual language

- **Square corners.** `Card` and `Button` are `rounded-none`; follow suit with
  borders, not rounded cards or pills. Only small inline flags use `rounded-md`.
- **Colour means state, not decoration.** Use the `status-*` tokens: emerald =
  done / booked, amber = needs attention, blue = setup or info, rose /
  `destructive` = cancelled or urgent, slate = neutral moments. Tints are
  `bg-status-X-500/10` with `border-status-X-500/40` and `text-status-X-700`,
  plus a `dark:` text shade where the 700 is too dark. Check that the token
  exists in `app/globals.css`.
- **Numbers** (times, money, counts) are `tabular-nums` and right-aligned in
  fixed-width columns.
- **Icons:** see [Icons](#icons).
- **Copy:** sentence case, plain words, and what the user can do next ("No run
  of show yet. Build it from the lineup, or quick-add the sections crew work
  in."). Don't label times with a timezone (see app-context).

## Icons

**Library:** Phosphor only (`@phosphor-icons/react`), about 120 imports and no
other icon set. In server components (e.g. public `(site)` pages), import from
`@phosphor-icons/react/dist/ssr`. Always use the `…Icon` export names
(`MapPinIcon`, not `MapPin`), and type icon props and maps with
`import { type Icon } from "@phosphor-icons/react"`.

**Where icons go:** icons label *things* (a card title, a meta item, a tab, a
row type) and *actions* (buttons). Don't sprinkle them into body text, and
don't put an icon on every button: a row's primary action is usually just a
word.

**Sizes** (in order of how often the app uses them):

| Size | Use |
|---|---|
| `size-4` (default) | Card titles, meta items, tab links, row type icons, standalone status icons |
| `size-3.5` | Inside compact chips and badges, and inline flags like `WarningIcon` next to a count |
| `size-3` | Tiny affordances: a caret in a pill, `ArrowSquareOutIcon` after an external link, a check inside a small chip |
| `size-5` | The empty-state illustration box, and the `⋯` `DotsThreeIcon` in the page header |

**Inside a `Button`, don't set a size.** `Button` sizes its SVG per button
size (`[&_svg:not([class*='size-'])]:size-…`) and already sets
`shrink-0 pointer-events-none`. Add a size class only to deliberately break
that.

**Colour:** decorative icons are `text-muted-foreground` next to
`text-foreground` text (card titles, meta). Status icons take the status colour
of their meaning (`text-status-amber-700` for a warning, `text-destructive`
for errors). Never colour an icon just for decoration.

**Weight:**
- `regular` is the default.
- `fill` is for the **active / selected** state: the active tab
  (`weight={active ? "fill" : "regular"}`), a selected option, a filled-in
  warning badge (`WarningIcon weight="fill"`).
- `bold` only for small glyphs that would otherwise look thin: `CheckIcon` in
  chips, `DotsThreeIcon`, `PlusIcon` in tight buttons.
- No `duotone` or `thin` in the dashboard.

**Accessibility:**
- Icons next to visible text are decorative: give them `aria-hidden` so screen
  readers don't announce a stray graphic (the Run of Show rails and moment
  icons do this).
- **Icon-only buttons** (`size="icon" | "icon-sm" | "icon-xs" | "icon-lg"`)
  must have an `aria-label` naming the action and the target ("Move The Larks
  earlier", "Clear set time", "More for this position"), and a `title` when the
  meaning isn't obvious.
- A status conveyed by an icon also needs text or a `title` (the tab badge's
  `title="3 open crew slots"`).

**One icon per concept.** Reuse what the app already uses; don't pick a new
glyph for an existing idea. Keep domain mappings in a `Record` next to their
labels (`TAB_ICONS` in `event-workspace-nav.tsx`, `MOMENT_ICONS` in
`run-of-show-styles.tsx`) instead of inline.

| Concept | Icon |
|---|---|
| Event / date | `CalendarDotsIcon` (nav, Run of Show tab), `CalendarBlankIcon` (a date in a meta line) |
| Venue / location | `MapPinIcon` |
| Host / organization | `BuildingsIcon` |
| A person (manager, owner) | `UserCircleIcon`; a single user avatar placeholder `UserIcon` |
| Crew / a group of people | `UsersThreeIcon` (crew counts); `UsersIcon` is the Users *nav* item only |
| Artist / act | `MicrophoneStageIcon` (Lineup tab, sets); `GuitarIcon` is the Artists *nav* item only |
| Soundcheck · doors · changeover | `SpeakerHighIcon` · `DoorOpenIcon` · `ArrowsLeftRightIcon` |
| Equipment | `PackageIcon` |
| External rental (pass-through gear) | `TruckIcon` |
| Billing / quote / invoice | `ReceiptIcon`; money totals and fees `CurrencyDollarIcon` |
| Due date | `CalendarCheckIcon` (meta line) |
| Extra hours / durations | `ClockIcon` |
| Terms / notes | `NotePencilIcon` |
| Settings behind a page (pricing modes, rates) | `SlidersHorizontalIcon` |
| Promo / marketing | `MegaphoneIcon` |
| Overview | `SquaresFourIcon` |
| Event type | the `EVENT_TYPE_ICONS` map in `components/events/workspace/event-draft.ts` (don't hand-pick per page) |
| Recurring series | `RepeatIcon` |
| Visibility | `GlobeIcon` (public), `LockSimpleIcon` (internal), `InfoIcon` (informational) |
| Add · edit · delete | `PlusIcon` · `PencilSimpleIcon` · `TrashIcon` |
| Close / clear / remove from a list | `XIcon` |
| More actions | `DotsThreeIcon` (`weight="bold"`) |
| Open a dropdown | `CaretDownIcon` (`size-3`/`size-3.5`, after the label) |
| Back | `ArrowLeftIcon` (header back link) |
| Opens elsewhere / new tab | `ArrowSquareOutIcon` (`size-3`, after the label) |
| Copy | `CopyIcon` |
| Email / invite | `EnvelopeSimpleIcon` |
| Filter (the FilterBar button) | `FunnelSimpleIcon` |
| Search | `MagnifyingGlassIcon` (inside the input: `pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground`, input gets `pl-9`) |
| Needs attention (inline, with a count) | `WarningIcon` |
| Error / blocking alert | `WarningCircleIcon` (in `Alert`s) |
| Done / confirmed | `CheckIcon` |
| Magic / auto-build | `MagicWandIcon` (Build run of show); quick fill `LightningIcon` |
| Signature / e-sign | `SignatureIcon` (awaiting signature, artist payouts) |
| Version history (quote versions) | `ClockCounterClockwiseIcon` |
| Select rows for a batch action | `Checkbox` (`components/ui/checkbox.tsx`), with a select-all in the group header |
| Stage plot · rider inputs · monitor mixes | `GridFourIcon` · `PlugsConnectedIcon` · `HeadphonesIcon` (rider tabs, `lib/rider-editor-tabs.ts`) |
| Undo · redo | `ArrowCounterClockwiseIcon` · `ArrowClockwiseIcon` |
| Zoom out · zoom in | `MagnifyingGlassMinusIcon` · `MagnifyingGlassPlusIcon` |
| Rotate left · right | `ArrowArcLeftIcon` · `ArrowArcRightIcon` |
| Stage plot symbols | Drawn from `packages/rider-document/src/glyphs.ts` (Phosphor paths in to-scale outlines), never hand-picked per page; render with `RiderSymbolGlyph` |

If a concept isn't in the table, search the codebase for how it's already
drawn (`rg "<.*Icon" -g "*.tsx"`) before choosing, and add new mappings to this
table in the same PR.

## Checklist for a new or redesigned page

- [ ] The header is `<PageHeader>` (not a `Card`), with a back link, actions
      plus a `⋯` menu, pills, the title and the meta line as they apply.
- [ ] Multi-area pages use `<PageTabs>` with route-based tabs, badges and
      unsaved dots.
- [ ] Lists are rows with a summary line, ordered by a stated rule, with one
      primary action per row and a `⋯` menu for the rest.
- [ ] Details open in a keyed `Sheet` with uppercase section headings, a
      deep-link param, and close-on-success only.
- [ ] Every destructive action confirms, with a specific title and verb.
- [ ] Lists search and filter through `FilterBar`, filtering server-side.
- [ ] Only design-system controls; labels wired to inputs; dropdowns don't
      shift the layout.
- [ ] Icons follow [Icons](#icons): Phosphor, the concept table, no size
      class inside `Button`, `aria-label` on icon-only buttons.
- [ ] Empty, loading and read-only states are designed, not blank.
- [ ] Checked in light and dark mode, and at a narrow width (right-hand
      columns drop with `hidden md:block`).
- [ ] `data-testid` on the page root, the summary line, rows, and the sheet,
      for e2e.
