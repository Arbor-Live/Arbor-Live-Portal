"use client";

import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";

export function BandListingProfileFields() {
  return (
    <>
      <TextFormField name="oneLiner" label="Headline" placeholder="Short tagline for your public listing" />
      <TextFormField
        name="genres"
        label="Genres"
        placeholder="Indie, funk, jazz — comma separated"
      />
      <TextFormField name="demoURL" label="Demo link" placeholder="https://..." />
      <TextareaFormField
        name="bandMembers"
        label="Band members"
        placeholder="Names of members who are not on the portal — comma separated"
      />
      <div className="grid gap-2 md:grid-cols-2">
        <TextFormField name="mainContactName" label="Main contact name" />
        <TextFormField name="mainContactEmail" label="Main contact email" type="email" />
        <TextFormField name="mainContactPhone" label="Main contact phone" />
      </div>
    </>
  );
}
