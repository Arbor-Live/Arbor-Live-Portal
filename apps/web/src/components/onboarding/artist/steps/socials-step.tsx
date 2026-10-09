import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarketingLinksEditor } from "@/components/marketing/marketing-links-editor";
import { OnboardingAckCheckbox } from "@/components/onboarding/onboarding-ui";
import { ARTIST_TYPES, ARTIST_TYPE_LABELS } from "@/lib/artist-types";
import { slugifyBandName } from "@/lib/validations/bands";
import type { FormState } from "../types";

export function SocialsStep({
  form,
  patch,
}: {
  form: FormState;
  patch: (next: Partial<FormState>) => void;
}) {
  return (
    <div className="space-y-4">
      <MarketingLinksEditor
        idPrefix="band-onboarding-links"
        links={form.artistLinks}
        onLinksChange={(links) => patch({ artistLinks: links })}
        label="Links"
      />

      <div className="space-y-2">
        <Label>Artist type</Label>
        <Select
          value={form.organizationType || undefined}
          onValueChange={(value) => patch({ organizationType: value })}
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

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="band-demo">Demo / listening link</Label>
        <Input
          id="band-demo"
          value={form.demoURL}
          onChange={(event) => patch({ demoURL: event.target.value })}
          placeholder="SoundCloud, Drive…"
        />
      </div>
      <OnboardingAckCheckbox
        checked={form.publicListing}
        onChange={(next) => {
          const nextSlug =
            next && !form.publicSlug.trim()
              ? slugifyBandName(form.displayName)
              : form.publicSlug;
          patch({
            publicListing: next,
            ...(nextSlug !== form.publicSlug ? { publicSlug: nextSlug } : {}),
          });
        }}
        label="List us on the public artists page."
      />
      {form.publicListing ? (
        <div className="space-y-2">
          <Label htmlFor="band-slug">Public URL slug</Label>
          <Input
            id="band-slug"
            value={form.publicSlug}
            onChange={(event) => patch({ publicSlug: event.target.value })}
            placeholder="my-artist-name"
          />
        </div>
      ) : null}
    </div>
  );
}
