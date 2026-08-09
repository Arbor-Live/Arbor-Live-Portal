"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InventoryTypeSearchSelect } from "@/components/inventory/inventory-search-select";
import { formatTypeDisplay } from "./package-section-utils";
import { StoredAssetImage } from "@/components/files/stored-asset-image";
import { cn } from "@/lib/utils";

export type ContentItemDraft = {
  typeId: string;
  quantity: string;
  role: "primary" | "accessory";
};

export type ContentOptionDraft = {
  key: string;
  name: string;
  items: ContentItemDraft[];
};

/** Unnamed content unit: 1 option = included; 2+ = exclusive pick. */
export type ContentUnitDraft = {
  key: string;
  quantity: string;
  options: ContentOptionDraft[];
};

type InventoryTypeRow = {
  _id: string;
  name: string;
  model: string;
  manufacturer?: string;
  category?: string;
  iconImageUrl?: string;
  promoImageUrl?: string;
};

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyOption(primaryTypeId = ""): ContentOptionDraft {
  return {
    key: newKey(),
    name: "",
    items: [{ typeId: primaryTypeId, quantity: "1", role: "primary" }],
  };
}

export function emptyContentUnit(primaryTypeId = ""): ContentUnitDraft {
  return {
    key: newKey(),
    quantity: "1",
    options: [emptyOption(primaryTypeId)],
  };
}

function parseQuantity(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function QtyStepper({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  const qty = parseQuantity(value);
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 w-8 px-0"
        aria-label={`Decrease ${ariaLabel}`}
        onClick={() => onChange(String(Math.max(1, qty - 1)))}
      >
        −
      </Button>
      <Input
        className="h-8 w-14 px-1 text-center"
        inputMode="numeric"
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d]/g, "");
          onChange(next || "");
        }}
        onBlur={() => {
          if (!value.trim()) onChange("1");
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 w-8 px-0"
        aria-label={`Increase ${ariaLabel}`}
        onClick={() => onChange(String(qty + 1))}
      >
        +
      </Button>
    </div>
  );
}

