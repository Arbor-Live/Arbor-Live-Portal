"use client";

import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { IconPicker } from "@/components/ui/icon-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  emptyMarketingLink,
  linksIncludePartiful,
  type MarketingAdditionalLink,
} from "@/components/marketing/event-marketing-content-fields";
import { guessMarketingLinkIcon } from "@/lib/marketing-link-icons";

const MAX_ADDITIONAL_LINKS = 10;

export function MarketingLinksEditor({
  idPrefix,
  links,
  onLinksChange,
  partifulCohostUrl,
  onPartifulCohostUrlChange,
  disabled = false,
  showCohost = true,
  label = "Links",
}: {
  idPrefix: string;
  links: MarketingAdditionalLink[];
  onLinksChange: (links: MarketingAdditionalLink[]) => void;
  partifulCohostUrl?: string;
  onPartifulCohostUrlChange?: (value: string) => void;
  disabled?: boolean;
  /** Host portals only — admins see a read-only cohost surface separately. */
  showCohost?: boolean;
  label?: string;
}) {
  const rows = links.length > 0 ? links : [emptyMarketingLink()];
  const showPartifulCohost =
    showCohost && Boolean(onPartifulCohostUrlChange) && linksIncludePartiful(rows);

  function updateLink(index: number, patch: Partial<MarketingAdditionalLink>) {
    const next = [...rows];
    next[index] = { ...next[index], ...patch };
    onLinksChange(next);
  }

  function moveLink(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onLinksChange(next);
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {rows.map((link, index) => (
        <div key={`${idPrefix}-link-${index}`} className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex shrink-0 items-center gap-1">
            <div className="flex flex-col">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={disabled || index === 0}
                aria-label={`Move link ${index + 1} up`}
                onClick={() => moveLink(index, -1)}
              >
                <CaretUpIcon className="size-3.5" weight="bold" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={disabled || index >= rows.length - 1}
                aria-label={`Move link ${index + 1} down`}
                onClick={() => moveLink(index, 1)}
              >
                <CaretDownIcon className="size-3.5" weight="bold" />
              </Button>
            </div>
            <IconPicker
              value={link.icon}
              disabled={disabled}
              aria-label={`Icon for link ${index + 1}`}
              onChange={(icon) => updateLink(index, { icon })}
            />
          </div>
          <Input
            value={link.label}
            placeholder="Label (e.g. Partiful RSVP)"
            disabled={disabled}
            className="sm:w-[40%]"
            onChange={(event) => updateLink(index, { label: event.target.value })}
          />
          <Input
            value={link.url}
            placeholder="https://..."
            disabled={disabled}
            className="min-w-0 flex-1"
            onChange={(event) => {
              const nextUrl = event.target.value;
              const guessed = guessMarketingLinkIcon(nextUrl);
              updateLink(index, {
                url: nextUrl,
                ...(guessed && !link.icon ? { icon: guessed } : {}),
              });
            }}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || rows.length >= MAX_ADDITIONAL_LINKS}
        onClick={() => onLinksChange([...rows, emptyMarketingLink()])}
      >
        Add link
      </Button>

      {showPartifulCohost && onPartifulCohostUrlChange ? (
        <div className="space-y-2 rounded-md border border-dashed p-3">
          <Label htmlFor={`${idPrefix}-partiful-cohost`}>Partiful cohost invite (optional)</Label>
          <Input
            id={`${idPrefix}-partiful-cohost`}
            value={partifulCohostUrl ?? ""}
            placeholder="https://partiful.com/e/... (cohost invite)"
            disabled={disabled}
            onChange={(event) => onPartifulCohostUrlChange(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Fully optional. Lets Arbor Live join as a cohost — not shown on the public event page.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Admin-only: host-submitted Partiful cohost invite (not editable here). */
export function PartifulCohostAdminLink({ url }: { url?: string | null }) {
  const href = url?.trim();
  if (!href) return null;
  return (
    <div className="space-y-1 rounded-md border border-dashed p-3">
      <Label>Partiful cohost invite</Label>
      <p className="text-sm">
        <a href={href} target="_blank" rel="noreferrer" className="break-all underline">
          {href}
        </a>
      </p>
      <p className="text-xs text-muted-foreground">Submitted by the host. Not shown publicly.</p>
    </div>
  );
}
