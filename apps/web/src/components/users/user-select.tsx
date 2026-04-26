"use client";

import BoringAvatar from "boring-avatars";
import { SearchableSelect, type SearchableSelectOption } from "@/components/inventory/searchable-select";

export type UserSelectOption = SearchableSelectOption & {
  role?: string;
  email?: string;
};

function UserAvatar({ option }: { option: UserSelectOption }) {
  const seed = option.email ?? option.label ?? option.value;
  return (
    <div className="size-6 shrink-0 overflow-hidden rounded-md [&_svg]:!size-full">
      <BoringAvatar
        size={24}
        name={seed}
        variant="beam"
        colors={["#0D9488", "#334155", "#7C3AED", "#EA580C", "#16A34A"]}
      />
    </div>
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
          <UserAvatar option={option as UserSelectOption} />
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
              <UserAvatar option={selected as UserSelectOption} />
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