function TypeLine({
  item,
  typeLookup,
  unitQty,
  onQuantityChange,
  onTypeChange,
  onRemove,
  canRemove,
  indented,
}: {
  item: ContentItemDraft;
  typeLookup: Map<string, InventoryTypeRow>;
  unitQty: number;
  onQuantityChange: (quantity: string) => void;
  onTypeChange: (typeId: string) => void;
  onRemove?: () => void;
  canRemove: boolean;
  indented?: boolean;
}) {
  const type = item.typeId ? typeLookup.get(item.typeId) : null;
  const imageUrl = type?.iconImageUrl || type?.promoImageUrl;
  const packageTotal = parseQuantity(item.quantity) * unitQty;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3",
        indented && "ml-4 border-l border-border/60 pl-3 sm:ml-6",
      )}
      data-testid={item.typeId ? `package-content-row-${item.typeId}` : undefined}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {imageUrl ? (
          <StoredAssetImage
            storedValue={imageUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded object-cover"
            fallbackClassName="h-10 w-10 shrink-0 rounded"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">
            —
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <InventoryTypeSearchSelect value={item.typeId} onChange={onTypeChange} />
          {type ? (
            <p className="truncate text-xs text-muted-foreground">
              {formatTypeDisplay(type)}
              {unitQty > 1 || parseQuantity(item.quantity) > 1
                ? ` · ${packageTotal}× in package`
                : ""}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1">
        <QtyStepper value={item.quantity} onChange={onQuantityChange} ariaLabel="Per-unit quantity" />
        {canRemove && onRemove ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 px-0 text-muted-foreground hover:text-destructive"
            aria-label="Remove"
            onClick={onRemove}
          >
            ×
          </Button>
        ) : (
          <span className="inline-block w-8" aria-hidden />
        )}
      </div>
    </div>
  );
}

function OptionEditor({
  option,
  unitQty,
  typeLookup,
  exclusive,
  optionIndex,
  canRemove,
  onChange,
  onRemove,
}: {
  option: ContentOptionDraft;
  unitQty: number;
  typeLookup: Map<string, InventoryTypeRow>;
  exclusive: boolean;
  optionIndex: number;
  canRemove: boolean;
  onChange: (patch: Partial<ContentOptionDraft>) => void;
  onRemove: () => void;
}) {
  const primary = option.items.find((item) => item.role === "primary") ?? option.items[0];
  const accessories = option.items.filter((item) => item.role === "accessory");
  const primaryIndex = option.items.findIndex((item) => item === primary);

  function updateItem(index: number, patch: Partial<ContentItemDraft>) {
    onChange({
      items: option.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  }

  function removeItem(index: number) {
    onChange({ items: option.items.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-3" data-testid="package-content-option">
      {exclusive ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              Option {optionIndex + 1}
            </span>
            <Input
              className="h-8 max-w-[14rem]"
              value={option.name}
              placeholder="Optional label"
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </div>
          {canRemove ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
            >
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}

      {primary ? (
        <TypeLine
          item={primary}
          typeLookup={typeLookup}
          unitQty={unitQty}
          canRemove={false}
          onQuantityChange={(quantity) => updateItem(primaryIndex, { quantity })}
          onTypeChange={(typeId) => updateItem(primaryIndex, { typeId })}
        />
      ) : null}

      {accessories.map((item) => {
        const index = option.items.indexOf(item);
        return (
          <TypeLine
            key={`${option.key}-acc-${index}`}
            item={item}
            typeLookup={typeLookup}
            unitQty={unitQty}
            indented
            canRemove
            onQuantityChange={(quantity) => updateItem(index, { quantity })}
            onTypeChange={(typeId) => updateItem(index, { typeId })}
            onRemove={() => removeItem(index)}
          />
        );
      })}

      <div className={cn(accessories.length || exclusive ? "ml-4 sm:ml-6" : undefined)}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground"
          onClick={() =>
            onChange({
              items: [...option.items, { typeId: "", quantity: "1", role: "accessory" }],
            })
          }
        >
          + Accessory
        </Button>
      </div>
    </div>
  );
}

export function PackageContentsUnitsEditor({
  units,
  onChange,
  types,
}: {
  units: ContentUnitDraft[];
  onChange: (units: ContentUnitDraft[]) => void;
  types: InventoryTypeRow[];
}) {
  const typeLookup = new Map(types.map((type) => [type._id, type]));

  function updateUnit(key: string, patch: Partial<ContentUnitDraft>) {
    onChange(units.map((unit) => (unit.key === key ? { ...unit, ...patch } : unit)));
  }

  function updateOption(unitKey: string, optionKey: string, patch: Partial<ContentOptionDraft>) {
    onChange(
      units.map((unit) => {
        if (unit.key !== unitKey) return unit;
        return {
          ...unit,
          options: unit.options.map((option) =>
            option.key === optionKey ? { ...option, ...patch } : option,
          ),
        };
      }),
    );
  }

  if (!units.length) {
    return (
      <div
        className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground"
        data-testid="package-contents-units-editor"
      >
        No equipment yet. Add from the catalog.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="package-contents-units-editor">
      {units.map((unit) => {
        const unitQty = parseQuantity(unit.quantity);
        const exclusive = unit.options.length > 1;

        return (
          <div
            key={unit.key}
            className="space-y-4 rounded-md border p-3 sm:p-4"
            data-testid="package-content-unit"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <QtyStepper
                  value={unit.quantity}
                  onChange={(quantity) => updateUnit(unit.key, { quantity })}
                  ariaLabel="Unit quantity"
                />
                {exclusive ? (
                  <span className="text-xs text-muted-foreground">pick one</span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 text-muted-foreground"
                  onClick={() =>
                    updateUnit(unit.key, {
                      options: [...unit.options, emptyOption()],
                    })
                  }
                >
                  + Alternative
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 px-0 text-muted-foreground hover:text-destructive"
                  aria-label="Remove unit"
                  onClick={() => onChange(units.filter((entry) => entry.key !== unit.key))}
                >
                  ×
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {unit.options.map((option, optionIndex) => (
                <div key={option.key} className="space-y-4">
                  {optionIndex > 0 ? (
                    <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
                      <div className="h-px flex-1 bg-border" />
                      or
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  ) : null}
                  <OptionEditor
                    option={option}
                    unitQty={unitQty}
                    typeLookup={typeLookup}
                    exclusive={exclusive}
                    optionIndex={optionIndex}
                    canRemove={unit.options.length > 1}
                    onChange={(patch) => updateOption(unit.key, option.key, patch)}
                    onRemove={() =>
                      updateUnit(unit.key, {
                        options: unit.options.filter((entry) => entry.key !== option.key),
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
