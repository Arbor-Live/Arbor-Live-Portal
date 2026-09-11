"use client";

import { BoringUserAvatar } from "@/components/account/user-avatar";
import { StoredAssetImage } from "@/components/files/stored-asset-image";
import { SearchableSelect, type SearchableSelectOption } from "@/components/inventory/searchable-select";
import { formatUsd } from "@/lib/format";

export type ArtistSelectOption = SearchableSelectOption & {
  memberCount?: number;
  performerHourlyRateUsd?: number;
};

/** Sentinel used on invoice artist rows when the band is not chosen yet. */
export const ARTIST_TBD_VALUE = "__tbd__";

export const ARTIST_TBD_OPTION: ArtistSelectOption = {
  value: ARTIST_TBD_VALUE,
  label: "Band TBD",
  description: "Need to determine",
};

export type ArtistSelectSource = {
  organizationId: string;
  name: string;
  displayName?: string | null;
  slug?: string | null;
  memberCount?: number | null;
  performerHourlyRateUsd?: number | null;
  publicHeroImageUrl?: string | null;
  imageUrl?: string | null;
};

export function buildArtistSelectDescription(band: {
  memberCount?: number | null;
  performerHourlyRateUsd?: number | null;
  slug?: string | null;
}): string {
  const parts: string[] = [];
  if (band.memberCount && band.memberCount > 0) {
    parts.push(`${band.memberCount} ${band.memberCount === 1 ? "person" : "people"}`);
  }
  if (band.performerHourlyRateUsd && band.performerHourlyRateUsd > 0) {
    parts.push(`${formatUsd(band.performerHourlyRateUsd)}/person/hr`);
  }
  if (band.slug?.trim()) parts.push(band.slug.trim());
  return parts.join(" · ");
}

export function toArtistSelectOption(band: ArtistSelectSource): ArtistSelectOption {
  const label = (band.displayName?.trim() || band.name.trim() || "Artist").trim();
  const built = buildArtistSelectDescription(band);
  const description =
    built ||
    (band.displayName && band.displayName !== band.name ? band.name : undefined) ||
    (band.performerHourlyRateUsd !== undefined ? "No rate on file" : undefined);
  return {
    value: band.organizationId,
    label,
    description,
    avatarUrl: band.publicHeroImageUrl || band.imageUrl || undefined,
    keywords: [band.name, band.displayName, band.slug].filter(Boolean).join(" "),
    memberCount: band.memberCount ?? undefined,
    performerHourlyRateUsd: band.performerHourlyRateUsd ?? undefined,
  };
}

export function artistSelectOptions(
  bands: readonly ArtistSelectSource[] | null | undefined,
  opts?: {
    includeTbd?: boolean;
    excludeOrganizationIds?: readonly string[];
  },
): ArtistSelectOption[] {
  const excluded = new Set(opts?.excludeOrganizationIds ?? []);
  const options = (bands ?? [])
    .filter((band) => !excluded.has(band.organizationId))
    .map(toArtistSelectOption)
    .sort((a, b) => a.label.localeCompare(b.label));
  if (opts?.includeTbd) options.unshift(ARTIST_TBD_OPTION);
  return options;
}

function ArtistMark({ option }: { option: ArtistSelectOption }) {
  if (option.avatarUrl) {
    return (
      <StoredAssetImage
        storedValue={option.avatarUrl}
        alt=""
        width={24}
        height={24}
        className="size-6 shrink-0 rounded-md object-cover"
        fallbackClassName="size-6 shrink-0 rounded-md bg-muted"
      />
    );
  }

  // SVG beam avatar — no letter initials in the DOM (keeps trigger textContent
  // equal to the label for e2e `toHaveText` assertions).
  return (
    <BoringUserAvatar
      name={option.label}
      userId={option.value}
      size={24}
      className="size-6 shrink-0 rounded-md"
    />
  );
}

export function ArtistSelect({
  value,
  onChange,
  options,
  placeholder = "Search artists…",
  emptyLabel = "Select artist",
}: {
  value: string;
  onChange: (value: string) => void;
  options: ArtistSelectOption[];
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
      contentClassName="min-w-[min(100%,24rem)]"
      renderOption={(option) => (
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <ArtistMark option={option as ArtistSelectOption} />
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
              <ArtistMark option={selected as ArtistSelectOption} />
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
