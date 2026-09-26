"use client";

import { XIcon } from "@phosphor-icons/react";
import { UserAvatar } from "@/components/account/user-avatar";
import { SearchableSelect, type SearchableSelectOption } from "@/components/inventory/searchable-select";

export type UserSelectOption = SearchableSelectOption & {
  role?: string;
  email?: string;
};

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
}: {
  value: string;
  onChange: (value: string) => void;
  options: UserSelectOption[];
  placeholder?: string;
  emptyLabel?: string;
  /** Offer an entry that clears the selection. */
  clearable?: boolean;
}) {
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      emptyLabel={emptyLabel}
      clearable={clearable}
      contentClassName="min-w-[min(100%,24rem)]"
      renderOption={(option) => (
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span className="shrink-0">
            <OptionAvatar option={option as UserSelectOption} />
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="truncate">{option.label}</p>
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
            </>
          ) : (
            <span className="truncate text-muted-foreground">{emptyLabel}</span>
          )}
        </div>
      )}
    />
  );
}
