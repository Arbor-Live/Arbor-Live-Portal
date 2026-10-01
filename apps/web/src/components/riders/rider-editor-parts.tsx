"use client";

import { ArrowDownIcon, ArrowUpIcon, CaretLeftIcon, CaretRightIcon, TrashIcon } from "@phosphor-icons/react";
import {
  PROVIDED_BY_EDITOR_LABELS,
  type RiderContent,
  type RiderProvidedBy,
} from "@arbor/rider-document";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** What every rider editor tab gets: the draft, and a way to change it. */
export type RiderPanelProps = {
  content: RiderContent;
  readOnly: boolean;
  /** `historyKey` groups a run of changes (a drag, typing in one field) into one undo step. */
  onChange: (updater: (content: RiderContent) => RiderContent, historyKey?: string) => void;
};

export const PROVIDED_BY = Object.keys(PROVIDED_BY_EDITOR_LABELS) as RiderProvidedBy[];

/** A labelled control, stacked. */
export function Field({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A `Select` over a fixed set of values with a label map. */
export function OptionSelect<T extends string>({
  id,
  value,
  options,
  labels,
  disabled,
  onChange,
  className,
}: {
  id: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  disabled?: boolean;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <Select value={value} disabled={disabled} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger id={id} className={cn("w-full", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {labels[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Previous / next buttons for a row's side panel, so a band can walk the whole
 * list without closing the panel after every row.
 */
export function SheetStepper({
  index,
  total,
  noun,
  onStep,
}: {
  index: number;
  total: number;
  noun: string;
  onStep: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        disabled={index <= 0}
        aria-label={`Previous ${noun}`}
        onClick={() => onStep(index - 1)}
      >
        <CaretLeftIcon />
      </Button>
      <span className="min-w-14 text-center text-xs tabular-nums text-muted-foreground">
        {index + 1} of {total}
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        disabled={index >= total - 1}
        aria-label={`Next ${noun}`}
        onClick={() => onStep(index + 1)}
      >
        <CaretRightIcon />
      </Button>
    </div>
  );
}

/** The `⋯` items every reorderable rider row shares: edit, move, remove. */
export function RowMenuItems({
  noun,
  index,
  total,
  onOpen,
  onMove,
  onRemove,
}: {
  noun: string;
  index: number;
  total: number;
  onOpen: () => void;
  onMove?: (to: number) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <DropdownMenuItem onSelect={onOpen}>Edit {noun}</DropdownMenuItem>
      {onMove ? (
        <>
          <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(index - 1)}>
            <ArrowUpIcon />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === total - 1} onSelect={() => onMove(index + 1)}>
            <ArrowDownIcon />
            Move down
          </DropdownMenuItem>
        </>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={onRemove}>
        <TrashIcon />
        Remove {noun}
      </DropdownMenuItem>
    </>
  );
}

/** "Band brings it" etc. as a short muted fragment for a row's detail line. */
export function providedByShort(value: RiderProvidedBy): string | null {
  return value === "unknown" ? null : PROVIDED_BY_EDITOR_LABELS[value];
}

/** A switch with its label and a muted line explaining it. */
export function SwitchRow({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}
