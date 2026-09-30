"use client";

import { Controller, useFormContext } from "react-hook-form";
import { TextFormField } from "@/components/forms/text-form-field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ARTIST_TYPES, ARTIST_TYPE_LABELS, type ArtistType } from "@/lib/artist-types";

/**
 * The artist-type select is uncontrolled-ish at the DOM level: the native
 * `<select>` shim Radix renders fires `onChange` once on mount with `""` (no
 * option matches the pre-hydration empty value). Treating that as a user edit
 * dirties the form the moment an artist is loaded, so the save bar shows
 * "Unsaved changes" on load. Empty is never a selectable type, so ignore it.
 */
function isArtistType(value: string): value is ArtistType {
  return (ARTIST_TYPES as readonly string[]).includes(value);
}

/** Fields shown on the public artists directory and profile page. */
export function BandPublicListingFields() {
  const { control } = useFormContext();
  return (
    <>
      <TextFormField name="oneLiner" label="Headline" placeholder="Short tagline for your public listing" />
      <Controller
        control={control}
        name="organizationType"
        render={({ field }) => (
          <div className="space-y-2">
            <Label>Artist type</Label>
            <Select
              value={field.value ?? ""}
              onValueChange={(value) => {
                if (!isArtistType(value)) return;
                field.onChange(value);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a type" />
              </SelectTrigger>
              <SelectContent>
                {ARTIST_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {ARTIST_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      />
      <TextFormField
        name="genres"
        label="Genres"
        placeholder="Indie, funk, jazz — comma separated"
      />
      <TextFormField name="demoURL" label="Demo link" placeholder="https://..." />
    </>
  );
}

/** Booking and contact info for Arbor staff — not shown on the public site. */
export function BandArborPrivateFields() {
  return (
    <>
      <div className="grid gap-2 md:grid-cols-2">
        <TextFormField name="mainContactName" label="Main contact name" />
        <TextFormField name="mainContactEmail" label="Main contact email" type="email" />
        <TextFormField name="mainContactPhone" label="Main contact phone" />
        <TextFormField
          name="performerHourlyRateUsd"
          label="Rate per person per hour (USD)"
          type="number"
        />
      </div>
    </>
  );
}
