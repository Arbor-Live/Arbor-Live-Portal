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
| Header (back link, status pill, editable title, meta line, `⋯` menu) | `components/events/workspace/event-workspace-header.tsx` |
| Sticky tab nav with badges and unsaved dots | `components/events/workspace/event-workspace-nav.tsx` |
| Page state: draft, dirty sections, save all | `components/events/workspace/event-workspace-provider.tsx` |
| Main + aside grid | `components/events/workspace/tabs/overview-tab.tsx` |
| List rows + side panel (the model for any list) | `components/events/event-artist-bill-section.tsx`, `components/events/lineup/position-sheet.tsx` |
| Grouped rows with a type chip and a coloured rail | `components/events/workspace/run-of-show/run-of-show-editor.tsx`, `run-of-show-styles.tsx` |
| Create dialog with modes | `components/events/lineup/add-to-bill-dialog.tsx` |
| Tabs as routes | `lib/event-editor-tabs.ts`, `app/dashboard/events/[id]/layout.tsx` |

## Layout

**Page shell** (top to bottom, `space-y-4 pb-24`, and the `pb-24` leaves room
for the save bar):

1. **Header.** Not a `Card`. See below.
2. Read-only `Alert`, if the viewer can't edit.
3. **Sticky tab nav**, when the page has more than one area.
4. The active tab's panel.
5. `FormSaveBar tier="C"` for pages with unsaved drafts.

**Header** (`<header className="space-y-3">`):
- Row 1: a ghost `Button` back link on the left (`-ml-2 text-muted-foreground`,
  arrow + parent name), and the page's actions on the right. That's usually one
  or two buttons plus a `⋯` `DropdownMenu` (`DotsThreeIcon`, `align="end"`) for
  secondary and destructive actions.
- Row 2: status pills (`h-7 border px-2.5 text-xs font-semibold`, a coloured
  dot plus a label; the status pill is itself a dropdown when it's editable).
- Title: `text-2xl font-semibold tracking-tight`. For an editable title, use a
  borderless input with the same type that shows a border on hover and focus.
- Meta line: `flex flex-wrap gap-x-5 gap-y-1.5 text-sm` of `MetaItem`s, each a
  muted `size-4` Phosphor icon plus text (date range, venue, type, host,
  manager). A meta item can open a Sheet (e.g. the venue).

**Tabs:**
- Each tab is a real route (`/dashboard/<thing>/<id>/<tab>`), so deep links
  and back/forward work. Keep the tab ids and labels in a `lib/*-tabs.ts`
  module.
- Style: `sticky top-0 z-30 border-b bg-background/95 backdrop-blur`. Each link
  is `border-b-2 px-3 py-2.5 text-sm font-medium`; the active one gets
  `border-primary`, and its icon uses `weight="fill"`.
- A tab can show a small badge: an amber warning count for things that need
  attention (open crew slots), a muted count for size (pull list). It shows a
  `size-1.5 rounded-full bg-primary` dot when that section has unsaved changes.

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
Lineup:

- **A summary line** above the list, `text-sm`, in plain words, joined with
  ` · `: "3 positions · 2 booked · 1 open · $1,200 in payouts (1 unpaid)".
  Give it a `data-testid`.
- **Rows**, not cards: `li` with `border`, `flex items-center gap-2 text-sm`.
  The row's main area is a `button` that opens the side panel
  (`hover:bg-muted/30`, `text-left`).
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
- **Icons:** Phosphor, `size-4`, muted, next to titles and meta; filled weight
  for the active or selected state.
- **Copy:** sentence case, plain words, and what the user can do next ("No run
  of show yet. Build it from the lineup, or quick-add the sections crew work
  in."). Don't label times with a timezone (see app-context).

## Checklist for a new or redesigned page

- [ ] Header is a `<header>`, not a `Card`. It has a back link, actions plus
      a `⋯` menu, status pills, the title, and the meta line.
- [ ] Multi-area pages have route-based sticky tabs with badges and unsaved
      dots.
- [ ] Lists are rows with a summary line, ordered by a stated rule, with one
      primary action per row and a `⋯` menu for the rest.
- [ ] Details open in a keyed `Sheet` with uppercase section headings, a
      deep-link param, and close-on-success only.
- [ ] Every destructive action confirms, with a specific title and verb.
- [ ] Only design-system controls; labels wired to inputs; dropdowns don't
      shift the layout.
- [ ] Empty, loading and read-only states are designed, not blank.
- [ ] Checked in light and dark mode, and at a narrow width (right-hand
      columns drop with `hidden md:block`).
- [ ] `data-testid` on the page root, the summary line, rows, and the sheet,
      for e2e.
