"use client";

import { CaretDownIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type MultiSelectOption = {
  value: string;
  label: string;
};

export function MultiSelect({
  label,
  options,
  values,
  onChange,
  emptyLabel = "All",
  className,
}: {
  label: string;
  options: MultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  emptyLabel?: string;
  className?: string;
}) {
  const triggerLabel =
    values.length === 0
      ? emptyLabel
      : values.length === 1
        ? (options.find((option) => option.value === values[0])?.label ?? "1 selected")
        : `${values.length} selected`;

  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-9 min-w-[140px] justify-between gap-2 font-normal"
          >
            <span className="truncate">{triggerLabel}</span>
            <CaretDownIcon className="size-3.5 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={values.includes(option.value)}
              onCheckedChange={(checked) => {
                onChange(
                  checked
                    ? [...values, option.value]
                    : values.filter((value) => value !== option.value),
                );
              }}
              onSelect={(event) => event.preventDefault()}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
