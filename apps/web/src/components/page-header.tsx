"use client";

import Link from "next/link";
import { ArrowLeftIcon, CaretDownIcon, DotsThreeIcon, type Icon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * The dashboard page header, from the event page (the reference design; see
 * the dashboard-design skill). Use it instead of a Card as a page title:
 *
 *   back link ·························· actions [⋯]
 *   [status pills]
 *   Title ······· (actions [⋯] here when there's no back link)
 *   description
 *   meta · meta · meta
 *   {children, e.g. a day switcher}
 */

export type Tone = "neutral" | "blue" | "emerald" | "amber" | "rose";

export const TONE_PILL: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  blue: "border-status-blue-500/30 bg-status-blue-500/15 text-status-blue-700",
  emerald: "border-status-emerald-500/30 bg-status-emerald-500/15 text-status-emerald-700",
  amber: "border-status-amber-500/30 bg-status-amber-500/15 text-status-amber-700",
  rose: "border-status-rose-500/30 bg-status-rose-500/15 text-status-rose-700",
};

export const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  blue: "bg-status-blue-500",
  emerald: "bg-status-emerald-500",
  amber: "bg-status-amber-500",
  rose: "bg-status-rose-500",
};

export function PageHeader({
  back,
  actions,
  menu,
  menuLabel = "More actions",
  pills,
  title,
  description,
  meta,
  children,
  className,
}: {
  back?: { href: string; label: string };
  /** Right-aligned buttons (keep to one or two). */
  actions?: React.ReactNode;
  /** `DropdownMenuItem`s for the `⋯` menu: secondary and destructive actions. */
  menu?: React.ReactNode;
  menuLabel?: string;
  /** `StatusPill`s / `StatusPillSelect`, and links like "Recurring · View series". */
  pills?: React.ReactNode;
  /** A string renders the `h1`; pass a node for an editable title. */
  title: React.ReactNode;
  /** One or two plain sentences under the title: what the page is for. */
  description?: React.ReactNode;
  /** `MetaItem`s. */
  meta?: React.ReactNode;
  /** Anything under the meta line (day switcher, read-only notice). */
  children?: React.ReactNode;
  className?: string;
}) {
  const actionBar =
    actions || menu ? (
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {menu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/* Same height as the `size="sm"` actions beside it. */}
              <Button type="button" variant="outline" size="icon-sm" aria-label={menuLabel}>
                <DotsThreeIcon className="size-4" weight="bold" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {menu}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    ) : null;

  return (
    <header className={cn("space-y-3", className)}>
      {/* With a back link, actions share its row; without one they sit beside
          the title, so they never float above empty space. */}
      {back ? (
        <div className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
            <Link href={back.href}>
              <ArrowLeftIcon />
              {back.label}
            </Link>
          </Button>
          {actionBar}
        </div>
      ) : null}

      <div className="space-y-2">
        {pills ? <div className="flex flex-wrap items-center gap-2">{pills}</div> : null}
        {back || !actionBar ? (
          typeof title === "string" ? <PageTitle>{title}</PageTitle> : title
        ) : (
          // Only the title shares a row with the actions, so the description
          // and meta keep the full width on narrow screens.
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {typeof title === "string" ? <PageTitle>{title}</PageTitle> : title}
            </div>
            {actionBar}
          </div>
        )}
        {description ? <p className="max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
        {meta ? <PageMeta>{meta}</PageMeta> : null}
      </div>

      {children}
    </header>
  );
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>;
}

/** A title the user can rename in place: looks like the `h1` until hovered or focused. */
export function EditablePageTitle({
  value,
  onChange,
  label,
  placeholder,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      {...props}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      placeholder={placeholder}
      className="-mx-1.5 w-full border border-transparent bg-transparent px-1.5 py-0.5 text-2xl font-semibold tracking-tight outline-none hover:border-border focus:border-ring"
    />
  );
}

export function PageMeta({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">{children}</div>;
}

/** Icon + text in the meta line. Pass `onClick` to make it open something (a Sheet). */
export function MetaItem({
  icon: ItemIcon,
  children,
  onClick,
}: {
  icon: Icon;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <ItemIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{children}</span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="inline-flex min-w-0 items-center gap-1.5 hover:underline">
        {content}
      </button>
    );
  }
  return <span className="inline-flex min-w-0 items-center gap-1.5">{content}</span>;
}

export function StatusPill({
  tone,
  dot = true,
  children,
  className,
}: {
  tone: Tone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 border px-2.5 text-xs font-semibold",
        TONE_PILL[tone],
        className,
      )}
    >
      {dot ? <span className={cn("size-1.5 rounded-full", TONE_DOT[tone])} aria-hidden /> : null}
      {children}
    </span>
  );
}

/** A status pill that opens a menu to change the status. Read-only renders the plain pill. */
export function StatusPillSelect<T extends string>({
  value,
  options,
  onChange,
  disabled,
  label = "Status",
}: {
  value: T;
  options: Array<{ value: T; label: string; tone: Tone }>;
  onChange: (value: T) => void;
  disabled?: boolean;
  label?: string;
}) {
  const current = options.find((option) => option.value === value);
  const pill = (
    <StatusPill tone={current?.tone ?? "neutral"}>
      {current?.label ?? value}
      {disabled ? null : <CaretDownIcon className="size-3 opacity-70" aria-hidden />}
    </StatusPill>
  );
  if (disabled) return pill;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`${label}: ${current?.label ?? value}`}>
          {pill}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <span className={cn("size-2 rounded-full", TONE_DOT[option.tone])} aria-hidden />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type PageTab = {
  href: string;
  label: string;
  icon: Icon;
  active: boolean;
  /** A count or warning after the label. */
  badge?: React.ReactNode;
  /** Shows the unsaved-changes dot. */
  dirty?: boolean;
};

/**
 * Sticky, route-based tabs under the header. Each tab is a real URL so deep
 * links and back/forward work. `-mx-6 px-6` bleeds to the dashboard's padding.
 */
export function PageTabs({ tabs, label }: { tabs: PageTab[]; label: string }) {
  return (
    <nav
      aria-label={label}
      className="sticky top-0 z-30 -mx-6 border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                tab.active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              <TabIcon className="size-4" weight={tab.active ? "fill" : "regular"} aria-hidden />
              {tab.label}
              {tab.badge}
              {tab.dirty ? (
                <span
                  className="size-1.5 rounded-full bg-primary"
                  aria-label="Unsaved changes"
                  title="Unsaved changes"
                />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
