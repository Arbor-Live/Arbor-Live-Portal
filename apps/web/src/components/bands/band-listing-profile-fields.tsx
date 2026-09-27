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
import { ARTIST_TYPES, ARTIST_TYPE_LABELS } from "@/lib/artist-types";

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
            <Select value={field.value ?? ""} onValueChange={field.onChange}>
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
