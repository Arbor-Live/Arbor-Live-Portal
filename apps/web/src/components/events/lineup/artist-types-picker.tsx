"use client";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import {
  ACT_TYPE_OPTIONS,
  TYPE_LABELS,
  normalizeArtistTypes,
  type ArtistNeedActType,
} from "@/components/events/lineup/lineup-model";

/** "Looking for": tag any mix of act types; no tags means no preference. */
export function ArtistTypesPicker({
  value,
  onChange,
  id,
}: {
  value: ArtistNeedActType[];
  onChange: (value: ArtistNeedActType[]) => void;
  id?: string;
}) {
  const anchor = useComboboxAnchor();
  return (
    <Combobox
      multiple
      items={ACT_TYPE_OPTIONS.map((option) => option.value)}
      value={value}
      onValueChange={(next: ArtistNeedActType[]) => onChange(normalizeArtistTypes(next))}
      itemToStringLabel={(type: ArtistNeedActType) => TYPE_LABELS[type]}
    >
      <ComboboxChips ref={anchor}>
        <ComboboxValue>
          {(selected: ArtistNeedActType[]) =>
            selected.map((type) => <ComboboxChip key={type}>{TYPE_LABELS[type]}</ComboboxChip>)
          }
        </ComboboxValue>
        <ComboboxChipsInput
          id={id}
          aria-label="Looking for"
          placeholder={value.length === 0 ? "No preference — any act" : ""}
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No matching type.</ComboboxEmpty>
        <ComboboxList>
          {(type: ArtistNeedActType) => (
            <ComboboxItem key={type} value={type}>
              {TYPE_LABELS[type]}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
