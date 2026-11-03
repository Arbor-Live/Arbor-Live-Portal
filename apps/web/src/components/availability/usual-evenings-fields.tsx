"use client";

import { useState } from "react";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ASKED_WEEKDAYS,
  USUAL_LEVELS,
  WEEKDAYS,
  WEEKDAY_LABELS,
  type UsualEvenings,
  type UsualLevel,
  type Weekday,
} from "@/lib/crew-nights";

/**
 * Thursday, Friday and Saturday always; other evenings once someone adds them.
 * Controlled: the parent saves.
 */
export function UsualEveningsFields({
  value,
  onChange,
  disabled,
  idPrefix = "usual",
}: {
  value: UsualEvenings;
  onChange: (next: UsualEvenings) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const [added, setAdded] = useState<Weekday[]>([]);
  const shown = WEEKDAYS.filter(
    (day) => ASKED_WEEKDAYS.includes(day) || value[day] !== undefined || added.includes(day),
  );
  const addable = WEEKDAYS.filter((day) => !shown.includes(day));

  function setDay(day: Weekday, level: UsualLevel | undefined) {
    const next = { ...value };
    if (level) next[day] = level;
    else delete next[day];
    onChange(next);
  }

  return (
    <div className="space-y-2" data-testid="usual-evenings-fields">
      {shown.map((day) => {
        const optional = !ASKED_WEEKDAYS.includes(day);
        return (
          <div key={day} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span id={`${idPrefix}-${day}`} className="w-24 text-sm font-medium">
              {WEEKDAY_LABELS[day]}
            </span>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={value[day] ?? ""}
              onValueChange={(level) => level && setDay(day, level as UsualLevel)}
              disabled={disabled}
              aria-labelledby={`${idPrefix}-${day}`}
            >
              {USUAL_LEVELS.map((level) => (
                <ToggleGroupItem key={level.value} value={level.value} className="px-3">
                  {level.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {optional ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${WEEKDAY_LABELS[day]}`}
                disabled={disabled}
                onClick={() => {
                  setAdded((current) => current.filter((entry) => entry !== day));
                  setDay(day, undefined);
                }}
              >
                <XIcon />
              </Button>
            ) : null}
          </div>
        );
      })}
      {addable.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={disabled} className="-ml-2.5">
              <PlusIcon weight="bold" />
              Add another evening
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {addable.map((day) => (
              <DropdownMenuItem key={day} onSelect={() => setAdded((current) => [...current, day])}>
                {WEEKDAY_LABELS[day]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
