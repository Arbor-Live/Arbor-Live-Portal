"use client";

import { TextFormField } from "@/components/forms/text-form-field";

/** Fields shown on the public artists directory and profile page. */
export function BandPublicListingFields() {
  return (
    <>
      <TextFormField name="oneLiner" label="Headline" placeholder="Short tagline for your public listing" />
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

/** @deprecated Use BandPublicListingFields + BandArborPrivateFields */
export function BandListingProfileFields() {
  return (
    <>
      <BandPublicListingFields />
      <BandArborPrivateFields />
    </>
  );
}
