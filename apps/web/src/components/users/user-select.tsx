"use client";

import { CarSimpleIcon, XIcon } from "@phosphor-icons/react";
import { UserAvatar } from "@/components/account/user-avatar";
import { SearchableSelect, type SearchableSelectOption } from "@/components/inventory/searchable-select";
import { cn } from "@/lib/utils";

export type UserSelectOption = SearchableSelectOption & {
  role?: string;
  email?: string;
  status?: "active" | "inactive" | "alumni";
  /** Short context flag next to the name (e.g. crew availability for a section). */
  badge?: { label: string; className: string };
  /** Staff-set: may drive the golf cart (crew staffing shows a "Cart" tag). */
  cartEligible?: boolean;
};

/** Muted "Cart" tag for people staff marked as allowed to drive the golf cart. */
export function CartEligibleTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-md border px-1 py-0.5 text-3xs font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
      title="Cart eligible: can drive the cart to move gear"
    >
      <CarSimpleIcon className="size-3" aria-hidden />
      Cart
    </span>
  );
}

/**
 * Just the cart icon, for tight availability pills (staffing chips, the crew
 * scheduling board). Same icon as the "Cart" tag; labelled for screen readers
 * and with a tooltip.
 */
export function CartEligibleIcon({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Cart eligible"
      title="Cart eligible: can drive the cart to move gear"
      className={cn("inline-flex shrink-0 items-center", className)}
      data-testid="cart-eligible-icon"
    >
      <CarSimpleIcon className="size-3.5" aria-hidden />
    </span>
  );
}

function OptionAvatar({ option }: { option: UserSelectOption }) {
  // The clear entry has no person behind it — an avatar would be nonsense.
  if (!option.value) {
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <XIcon className="size-3.5" />
      </span>
    );
  }
  return (
    <UserAvatar
      name={option.label}
      email={option.email ?? ""}
      userId={option.value}
      imageUrl={option.avatarUrl}
      size="sm"
      pixelSize={24}
      className="size-6 rounded-md"
    />
  );
}

export function UserSelect({
  value,
  onChange,
  options,
  placeholder = "Search users...",
  emptyLabel = "Select user",
  clearable = false,
  contentClassName = "min-w-[min(100%,24rem)]",
  showCartTag = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: UserSelectOption[];
  placeholder?: string;
  emptyLabel?: string;
  /** Offer an entry that clears the selection. */
  clearable?: boolean;
  /** Menu width override (e.g. a wider menu under a narrow trigger). */
  contentClassName?: string;
  /** Tag cart-eligible people (crew staffing). */
  showCartTag?: boolean;
}) {
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      emptyLabel={emptyLabel}
      clearable={clearable}
      contentClassName={contentClassName}
      renderOption={(option) => (
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span className="shrink-0">
            <OptionAvatar option={option as UserSelectOption} />
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-1.5">
              <p className="truncate">{option.label}</p>
              {(option as UserSelectOption).status === "inactive" ? (
                <span className="shrink-0 rounded bg-status-amber-500/15 px-1.5 py-0.5 text-3xs font-medium uppercase tracking-wide text-status-amber-800 dark:text-status-amber-300">
                  Inactive
                </span>
              ) : null}
              {(option as UserSelectOption).badge ? (
                <span
                  className={cn(
                    "shrink-0 rounded-md border px-1.5 py-0.5 text-3xs font-medium uppercase tracking-wide",
                    (option as UserSelectOption).badge?.className,
                  )}
                >
                  {(option as UserSelectOption).badge?.label}
                </span>
              ) : null}
              {showCartTag && (option as UserSelectOption).cartEligible ? <CartEligibleTag /> : null}
            </div>
            {option.description ? (
              <p className="truncate text-xs text-muted-foreground">{option.description}</p>
            ) : null}
          </div>
        </div>
      )}
      renderSelected={(selected) => (
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {selected ? (
            <>
              <span className="shrink-0">
                <OptionAvatar option={selected as UserSelectOption} />
              </span>
              <span className="min-w-0 truncate">{selected.label}</span>
              {showCartTag && (selected as UserSelectOption).cartEligible ? <CartEligibleTag /> : null}
            </>
          ) : (
            <span className="truncate text-muted-foreground">{emptyLabel}</span>
          )}
        </div>
      )}
    />
  );
}
