"use client";

import { UserAvatar } from "@/components/account/user-avatar";
import { SearchableSelect, type SearchableSelectOption } from "@/components/inventory/searchable-select";

export type UserSelectOption = SearchableSelectOption & {
  role?: string;
  email?: string;
};

function OptionAvatar({ option }: { option: UserSelectOption }) {
  return (
    <UserAvatar
      name={option.label}
      email={option.email ?? ""}
      userId={option.value}
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
}: {
  value: string;
  onChange: (value: string) => void;
  options: UserSelectOption[];
  placeholder?: string;
  emptyLabel?: string;
}) {
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      emptyLabel={emptyLabel}
      renderOption={(option) => (
        <div className="flex items-center gap-2">
          <OptionAvatar option={option as UserSelectOption} />
          <div className="min-w-0">
            <p className="truncate">{option.label}</p>
            {option.description ? <p className="truncate text-xs text-muted-foreground">{option.description}</p> : null}
          </div>
        </div>
      )}
      renderSelected={(selected) => (
        <div className="flex items-center gap-2">
          {selected ? (
            <>
              <OptionAvatar option={selected as UserSelectOption} />
              <span className="truncate">{selected.label}</span>
            </>
          ) : (
            <span className="truncate text-muted-foreground">{emptyLabel}</span>
          )}
        </div>
      )}
    />
  );
}
