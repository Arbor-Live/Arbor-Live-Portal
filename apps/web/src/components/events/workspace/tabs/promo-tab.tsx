"use client";

import { GlobeIcon, InfoIcon, LockSimpleIcon, type Icon } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EventMarketingSection } from "@/components/events/event-marketing-section";
import { EventMediaSection } from "@/components/events/event-media-section";
import { EventShortLinksCard } from "@/components/marketing/event-short-links-card";
import type { EventVisibility } from "@/lib/event-visibility";
import { cn } from "@/lib/utils";
import { useEventWorkspace } from "@/components/events/workspace/event-workspace-provider";

const VISIBILITY_CHOICES: Array<{
  value: EventVisibility;
  label: string;
  description: string;
  icon: Icon;
}> = [
  {
    value: "public",
    label: "Public",
    description: "Listed on the marketing site and calendar.",
    icon: GlobeIcon,
  },
  {
    value: "internal",
    label: "Internal",
    description: "A real event, visible to staff only.",
    icon: LockSimpleIcon,
  },
  {
    value: "informational",
    label: "Informational",
    description: "Not an event — a staff-only calendar marker.",
    icon: InfoIcon,
  },
];

export function PromoTab() {
  const { eventId, draft, updateDraft, readOnly } = useEventWorkspace();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GlobeIcon className="size-4 text-muted-foreground" />
            Visibility
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div role="radiogroup" aria-label="Visibility" className="grid gap-2 sm:grid-cols-3">
            {VISIBILITY_CHOICES.map((choice) => {
              const selected = draft.visibility === choice.value;
              const ChoiceIcon = choice.icon;
              return (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={readOnly}
                  onClick={() => updateDraft({ visibility: choice.value })}
                  className={cn(
                    "flex items-start gap-3 border p-3 text-left transition-colors disabled:pointer-events-none disabled:opacity-60",
                    selected ? "border-primary bg-primary/5" : "hover:bg-muted",
                  )}
                >
                  <ChoiceIcon
                    className={cn("mt-0.5 size-5 shrink-0", selected ? "text-primary" : "text-muted-foreground")}
                    weight={selected ? "fill" : "regular"}
                  />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">{choice.label}</span>
                    <span className="block text-xs text-muted-foreground">{choice.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <EventMarketingSection eventId={eventId} />
      <EventShortLinksCard eventId={eventId} eventTitle={draft.title} />
      <EventMediaSection eventId={eventId} />
    </div>
  );
}
