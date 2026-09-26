"use client";

import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import { CheckIcon } from "@phosphor-icons/react";
import { Label } from "@/components/ui/label";
import { SearchableSelect, type SearchableSelectOption } from "@/components/inventory/searchable-select";
import { cn } from "@/lib/utils";
import {
  EVENT_TEAMS,
  EVENT_TYPE_ICONS,
  EVENT_TYPES,
  TEAM_ICONS,
  type EventTeam,
  type EventType,
} from "@/components/events/workspace/event-draft";

/** Labelled form field. The `space-y-1` wrapper is what E2E helpers anchor on. */
export function Field({
  label,
  icon: FieldIcon,
  hint,
  className,
  children,
}: {
  label: string;
  icon?: Icon;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="flex items-center gap-1.5">
        {FieldIcon ? <FieldIcon className="size-3.5 text-muted-foreground" /> : null}
        {label}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const EVENT_TYPE_OPTIONS: SearchableSelectOption[] = EVENT_TYPES.map((type) => ({
  value: type,
  label: type,
}));

function EventTypeOption({ type }: { type: EventType }) {
  const TypeIcon = EVENT_TYPE_ICONS[type];
  return (
    <div className="flex items-center gap-2">
      <TypeIcon className="size-4 text-muted-foreground" />
      <span className="truncate">{type}</span>
    </div>
  );
}

export function EventTypeSelect({
  value,
  onChange,
}: {
  value: EventType;
  onChange: (value: EventType) => void;
}) {
  return (
    <SearchableSelect
      value={value}
      onChange={(next) => onChange(next as EventType)}
      options={EVENT_TYPE_OPTIONS}
      placeholder="Search event types..."
      emptyLabel="Select event type"
      renderOption={(option) => <EventTypeOption type={option.value as EventType} />}
      renderSelected={(option) =>
        option ? (
          <EventTypeOption type={option.value as EventType} />
        ) : (
          <span className="truncate text-muted-foreground">Select event type</span>
        )
      }
    />
  );
}

export function TeamsInterestedPicker({
  value,
  onChange,
  disabled,
}: {
  value: EventTeam[];
  onChange: (value: EventTeam[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {EVENT_TEAMS.map((team) => {
        const selected = value.includes(team);
        const TeamIcon = TEAM_ICONS[team];
        return (
          <button
            key={team}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() =>
              onChange(selected ? value.filter((entry) => entry !== team) : [...value, team])
            }
            className={cn(
              "inline-flex h-8 items-center gap-1.5 border px-2.5 text-sm transition-colors disabled:pointer-events-none disabled:opacity-60",
              selected
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {selected ? (
              <CheckIcon className="size-3.5 text-primary" weight="bold" />
            ) : (
              <TeamIcon className="size-3.5" />
            )}
            {team}
          </button>
        );
      })}
    </div>
  );
}
